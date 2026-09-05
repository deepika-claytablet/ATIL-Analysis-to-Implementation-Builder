/**
 * app.js
 * ADAPT - Custom Conceptual Schema Builder (PAN & ADAT)
 * Main Application Orchestrator & Action Controllers
 */

import { SchemaModel, LINK_TYPES, LINK_LABELS, NODE_TYPES } from './schema-model.js';
import { CanvasEngine } from './canvas.js';
import { InspectorPanel } from './inspector.js';
import { ImageExporter } from './image-exporter.js';
import { DBConverters } from './db-converters.js';
import { SAMPLE_SCHEMAS } from './templates.js';
import { AQLConsole } from './aql/aql-console.js';

class Application {
  constructor() {
    this.currentSchemaName = 'sale';
    this.model = new SchemaModel();
    this.initElements();
    this.canvas = new CanvasEngine(this.model, this.elements);
    this.inspector = new InspectorPanel(this.model, this.canvas, this.elements.inspector);
    this.imageExporter = new ImageExporter(this.canvas, this.model);
    this.dbConverters = new DBConverters(this.model);
    this.aqlConsole = new AQLConsole(this, this.model);

    this.activeConversion = null;

    this.init();
  }

  initElements() {
    this.elements = {
      workspace: document.getElementById('canvas-workspace'),
      viewport: document.getElementById('canvas-viewport'),
      svg: document.getElementById('canvas-svg'),
      nodesContainer: document.getElementById('nodes-container'),
      connectionsGroup: document.getElementById('connections-group'),
      tempLine: document.getElementById('temp-connection-line'),
      inspector: {
        panel: document.getElementById('sidebar-inspector'),
        formContainer: document.getElementById('inspector-form'),
        emptyState: document.getElementById('inspector-empty'),
        titleEl: document.getElementById('inspector-title'),
        closeBtn: document.getElementById('btn-close-inspector')
      }
    };
  }

  init() {
    this.bindCanvasControls();
    this.bindPaletteTools();
    this.bindActionButtons();
    this.bindModals();
    this.bindKeyboardShortcuts();
    this.bindGlobalEvents();

    // Check if there is a saved schema to restore, or load initial sample
    this.restoreOrLoadInitialSchema();
  }

  // --- Initial Schema Restoration / Loading ---

  restoreOrLoadInitialSchema() {
    const lastSchemaName = localStorage.getItem('adapt_last_schema');
    if (lastSchemaName) {
      const savedData = localStorage.getItem(`adapt_schema_${lastSchemaName}`);
      if (savedData) {
        try {
          const json = JSON.parse(savedData);
          this.currentSchemaName = lastSchemaName;
          this.model.fromJSON(json);
          this.updateSchemaNameBadge(lastSchemaName);
          setTimeout(() => this.canvas.fitToScreen(), 100);
          return;
        } catch (e) {
          console.warn('Failed to restore cached schema:', e);
        }
      }
    }

    // Default: load sample schema
    this.loadSampleSchema();
  }

  loadSampleSchema() {
    this.currentSchemaName = 'sale';
    this.model.fromJSON(SAMPLE_SCHEMAS.sale);
    this.updateSchemaNameBadge(this.currentSchemaName);
    this.inspector?.collapse();
    this.canvas.deselectAll();
    setTimeout(() => {
      this.canvas.fitToScreen();
    }, 100);
  }

  updateSchemaNameBadge(name) {
    this.currentSchemaName = name;
    const badge = document.getElementById('schema-current-name');
    if (badge) {
      badge.textContent = `[${name}]`;
    }
  }

  // --- Header Canvas Controls ---

  bindCanvasControls() {
    document.getElementById('btn-undo')?.addEventListener('click', () => this.model.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.model.redo());
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.canvas.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.canvas.zoomOut());
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => this.canvas.fitToScreen());
    
    document.getElementById('btn-clear')?.addEventListener('click', () => {
      if (confirm('Clear the entire schema canvas?')) {
        this.model.clear();
        this.showToast('Canvas cleared', 'info');
      }
    });

    document.getElementById('btn-sample-schema')?.addEventListener('click', () => {
      this.loadSampleSchema();
      this.showToast('Loaded multi-level sample schema', 'success');
    });

    document.getElementById('btn-open-schema')?.addEventListener('click', () => {
      this.openLoadSchemaModal();
    });
  }

  // --- Palette Connector Selection ---

  bindPaletteTools() {
    const toolBtns = document.querySelectorAll('.connector-tool-btn');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const linkType = btn.getAttribute('data-link-type');
        this.canvas.setActiveLinkType(linkType);

        const label = LINK_LABELS[linkType] || linkType;
        this.showToast(`Selected Line Tool: ${label}`, 'info');
      });
    });
  }

  // --- Top Bar Action Buttons ---

  bindActionButtons() {
    // 1. Main SAVE Button: Opens modal to name schema and export all files
    document.getElementById('btn-save-image')?.addEventListener('click', () => {
      this.openSaveImageModal();
    });

    // 2. "Convert to Logical" Dropdown Menu
    const convertBtn = document.getElementById('btn-convert-logical');
    const convertMenu = document.getElementById('dropdown-convert-menu');
    convertBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      convertMenu?.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      convertMenu?.classList.add('hidden');
    });

    // 2a. Relational choice
    document.getElementById('btn-to-relational')?.addEventListener('click', () => {
      convertMenu?.classList.add('hidden');
      this.runConversion('relational');
    });

    // 2b. Column Family choice (commented out for later cleanup)
    // document.getElementById('btn-to-columnfamily')?.addEventListener('click', () => {
    //   convertMenu?.classList.add('hidden');
    //   this.runConversion('columnfamily');
    // });

    // Notify AQL Console when schema changes
    this.model.subscribe(() => {
      this.aqlConsole?.populateSampleQueries();
    });
  }

  // --- Modal Logic ---

  bindModals() {
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
      });
    });

    // Schema Name Input listener to update preview folder text
    const nameInput = document.getElementById('save-schema-name');
    nameInput?.addEventListener('input', (e) => {
      const sanitized = e.target.value.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
      const previewFolder = document.getElementById('preview-folder-name');
      if (previewFolder) {
        previewFolder.textContent = sanitized ? `${sanitized}/` : '[Enter Schema Name Above]/';
      }
      nameInput.style.borderColor = sanitized ? '#2563EB' : '#DC2626';
    });

    document.getElementById('export-format')?.addEventListener('change', () => this.updateImagePreview());
    document.getElementById('export-scale')?.addEventListener('change', () => this.updateImagePreview());
    document.getElementById('export-bg')?.addEventListener('change', () => this.updateImagePreview());

    // Execute Save & Export All into named schema folder
    document.getElementById('btn-do-download-image')?.addEventListener('click', async () => {
      // 1. Validate standalone nodes must have at least one attribute
      const validation = this.model.validateStandaloneAttributes();
      if (!validation.valid) {
        this.showToast(validation.message, 'error');
        alert(validation.message);
        if (validation.node) {
          this.canvas.selectElement('node', validation.node.id);
          this.inspector?.expand();
        }
        return;
      }

      const inputEl = document.getElementById('save-schema-name');
      const rawName = inputEl?.value?.trim();

      // User must explicitly provide the schema name
      if (!rawName) {
        if (inputEl) {
          inputEl.style.borderColor = '#DC2626';
          inputEl.focus();
        }
        this.showToast('Please type a name for the schema folder.', 'error');
        return;
      }

      const schemaName = rawName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
      if (!schemaName) {
        if (inputEl) {
          inputEl.style.borderColor = '#DC2626';
          inputEl.focus();
        }
        this.showToast('Please enter a valid schema name with alphanumeric characters.', 'error');
        return;
      }

      const format = document.getElementById('export-format')?.value || 'png';
      const scale = parseInt(document.getElementById('export-scale')?.value, 10) || 2;
      const bg = document.getElementById('export-bg')?.value || '#ffffff';

      try {
        const result = await this.imageExporter.saveExportPackage(schemaName, format, scale, bg);
        this.updateSchemaNameBadge(schemaName);

        // Also trigger image download in browser
        if (format === 'svg') {
          const svgStr = this.imageExporter.generateSVGString(bg);
          this.imageExporter.downloadFile(svgStr, `${schemaName}_diagram.svg`, 'image/svg+xml');
        } else {
          const raster = await this.imageExporter.exportToRaster(format, scale, bg);
          this.imageExporter.downloadDataUrl(raster.dataUrl, `${schemaName}_diagram.${format}`);
        }

        if (result.success && result.savedFiles.length > 0) {
          this.showToast(`Saved schema into folder "schemas/${schemaName}/" with ${result.savedFiles.length} files!`, 'success');
        } else {
          const isab = this.imageExporter.generateISABFile();
          this.imageExporter.downloadFile(isab, 'ISAB.TXT', 'text/plain');
          this.showToast(`Schema "${schemaName}" saved and exported successfully!`, 'success');
        }

        document.getElementById('modal-save-image')?.classList.add('hidden');
      } catch (err) {
        console.error(err);
        this.showToast('Error exporting schema: ' + err.message, 'error');
      }
    });

    // File input to load schema from local JSON file
    document.getElementById('input-load-schema-file')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target.result);
          const name = file.name.replace(/\.json$/i, '');
          this.model.fromJSON(json);
          this.updateSchemaNameBadge(name);
          this.canvas.fitToScreen();
          this.showToast(`Loaded schema from ${file.name}`, 'success');
          document.getElementById('modal-load-schema')?.classList.add('hidden');
        } catch (err) {
          this.showToast('Invalid schema JSON file: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    });

    // Conversion Modal Actions: Copy Code and Download File
    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      if (this.activeConversion?.code) {
        navigator.clipboard.writeText(this.activeConversion.code)
          .then(() => this.showToast('Copied code to clipboard!', 'success'))
          .catch(() => this.showToast('Could not copy code', 'error'));
      }
    });

    document.getElementById('btn-download-code')?.addEventListener('click', () => {
      if (this.activeConversion?.code && this.activeConversion?.fileName) {
        const mime = this.activeConversion.fileName.endsWith('.sql') ? 'text/x-sql' : 'text/plain';
        this.imageExporter.downloadFile(this.activeConversion.code, this.activeConversion.fileName, mime);
        this.showToast(`Downloaded ${this.activeConversion.fileName}!`, 'success');
      }
    });

    // Conversion modal tab switching
    document.querySelectorAll('.db-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.db-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const targetTab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(targetTab)?.classList.remove('hidden');
      });
    });
  }

  async openSaveImageModal() {
    const modal = document.getElementById('modal-save-image');
    if (!modal) return;
    
    // Start with blank input so user writes the name explicitly
    const nameInput = document.getElementById('save-schema-name');
    if (nameInput) {
      nameInput.value = '';
      nameInput.style.borderColor = '#2563EB';
      const previewFolder = document.getElementById('preview-folder-name');
      if (previewFolder) previewFolder.textContent = '[Type Schema Name Above]/';
      setTimeout(() => nameInput.focus(), 150);
    }

    modal.classList.remove('hidden');
    await this.updateImagePreview();
  }

  async updateImagePreview() {
    const previewContainer = document.getElementById('image-export-preview');
    if (!previewContainer) return;

    previewContainer.innerHTML = '<span class="preview-loading">Generating preview...</span>';

    try {
      const format = document.getElementById('export-format')?.value || 'png';
      const bg = document.getElementById('export-bg')?.value || '#ffffff';

      const res = await this.imageExporter.exportToRaster(format === 'svg' ? 'png' : format, 1, bg);
      previewContainer.innerHTML = `<img src="${res.dataUrl}" alt="Schema Preview" />`;
    } catch (e) {
      previewContainer.innerHTML = `<span style="color:#DC2626">Preview unavailable</span>`;
    }
  }

  // --- Run Conversions via Embedded Java Engine ---

  async runConversion(type = 'relational') {
    // 1. Validate that standalone nodes must have at least one attribute
    const validation = this.model.validateStandaloneAttributes();
    if (!validation.valid) {
      this.showToast(validation.message, 'error');
      alert(validation.message);
      if (validation.node) {
        this.canvas.selectElement('node', validation.node.id);
        this.inspector?.expand();
      }
      return;
    }

    const schemaName = this.currentSchemaName || 'ADAPT_Schema';

    // 2. Requirement 2: Auto-save is triggered whenever convert is clicked
    try {
      await this.imageExporter.saveExportPackage(schemaName, 'png', 2, '#ffffff');
    } catch (saveErr) {
      console.warn('Auto-save pre-conversion warning:', saveErr);
    }

    this.showToast(`Saved schema into schemas/${schemaName}/. Converting to ${type === 'relational' ? 'Relational SQL' : 'Column Family'}...`, 'info');

    // Package current files
    const panFiles = this.imageExporter.generatePANFiles();
    const adatFiles = this.imageExporter.generateADATFiles();
    const isabContent = this.imageExporter.generateISABFile();
    const adatAdatMultilevelContent = this.imageExporter.generateAdatAdatMultilevelFile();
    const panPanMultilevelContent = this.imageExporter.generatePanPanMultilevelFile();
    const inputContent = this.imageExporter.generateInputFile();
    const schemaData = this.model.toJSON();

    const payload = {
      schemaName,
      type,
      panFiles,
      adatFiles,
      isabContent,
      adatAdatMultilevelContent,
      panPanMultilevelContent,
      inputContent,
      schemaData
    };

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Conversion failed.');
      }

      const isRelational = type === 'relational';
      const outputFileName = resData.outputFileName || (isRelational ? 'output.sql' : 'output_cf.txt');
      const code = resData.code || '-- No output generated';

      this.activeConversion = {
        type,
        schemaName,
        fileName: outputFileName,
        code: code
      };

      // Open and populate modal
      const modal = document.getElementById('modal-db-convert');
      if (modal) {
        document.getElementById('db-modal-title').textContent = isRelational 
          ? `Relational Schema (${outputFileName})` 
          : `Column Family Schema (${outputFileName})`;
        
        document.getElementById('db-modal-subtitle').textContent = isRelational
          ? `Generated via forStarRelational() and saved as schemas/${schemaName}/${outputFileName}`
          : `Generated via forColumnFamily() and saved as schemas/${schemaName}/${outputFileName}`;

        document.getElementById('code-lang-label').textContent = isRelational ? 'SQL' : 'CQL / HBASE';
        document.getElementById('converted-code-output').textContent = code;

        // Explanation tab
        const explanationEl = document.getElementById('converted-explanation-output');
        if (explanationEl) {
          explanationEl.innerHTML = `
            <h4>Conversion Details</h4>
            <p><strong>Schema Folder:</strong> <code>schemas/${this.escapeHtml(schemaName)}/</code></p>
            <p><strong>Generated File:</strong> <code>schemas/${this.escapeHtml(schemaName)}/${this.escapeHtml(outputFileName)}</code></p>
            <p><strong>Engine Function:</strong> <code>${isRelational ? 'forStarRelational()' : 'forColumnFamily()'}</code></p>
            <hr style="margin: 0.75rem 0; border: 0; border-top: 1px solid var(--border-color);" />
            <p style="font-size:0.82rem; color:var(--text-muted);">
              ${isRelational 
                ? 'Includes initial <code>create database ' + this.escapeHtml(schemaName) + ';</code> and <code>use ' + this.escapeHtml(schemaName) + ';</code> statements.' 
                : 'Includes initial <code>create keyspace ' + this.escapeHtml(schemaName) + ';</code> statement.'}
            </p>
          `;
        }

        // Sample data tab
        const sampleEl = document.getElementById('converted-sample-output');
        if (sampleEl) {
          sampleEl.textContent = resData.rawOutput || code;
        }

        // Update download button label
        const dlBtn = document.getElementById('btn-download-code');
        if (dlBtn) {
          dlBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Save as ${this.escapeHtml(outputFileName)}</span>
          `;
        }

        modal.classList.remove('hidden');
      }

      this.showToast(`Successfully generated ${outputFileName}!`, 'success');
    } catch (err) {
      console.error(err);
      this.showToast('Conversion error: ' + err.message, 'error');
    }
  }

  // --- Open / Retrieve Saved Schemas ---

  async openLoadSchemaModal() {
    const modal = document.getElementById('modal-load-schema');
    if (!modal) return;
    modal.classList.remove('hidden');

    const container = document.getElementById('saved-schemas-list-container');
    container.innerHTML = '<div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.85rem;">Searching for saved schemas...</div>';

    let schemaList = [];

    // 1. Fetch saved schemas from backend API
    try {
      const response = await fetch('/api/schemas');
      if (response.ok) {
        const data = await response.json();
        schemaList = data.schemas || [];
      }
    } catch (e) {
      console.warn('Backend API /api/schemas not reachable, querying localStorage:', e);
    }

    // 2. Also check localStorage for saved schemas
    const localKeys = Object.keys(localStorage).filter(k => k.startsWith('adapt_schema_'));
    localKeys.forEach(k => {
      const name = k.replace('adapt_schema_', '');
      if (!schemaList.some(s => s.name === name)) {
        schemaList.push({
          name,
          source: 'localStorage',
          updatedAt: Date.now() / 1000
        });
      }
    });

    if (schemaList.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted);">
          <div style="font-size:1.75rem; margin-bottom:0.5rem;">📂</div>
          <p style="font-weight:600; color:var(--text-main);">No saved schemas found</p>
          <p style="font-size:0.78rem; margin-top:0.25rem;">Create a schema on canvas and click <strong>SAVE</strong> to create your first saved schema folder.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = schemaList.map(s => {
      const dateStr = s.updatedAt ? new Date(s.updatedAt * 1000).toLocaleString() : 'Recently saved';
      return `
        <div class="saved-schema-card">
          <div class="saved-schema-meta">
            <span class="saved-schema-title">📁 ${this.escapeHtml(s.name)}</span>
            <span class="saved-schema-date">Last modified: ${dateStr}</span>
          </div>
          <button class="btn-load-schema-action" data-schema-name="${this.escapeHtml(s.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            <span>Load</span>
          </button>
        </div>
      `;
    }).join('');

    // Bind click events on Load buttons
    container.querySelectorAll('.btn-load-schema-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const schemaName = btn.getAttribute('data-schema-name');
        await this.loadSavedSchemaByName(schemaName);
        modal.classList.add('hidden');
      });
    });
  }

  async loadSavedSchemaByName(schemaName) {
    this.inspector?.collapse();
    this.canvas.deselectAll();
    try {
      // 1. Try loading from backend API
      const response = await fetch(`/api/schema/${encodeURIComponent(schemaName)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.schema) {
          this.model.fromJSON(data.schema);
          this.updateSchemaNameBadge(schemaName);
          localStorage.setItem('adapt_last_schema', schemaName);
          setTimeout(() => this.canvas.fitToScreen(), 100);
          this.showToast(`Retrieved schema "${schemaName}" successfully!`, 'success');
          return;
        }
      }
    } catch (e) {
      console.warn(`Could not load schema ${schemaName} from server, checking local cache:`, e);
    }

    // 2. Fallback to localStorage
    const localData = localStorage.getItem(`adapt_schema_${schemaName}`);
    if (localData) {
      try {
        const json = JSON.parse(localData);
        this.model.fromJSON(json);
        this.updateSchemaNameBadge(schemaName);
        localStorage.setItem('adapt_last_schema', schemaName);
        setTimeout(() => this.canvas.fitToScreen(), 100);
        this.showToast(`Retrieved schema "${schemaName}" from local storage!`, 'success');
        return;
      } catch (e) {
        this.showToast(`Failed to parse schema "${schemaName}"`, 'error');
      }
    }

    this.showToast(`Could not find schema "${schemaName}"`, 'error');
  }

  // --- Keyboard Shortcuts ---

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.model.undo();
      }

      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        this.model.redo();
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.canvas.selectedElement) {
          e.preventDefault();
          const { type, id } = this.canvas.selectedElement;
          if (type === 'node') {
            this.model.removeNode(id);
          } else if (type === 'edge') {
            this.model.removeEdge(id);
          }
          this.canvas.deselectAll();
          this.showToast('Element deleted', 'info');
        }
      }

      if (e.key === '0') {
        this.canvas.fitToScreen();
      }
    });
  }

  // --- Global Event Handling & Toast ---

  bindGlobalEvents() {
    window.addEventListener('show_toast', (e) => {
      this.showToast(e.detail.message, e.detail.type);
    });
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    let icon = 'ℹ️';
    let borderColor = 'var(--primary)';
    if (type === 'success') {
      icon = '✅';
      borderColor = '#059669';
    } else if (type === 'error') {
      icon = '⚠️';
      borderColor = '#DC2626';
    }

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    toast.style.borderColor = borderColor;
    toast.classList.remove('hidden');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new Application();
});
