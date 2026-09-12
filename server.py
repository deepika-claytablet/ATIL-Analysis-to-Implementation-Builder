#!/usr/bin/env python3
"""
server.py
Local HTTP server and backend API for ADAPT (Custom Conceptual Schema Builder)
Supports saving named schemas into dedicated folders with:
  - PANCSVFiles/ (<PAN NAME>.TXT)
  - AdatCSVFiles/ (<ADAT NAME>.TXT)
  - ISAB.TXT
  - AdatAdatMultilevel.Txt
  - PanPanMultilevel.txt
  - Input.txt
  - Diagram images (.png, .svg)
  - schema_data.json (for instant schema retrieval)
and running Tological conversions to:
  - Relational Schema (output.sql with "create database <name>; use <name>;")
  - Column Family (output_cf.txt with "create keyspace <name>;")
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import json
import base64
import urllib.parse
import subprocess

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
SCHEMAS_DIR = os.path.join(DIRECTORY, 'schemas')
os.makedirs(SCHEMAS_DIR, exist_ok=True)

def migrate_loose_schemas():
    """Migrates any existing schema folders from root into schemas/ directory."""
    ignore_folders = {'PANCSVFiles', 'AdatCSVFiles', 'css', 'js', 'lib', 'src', 'target', 'test_bin', 'schemas', 'saved_schemas', '__pycache__', '.git'}
    for item in os.listdir(DIRECTORY):
        item_path = os.path.join(DIRECTORY, item)
        if os.path.isdir(item_path) and item not in ignore_folders:
            schema_json = os.path.join(item_path, 'schema_data.json')
            if os.path.exists(schema_json):
                target_dest = os.path.join(SCHEMAS_DIR, item)
                if not os.path.exists(target_dest):
                    try:
                        import shutil
                        shutil.move(item_path, target_dest)
                        print(f" [ADAPT] Migrated schema '{item}' to schemas/{item}")
                    except Exception as e:
                        print(f" [ADAPT] Could not migrate '{item}': {e}")

migrate_loose_schemas()

def sanitize_sql_output(raw_sql):
    if not raw_sql:
        return ""
    import re
    # 1. In analysis_property insert statements, ensure cardinality is enclosed in single quotes: e.g. '*  *'
    def fix_analysis_property(match):
        adat = match.group(1).strip()
        attr = match.group(2).strip()
        pan = match.group(3).strip()
        additive = match.group(4).strip()
        card = match.group(5).strip().strip("'\"")
        applicability = match.group(6).strip()
        return f"insert into analysis_property (Adat, Attribute, Pan, is_Additive,cardinality,Applicability) values ('{adat}', '{attr}', '{pan}', {additive}, '{card}', {applicability});"

    pattern = r"insert\s+into\s+analysis_property\s*\([^)]*\)\s*values\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(true|false)\s*,\s*([^,]+)\s*,\s*(true|false)\s*\)\s*;?"
    sanitized = re.sub(pattern, fix_analysis_property, raw_sql, flags=re.IGNORECASE)

    # 2. Fix any misplaced semicolons inside PRIMARY KEY (...);)
    sanitized = re.sub(r'PRIMARY\s+KEY\s*\(([^)]+)\)\s*;\s*\)', r'PRIMARY KEY (\1)\n)', sanitized, flags=re.IGNORECASE)

    # 3. Ensure every CREATE TABLE statement terminates with a semicolon ';'
    lines = sanitized.splitlines()
    fixed_lines = []
    
    for line in lines:
        stripped = line.strip()
        if stripped == ")":
            line = ");"
        elif stripped.endswith(")") and not stripped.endswith(");") and not ("PRIMARY KEY" in stripped or "foreign key" in stripped or "references" in stripped):
            line = line + ";"
        fixed_lines.append(line)
        
    return "\n".join(fixed_lines)

def sanitize_cf_output(raw_output):
    if not raw_output:
        return ""
    import re
    # Convert all Numeric / numeric datatypes to decimal
    sanitized = re.sub(r'\bNumeric\b', 'decimal', raw_output, flags=re.IGNORECASE)
    # Strip any redundant old create keyspace lines if present
    sanitized = re.sub(r'create\s+keyspace\s+[^;]+;\s*', '', sanitized, flags=re.IGNORECASE)
    return sanitized

def get_java_bin():
    possible_paths = [
        r"C:\Program Files\Java\jdk-17\bin\java.exe",
        r"C:\Program Files\Java\jdk\bin\java.exe",
        "java"
    ]
    for p in possible_paths:
        if os.path.exists(p) or p == "java":
            return p
    return "java"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        # API: List all saved schemas
        if parsed_path.path == '/api/schemas':
            try:
                schemas = []
                search_dirs = [SCHEMAS_DIR, DIRECTORY, os.path.join(DIRECTORY, 'saved_schemas')]
                seen = set()

                for base_dir in search_dirs:
                    if not os.path.exists(base_dir):
                        continue
                    for item in os.listdir(base_dir):
                        item_path = os.path.join(base_dir, item)
                        if os.path.isdir(item_path) and item not in ('PANCSVFiles', 'AdatCSVFiles', 'css', 'js', 'lib', 'src', 'target', 'test_bin', 'schemas', 'saved_schemas', '__pycache__', '.git'):
                            schema_json_path = os.path.join(item_path, 'schema_data.json')
                            if os.path.exists(schema_json_path) and item not in seen:
                                seen.add(item)
                                stat = os.stat(schema_json_path)
                                schemas.append({
                                    'name': item,
                                    'path': item_path,
                                    'updatedAt': stat.st_mtime
                                })

                schemas.sort(key=lambda s: s['updatedAt'], reverse=True)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'schemas': schemas}).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # API: Get specific schema data by name
        elif parsed_path.path.startswith('/api/schema/'):
            schema_name = urllib.parse.unquote(parsed_path.path[len('/api/schema/'):])
            safe_name = "".join(c for c in schema_name if c.isalnum() or c in (' ', '_', '-')).strip()
            
            target_path = os.path.join(SCHEMAS_DIR, safe_name, 'schema_data.json')
            if not os.path.exists(target_path):
                target_path = os.path.join(DIRECTORY, safe_name, 'schema_data.json')
            if not os.path.exists(target_path):
                target_path = os.path.join(DIRECTORY, 'saved_schemas', safe_name, 'schema_data.json')

            if os.path.exists(target_path):
                try:
                    with open(target_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': True, 'schema': data, 'name': safe_name}).encode('utf-8'))
                    return
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                    return
            else:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Schema {safe_name} not found'}).encode('utf-8'))
                return

        super().do_GET()

    def do_POST(self):
        if self.path == '/api/save':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)

                raw_schema_name = data.get('schemaName', 'My_ADAPT_Schema').strip()
                import re
                schema_name = re.sub(r'[\s\-]+', '_', re.sub(r'[^a-zA-Z0-9_\-\s]', '', raw_schema_name)).strip()
                if not schema_name:
                    schema_name = 'ADAPT_Schema'

                saved_files = []

                # Create dedicated Schema Folder inside schemas/<SCHEMA NAME>/
                schema_dir = os.path.join(SCHEMAS_DIR, schema_name)
                os.makedirs(schema_dir, exist_ok=True)

                # 1. Create subfolders inside schemas/<SCHEMA NAME>/: PANCSVFiles and AdatCSVFiles
                pan_dir = os.path.join(schema_dir, 'PANCSVFiles')
                adat_dir = os.path.join(schema_dir, 'AdatCSVFiles')
                os.makedirs(pan_dir, exist_ok=True)
                os.makedirs(adat_dir, exist_ok=True)

                # 2. Save PAN files in schemas/<SCHEMA NAME>/PANCSVFiles/<PAN_NAME>.TXT
                pan_files = data.get('panFiles', {})
                for filename, content in pan_files.items():
                    safe_name = re.sub(r'[\s\-]+', '_', "".join(c for c in filename if c.isalnum() or c in (' ', '.', '_', '-')).strip())
                    if not safe_name.upper().endswith('.TXT'):
                        safe_name += '.TXT'
                    file_path = os.path.join(pan_dir, safe_name)
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    saved_files.append(f'schemas/{schema_name}/PANCSVFiles/{safe_name}')

                # 3. Save ADAT files in schemas/<SCHEMA NAME>/AdatCSVFiles/<ADAT_NAME>.TXT
                adat_files = data.get('adatFiles', {})
                for filename, content in adat_files.items():
                    safe_name = re.sub(r'[\s\-]+', '_', "".join(c for c in filename if c.isalnum() or c in (' ', '.', '_', '-')).strip())
                    if not safe_name.upper().endswith('.TXT'):
                        safe_name += '.TXT'
                    file_path = os.path.join(adat_dir, safe_name)
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    saved_files.append(f'schemas/{schema_name}/AdatCSVFiles/{safe_name}')

                # 4. Save ISAB.TXT inside schemas/<SCHEMA NAME>/ISAB.TXT
                isab_content = data.get('isabContent', '')
                isab_path = os.path.join(schema_dir, 'ISAB.TXT')
                with open(isab_path, 'w', encoding='utf-8') as f:
                    f.write(isab_content)
                saved_files.append(f'schemas/{schema_name}/ISAB.TXT')

                # 5. Save AdatAdatMultilevel.Txt inside schemas/<SCHEMA NAME>/
                adat_ml_content = data.get('adatAdatMultilevelContent', '')
                adat_ml_path = os.path.join(schema_dir, 'AdatAdatMultilevel.Txt')
                with open(adat_ml_path, 'w', encoding='utf-8') as f:
                    f.write(adat_ml_content)
                saved_files.append(f'schemas/{schema_name}/AdatAdatMultilevel.Txt')

                # 6. Save PanPanMultilevel.txt inside schemas/<SCHEMA NAME>/
                pan_ml_content = data.get('panPanMultilevelContent', '')
                pan_ml_path = os.path.join(schema_dir, 'PanPanMultilevel.txt')
                with open(pan_ml_path, 'w', encoding='utf-8') as f:
                    f.write(pan_ml_content)
                saved_files.append(f'schemas/{schema_name}/PanPanMultilevel.txt')

                # 7. Save Input.txt inside schemas/<SCHEMA NAME>/
                input_content = data.get('inputContent', '')
                input_path = os.path.join(schema_dir, 'Input.txt')
                with open(input_path, 'w', encoding='utf-8') as f:
                    f.write(input_content)
                saved_files.append(f'schemas/{schema_name}/Input.txt')

                # 8. Save image diagram file inside schemas/<SCHEMA NAME>/
                image_data = data.get('imageData', '')
                image_format = data.get('imageFormat', 'png').lower()
                image_name = f'{schema_name}_diagram.{image_format}'
                image_path = os.path.join(schema_dir, image_name)

                if image_data.startswith('data:image/'):
                    header, b64_str = image_data.split(',', 1)
                    with open(image_path, 'wb') as f:
                        f.write(base64.b64decode(b64_str))
                    saved_files.append(f'schemas/{schema_name}/{image_name}')
                elif image_format == 'svg' or '<svg' in image_data:
                    with open(image_path, 'w', encoding='utf-8') as f:
                        f.write(image_data)
                    saved_files.append(f'schemas/{schema_name}/{image_name}')

                # 9. Save schema_data.json for instant retrieval upon reload/restart
                schema_data = data.get('schemaData', {})
                schema_data['name'] = schema_name
                schema_data_path = os.path.join(schema_dir, 'schema_data.json')
                with open(schema_data_path, 'w', encoding='utf-8') as f:
                    json.dump(schema_data, f, indent=2)
                saved_files.append(f'schemas/{schema_name}/schema_data.json')

                response = {
                    'success': True,
                    'schemaName': schema_name,
                    'message': f'Successfully saved schema "{schema_name}" and created {len(saved_files)} files in folder "schemas/{schema_name}".',
                    'savedFiles': saved_files
                }

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
                print(f" [ADAPT Save] Successfully created folder 'schemas/{schema_name}' with {len(saved_files)} files:")
                for sf in saved_files:
                    print(f"    - {sf}")

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
                print(f" [Error] Failed to save schema: {e}", file=sys.stderr)

        elif self.path == '/api/convert':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)

                raw_schema_name = data.get('schemaName', 'ADAPT_Schema').strip()
                import re
                schema_name = re.sub(r'[\s\-]+', '_', re.sub(r'[^a-zA-Z0-9_\-\s]', '', raw_schema_name)).strip() or 'ADAPT_Schema'
                conversion_type = data.get('type', 'relational').lower().strip()

                schema_dir = os.path.join(SCHEMAS_DIR, schema_name)
                os.makedirs(schema_dir, exist_ok=True)

                # Ensure schema files are up to date if provided
                if 'panFiles' in data:
                    pan_dir = os.path.join(schema_dir, 'PANCSVFiles')
                    os.makedirs(pan_dir, exist_ok=True)
                    for fn, cnt in data['panFiles'].items():
                        sf = re.sub(r'[\s\-]+', '_', "".join(c for c in fn if c.isalnum() or c in (' ', '.', '_', '-')).strip())
                        if not sf.upper().endswith('.TXT'): sf += '.TXT'
                        with open(os.path.join(pan_dir, sf), 'w', encoding='utf-8') as f:
                            f.write(cnt)

                if 'adatFiles' in data:
                    adat_dir = os.path.join(schema_dir, 'AdatCSVFiles')
                    os.makedirs(adat_dir, exist_ok=True)
                    for fn, cnt in data['adatFiles'].items():
                        sf = re.sub(r'[\s\-]+', '_', "".join(c for c in fn if c.isalnum() or c in (' ', '.', '_', '-')).strip())
                        if not sf.upper().endswith('.TXT'): sf += '.TXT'
                        with open(os.path.join(adat_dir, sf), 'w', encoding='utf-8') as f:
                            f.write(cnt)

                if 'isabContent' in data:
                    with open(os.path.join(schema_dir, 'ISAB.TXT'), 'w', encoding='utf-8') as f:
                        f.write(data['isabContent'])

                if 'adatAdatMultilevelContent' in data:
                    with open(os.path.join(schema_dir, 'AdatAdatMultilevel.Txt'), 'w', encoding='utf-8') as f:
                        f.write(data['adatAdatMultilevelContent'])

                if 'panPanMultilevelContent' in data:
                    with open(os.path.join(schema_dir, 'PanPanMultilevel.txt'), 'w', encoding='utf-8') as f:
                        f.write(data['panPanMultilevelContent'])

                if 'inputContent' in data:
                    with open(os.path.join(schema_dir, 'Input.txt'), 'w', encoding='utf-8') as f:
                        f.write(data['inputContent'])

                # Run Java Tological engine
                java_bin = get_java_bin()
                cp_str = f"target{os.sep}classes;lib{os.sep}guava.jar"
                java_choice = "starrelational" if "relational" in conversion_type or "star" in conversion_type else "columnfamily"

                cmd = [
                    java_bin,
                    "-cp", cp_str,
                    "com.claytablet.tological.Tological",
                    schema_dir,
                    java_choice,
                    schema_name
                ]

                print(f" [ADAPT Convert] Executing: {' '.join(cmd)}")
                proc = subprocess.run(cmd, cwd=DIRECTORY, capture_output=True, text=True)

                if proc.returncode != 0 and not os.path.exists(os.path.join(schema_dir, 'output.txt')):
                    err_msg = proc.stderr or proc.stdout or 'Conversion process failed.'
                    print(f" [Error] Java execution error: {err_msg}", file=sys.stderr)
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'error': err_msg}).encode('utf-8'))
                    return

                # Read raw output from output.txt
                output_txt_path = os.path.join(schema_dir, 'output.txt')
                raw_output = ""
                if os.path.exists(output_txt_path):
                    with open(output_txt_path, 'r', encoding='utf-8', errors='replace') as f:
                        raw_output = f.read().strip()
                elif proc.stdout:
                    raw_output = proc.stdout.strip()

                if "relational" in conversion_type or "star" in conversion_type:
                    # 2. For Relational: Save as output.sql with headers
                    output_file_name = "output.sql"
                    sql_header = f"create database {schema_name};\nuse {schema_name};\n\n"
                    final_code = sql_header + sanitize_sql_output(raw_output)
                    output_file_path = os.path.join(schema_dir, output_file_name)
                    with open(output_file_path, 'w', encoding='utf-8') as f:
                        f.write(final_code)
                else:
                    # 3. For Column Family: Save as output_cf.txt with headers
                    output_file_name = "output_cf.txt"
                    cf_header = (
                        f"CREATE KEYSPACE {schema_name}\n"
                        f"WITH replication = {{\n"
                        f"    'class': 'SimpleStrategy',\n"
                        f"    'replication_factor': 1\n"
                        f"}};\n\n"
                    )
                    final_code = cf_header + sanitize_cf_output(raw_output)
                    output_file_path = os.path.join(schema_dir, output_file_name)
                    with open(output_file_path, 'w', encoding='utf-8') as f:
                        f.write(final_code)

                response = {
                    'success': True,
                    'schemaName': schema_name,
                    'conversionType': conversion_type,
                    'code': final_code,
                    'rawOutput': raw_output,
                    'outputFileName': output_file_name,
                    'outputFilePath': output_file_path,
                    'stdout': proc.stdout
                }

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
                print(f" [ADAPT Convert] Successfully converted schema '{schema_name}' ({conversion_type}) -> schemas/{schema_name}/{output_file_name}")

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
                print(f" [Error] Failed conversion: {e}", file=sys.stderr)

        else:
            self.send_error(404, 'Endpoint not found')

def main():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 65)
        print(" [ADAPT] Conceptual Schema Builder (PAN & ADAT)")
        print("=" * 65)
        print(f" Serving at: {url}")
        print(" Press Ctrl+C to stop the server.")
        print("=" * 65)
        
        try:
            webbrowser.open(url)
        except Exception:
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.server_close()

if __name__ == "__main__":
    main()
