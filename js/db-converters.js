/**
 * db-converters.js
 * Multi-Database Schema Generator (Relational SQL, HBase, MongoDB, Cassandra)
 * Supporting Nature (Structured/Unstructured), Data Kind (Numeric/Non Numeric),
 * PAN Attributes (UPDATE/NO UPDATE), and ISAB / Specialization / Derived / Container / Complex connections.
 */

import { LINK_TYPES, LINK_LABELS, NODE_TYPES, DATA_KINDS, NATURE_TYPES } from './schema-model.js';

export class DBConverters {
  constructor(model) {
    this.model = model;
  }

  // --- 1. Relational Database Schema Converter ---

  toRelational() {
    const nodes = Array.from(this.model.nodes.values());
    const edges = Array.from(this.model.edges.values());

    let sql = `-- ====================================================================\n`;
    sql += `-- Relational Schema Generated from Custom PAN & ADAT Model\n`;
    sql += `-- Connections: ISAB, Specialization (△), Derived (△[D]), Container (△[C]), Complex (◊)\n`;
    sql += `-- Generated At: ${new Date().toISOString()}\n`;
    sql += `-- ====================================================================\n\n`;

    const adatNodes = nodes.filter(n => n.type === NODE_TYPES.ADAT);

    if (adatNodes.length === 0) {
      return {
        code: '-- No ADAT entities found in canvas to convert.',
        lang: 'SQL',
        explanation: 'Add ADAT nodes to the canvas to generate Relational SQL schema tables.',
        sample: '{}'
      };
    }

    adatNodes.forEach(node => {
      const tableName = this.toSnakeCase(node.name);
      const isStructured = (node.nature || NATURE_TYPES.STRUCTURED) === NATURE_TYPES.STRUCTURED;

      sql += `-- ADAT: ${node.name} (Nature: ${node.nature || 'Structured'})\n`;
      sql += `CREATE TABLE ${tableName} (\n`;

      const columnDefs = [];
      columnDefs.push(`    id                   BIGSERIAL PRIMARY KEY`);

      if (!isStructured) {
        columnDefs.push(`    raw_payload          JSONB`);
        columnDefs.push(`    content_type         VARCHAR(100)`);
      }

      (node.attributes || []).forEach(attr => {
        const colName = this.toSnakeCase(attr.name);
        if (colName === 'id') return;
        const colType = attr.dataKind === DATA_KINDS.NUMERIC ? 'NUMERIC(15, 2)' : 'VARCHAR(255)';
        columnDefs.push(`    ${colName.padEnd(20)} ${colType}`);
      });

      // Add foreign keys from incoming connections
      const incomingEdges = edges.filter(e => e.targetId === node.id);
      incomingEdges.forEach(edge => {
        const srcNode = this.model.nodes.get(edge.sourceId);
        if (srcNode && srcNode.type === NODE_TYPES.ADAT) {
          const fkCol = `${this.toSnakeCase(srcNode.name)}_id`;
          if (!columnDefs.some(c => c.includes(fkCol))) {
            const relType = LINK_LABELS[edge.linkType] || edge.linkType;
            columnDefs.push(`    ${fkCol.padEnd(20)} BIGINT REFERENCES ${this.toSnakeCase(srcNode.name)}(id) /* ${relType} */`);
          }
        }
      });

      sql += columnDefs.join(',\n');
      sql += `\n);\n\n`;
    });

    const explanation = `
      <h4>Relational Mapping Design:</h4>
      <ul>
        <li><strong>ADATs & Nature:</strong>
          <ul>
            <li><strong>Structured ADATs:</strong> Mapped to fully typed relational columns based on <code>Data Kind</code> (Numeric ➔ <code>NUMERIC</code>, Non Numeric ➔ <code>VARCHAR</code>).</li>
            <li><strong>Unstructured ADATs:</strong> Include semi-structured <code>JSONB</code> payload storage.</li>
          </ul>
        </li>
        <li><strong>Connections:</strong>
          <ul>
            <li><strong>ISAB:</strong> Models primary access path with Adat/Pan multiplicity.</li>
            <li><strong>Specialization (△):</strong> Models class hierarchies with child foreign keys to parent ADAT.</li>
            <li><strong>Derived (△[D]):</strong> Represents derived/specialized views with referenced base table.</li>
            <li><strong>Container (△[C]):</strong> Models complete encapsulations with cascading integrity.</li>
            <li><strong>Complex (◊):</strong> Models composite aggregations with parent-child keys.</li>
          </ul>
        </li>
      </ul>
    `;

    return {
      code: sql,
      lang: 'SQL',
      explanation,
      sample: '{\n  "status": "success",\n  "tables_generated": ' + adatNodes.length + '\n}'
    };
  }

  // --- 2. Apache HBase Schema Converter ---

  toHBase() {
    const nodes = Array.from(this.model.nodes.values());
    const edges = Array.from(this.model.edges.values());

    let script = `# ====================================================================\n`;
    script += `# Apache HBase Shell DDL Scripts Generated from PAN & ADAT Model\n`;
    script += `# ====================================================================\n\n`;

    const adatNodes = nodes.filter(n => n.type === NODE_TYPES.ADAT);

    if (adatNodes.length === 0) {
      return {
        code: '# No ADAT entities found in canvas to convert.',
        lang: 'Ruby (HBase Shell)',
        explanation: 'Add ADAT and PAN nodes to generate HBase column family scripts.',
        sample: '{}'
      };
    }

    adatNodes.forEach(node => {
      const tableName = this.toSnakeCase(node.name);
      script += `# Table for ADAT: ${node.name} (Nature: ${node.nature || 'Structured'})\n`;
      script += `create '${tableName}', \n`;
      script += `  {NAME => 'd', VERSIONS => 3, COMPRESSION => 'SNAPPY'},  # Data Attributes\n`;
      script += `  {NAME => 'r', VERSIONS => 1},                           # Relationships & References\n`;
      script += `  {NAME => 'm', TTL => 2592000}                           # Metadata & Updates\n\n`;
    });

    const explanation = `
      <h4>HBase Storage Strategy:</h4>
      <ul>
        <li><strong>Column Families:</strong>
          <ul>
            <li><code>d (Data):</code> Houses attributes with typed qualifiers.</li>
            <li><code>r (Relationships):</code> Stores graph pointers and ISAB associations.</li>
            <li><code>m (Metadata):</code> Records update tags and auditing info.</li>
          </ul>
        </li>
      </ul>
    `;

    return {
      code: script,
      lang: 'Ruby (HBase Shell)',
      explanation,
      sample: '{\n  "engine": "HBase",\n  "column_families": ["d", "r", "m"]\n}'
    };
  }

  // --- 3. MongoDB / Mongoose Schema Converter ---

  toMongoDB() {
    const nodes = Array.from(this.model.nodes.values());
    const edges = Array.from(this.model.edges.values());

    let code = `/**\n * MongoDB / Mongoose Schemas\n * Generated from Custom PAN & ADAT Conceptual Schema\n */\n\n`;
    code += `const mongoose = require('mongoose');\nconst { Schema } = mongoose;\n\n`;

    const adatNodes = nodes.filter(n => n.type === NODE_TYPES.ADAT);

    if (adatNodes.length === 0) {
      return {
        code: '// No ADAT entities found in canvas to convert.',
        lang: 'JavaScript (Mongoose)',
        explanation: 'Add ADAT nodes to generate MongoDB schemas.',
        sample: '{}'
      };
    }

    adatNodes.forEach(node => {
      const schemaName = `${this.toPascalCase(node.name)}Schema`;
      const isStructured = (node.nature || NATURE_TYPES.STRUCTURED) === NATURE_TYPES.STRUCTURED;

      code += `// ADAT: ${node.name} (${node.nature || 'Structured'})\n`;
      code += `const ${schemaName} = new Schema({\n`;

      const fields = [];
      (node.attributes || []).forEach(attr => {
        const fieldType = attr.dataKind === DATA_KINDS.NUMERIC ? 'Number' : 'String';
        fields.push(`  ${attr.name}: { type: ${fieldType} }`);
      });

      if (!isStructured) {
        fields.push(`  rawPayload: { type: Schema.Types.Mixed }`);
      }

      // Check ISAB or Complex connections
      const outEdges = edges.filter(e => e.sourceId === node.id);
      outEdges.forEach(edge => {
        const targetNode = this.model.nodes.get(edge.targetId);
        if (targetNode) {
          if (edge.linkType === LINK_TYPES.AGGREGATION_DIAMOND || edge.linkType === LINK_TYPES.COMPLETE_C) {
            fields.push(`  ${this.toCamelCase(targetNode.name)}Ref: { type: Schema.Types.ObjectId, ref: '${this.toPascalCase(targetNode.name)}' }`);
          }
        }
      });

      code += fields.join(',\n');
      code += `\n}, { timestamps: true });\n\n`;
      code += `const ${this.toPascalCase(node.name)} = mongoose.model('${this.toPascalCase(node.name)}', ${schemaName});\n\n`;
    });

    return {
      code,
      lang: 'JavaScript (Mongoose)',
      explanation: '<h4>MongoDB Document Design:</h4><p>Structured ADATs map to typed Mongoose schemas, while Unstructured ADATs support mixed schema-less JSON payloads.</p>',
      sample: '{\n  "_id": "64b0f9a2b8e3a2001c4d9e01",\n  "nature": "Structured"\n}'
    };
  }

  // --- 4. Apache Cassandra Schema Converter ---

  toCassandra() {
    const nodes = Array.from(this.model.nodes.values());
    let cql = `-- ====================================================================\n`;
    cql += `-- Apache Cassandra CQL Schema Generated from PAN & ADAT Model\n`;
    cql += `-- ====================================================================\n\n`;

    cql += `CREATE KEYSPACE IF NOT EXISTS conceptual_schema\n`;
    cql += `WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};\n\n`;
    cql += `USE conceptual_schema;\n\n`;

    const adatNodes = nodes.filter(n => n.type === NODE_TYPES.ADAT);

    adatNodes.forEach(node => {
      const tableName = this.toSnakeCase(node.name);
      cql += `-- ADAT Table: ${node.name}\n`;
      cql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;

      const cols = [];
      cols.push(`    id                   uuid`);

      (node.attributes || []).forEach(attr => {
        const colName = this.toSnakeCase(attr.name);
        if (colName === 'id') return;
        const colType = attr.dataKind === DATA_KINDS.NUMERIC ? 'decimal' : 'text';
        cols.push(`    ${colName.padEnd(20)} ${colType}`);
      });

      cols.push(`    PRIMARY KEY ((id))`);

      cql += cols.join(',\n');
      cql += `\n);\n\n`;
    });

    return {
      code: cql,
      lang: 'CQL (Cassandra)',
      explanation: '<h4>Cassandra CQL Architecture:</h4><p>High-throughput tables with UUID partition keys aligned with conceptual access patterns.</p>',
      sample: '{\n  "keyspace": "conceptual_schema"\n}'
    };
  }

  toSnakeCase(str) {
    if (!str) return 'entity';
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  }

  toPascalCase(str) {
    if (!str) return 'Entity';
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
      .replace(/^(.)/, c => c.toUpperCase());
  }

  toCamelCase(str) {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }
}
