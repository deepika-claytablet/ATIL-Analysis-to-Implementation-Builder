/**
 * inspector.js
 * Property Inspector & Dynamic Node/Edge Editor Panel
 */

import { LINK_TYPES, LINK_LABELS, NODE_TYPES, DATA_KINDS, NATURE_TYPES, UPDATE_TYPES, BOOLEAN_OPTIONS } from './schema-model.js';

function replaceSpacesWithUnderscores(inputEl) {
  if (!inputEl) return '';
  const origVal = inputEl.value;
  const newVal = origVal.replace(/\s/g, '_');
  if (origVal !== newVal) {
    const selStart = inputEl.selectionStart;
    const selEnd = inputEl.selectionEnd;
    inputEl.value = newVal;
    if (selStart !== null && selEnd !== null) {
      inputEl.setSelectionRange(selStart, selEnd);
    }
  }
  return inputEl.value;
}

export class InspectorPanel {
  constructor(model, canvasEngine, elements) {
    this.model = model;
    this.canvas = canvasEngine;
    this.panel = elements.panel;
    this.formContainer = elements.formContainer;
    this.emptyState = elements.emptyState;
    this.titleEl = elements.titleEl;
    this.closeBtn = elements.closeBtn;

    this.selected = null; // { type: 'node' | 'edge', id }

    this.init();
  }

  init() {
    window.addEventListener('element_selected', (e) => {
      this.selected = e.detail;
      this.expand();
      this.render();
    });

    window.addEventListener('element_deselected', () => {
      this.selected = null;
      this.render();
    });

    const headerBar = document.getElementById('inspector-header-bar');
    if (headerBar) {
      headerBar.addEventListener('click', (e) => {
        if (e.target.id === 'btn-close-inspector' || e.target.closest('#btn-close-inspector')) {
          return;
        }
        this.toggle();
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
        this.canvas.deselectAll();
      });
    }
  }

  expand() {
    if (this.panel) {
      this.panel.classList.remove('collapsed');
    }
  }

  collapse() {
    if (this.panel) {
      this.panel.classList.add('collapsed');
    }
  }

  toggle() {
    if (this.panel) {
      this.panel.classList.toggle('collapsed');
    }
  }

  render() {
    if (!this.selected) {
      this.emptyState.classList.remove('hidden');
      this.formContainer.classList.add('hidden');
      this.titleEl.textContent = 'Properties';
      return;
    }

    this.emptyState.classList.add('hidden');
    this.formContainer.classList.remove('hidden');

    if (this.selected.type === 'node') {
      const node = this.model.nodes.get(this.selected.id);
      if (!node) return;

      if (node.type === NODE_TYPES.PAN) {
        this.renderPANForm(node);
      } else {
        this.renderADATForm(node);
      }
    } else if (this.selected.type === 'edge') {
      const edge = this.model.edges.get(this.selected.id);
      if (!edge) return;
      this.renderEdgeForm(edge);
    }
  }

  // --- PAN Properties Form ---
  renderPANForm(node) {
    this.titleEl.innerHTML = `<span class="node-badge pan-tag">PAN</span> ${this.escapeHtml(node.name)}`;

    const attributesHtml = (node.attributes || []).map((attr) => `
      <div class="attr-item-edit" data-attr-id="${attr.id}">
        <input type="text" class="pan-attr-name-input" value="${this.escapeHtml(attr.name)}" placeholder="attribute_name">
        <select class="pan-attr-update-select" title="Update Option">
          <option value="${UPDATE_TYPES.NO_UPDATE}" ${(attr.updateType || UPDATE_TYPES.NO_UPDATE) === UPDATE_TYPES.NO_UPDATE ? 'selected' : ''}>NO UPDATE</option>
          <option value="${UPDATE_TYPES.UPDATE}" ${(attr.updateType || UPDATE_TYPES.NO_UPDATE) === UPDATE_TYPES.UPDATE ? 'selected' : ''}>UPDATE</option>
        </select>
        <button class="btn-remove-attr btn-remove-pan-attr" title="Delete Attribute" data-attr-id="${attr.id}">✕</button>
      </div>
    `).join('');

    this.formContainer.innerHTML = `
      <div class="form-group">
        <label>PAN Name</label>
        <input type="text" id="pan-input-name" class="form-control" value="${this.escapeHtml(node.name)}">
      </div>

      <div class="form-group">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label>Attributes (${(node.attributes || []).length})</label>
          <button id="btn-add-pan-attr" class="btn-sm btn-outline" style="font-size:0.75rem; padding: 0.25rem 0.6rem; font-weight:700;">+ Add Attribute</button>
        </div>
        <div class="attributes-editor-list" id="pan-attributes-list-container">
          ${attributesHtml || '<div style="font-size:0.78rem; color:var(--text-dim); text-align:center; padding:0.6rem; background:#F8FAFC; border-radius:4px; border:1px dashed var(--border-dark);">No attributes yet (Click + Add Attribute)</div>'}
        </div>
      </div>

      <div style="margin-top: 1.25rem;">
        <button id="btn-delete-pan" class="btn btn-secondary" style="color: #DC2626; width: 100%; border-color: #FECACA;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          <span>Delete PAN</span>
        </button>
      </div>
    `;

    document.getElementById('pan-input-name').addEventListener('input', (e) => {
      const val = replaceSpacesWithUnderscores(e.target);
      this.model.updateNode(node.id, { name: val });
      this.titleEl.innerHTML = `<span class="node-badge pan-tag">PAN</span> ${this.escapeHtml(node.name)}`;
    });

    document.getElementById('btn-add-pan-attr').addEventListener('click', () => {
      const attrs = [...(node.attributes || [])];
      attrs.push({
        id: this.model.generateId('pan_attr'),
        name: `attr_${attrs.length + 1}`,
        updateType: UPDATE_TYPES.NO_UPDATE
      });
      this.model.updateNode(node.id, { attributes: attrs });
      this.renderPANForm(node);
      window.dispatchEvent(new CustomEvent('show_toast', { detail: { message: 'Attribute added to PAN', type: 'success' } }));
    });

    document.querySelectorAll('.btn-remove-pan-attr').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const attrId = btn.getAttribute('data-attr-id');
        const filtered = (node.attributes || []).filter(a => a.id !== attrId);
        this.model.updateNode(node.id, { attributes: filtered });
        this.renderPANForm(node);
        window.dispatchEvent(new CustomEvent('show_toast', { detail: { message: 'Attribute deleted', type: 'info' } }));
      });
    });

    document.querySelectorAll('.pan-attr-name-input').forEach(input => {
      const row = input.closest('.attr-item-edit');
      const attrId = row.getAttribute('data-attr-id');
      const attr = (node.attributes || []).find(a => a.id === attrId);
      if (!attr) return;

      input.addEventListener('input', (e) => {
        const val = replaceSpacesWithUnderscores(e.target);
        attr.name = val;
        this.model.updateNode(node.id, { attributes: node.attributes });
      });
    });

    document.querySelectorAll('.pan-attr-update-select').forEach(select => {
      const row = select.closest('.attr-item-edit');
      const attrId = row.getAttribute('data-attr-id');
      const attr = (node.attributes || []).find(a => a.id === attrId);
      if (!attr) return;

      select.addEventListener('change', (e) => {
        attr.updateType = e.target.value;
        this.model.updateNode(node.id, { attributes: node.attributes });
      });
    });

    document.getElementById('btn-delete-pan').addEventListener('click', () => {
      this.model.removeNode(node.id);
    });
  }

  // --- ADAT Properties Form ---
  renderADATForm(node) {
    this.titleEl.innerHTML = `<span class="node-badge adat-tag">ADAT</span> ${this.escapeHtml(node.name)}`;

    const attributesHtml = (node.attributes || []).map((attr) => `
      <div class="attr-item-edit" data-attr-id="${attr.id}">
        <input type="text" class="adat-attr-name-input" value="${this.escapeHtml(attr.name)}" placeholder="attribute_name">
        <select class="adat-attr-kind-select" title="Data Kind">
          <option value="${DATA_KINDS.NUMERIC}" ${attr.dataKind === DATA_KINDS.NUMERIC ? 'selected' : ''}>Numeric</option>
          <option value="${DATA_KINDS.NON_NUMERIC}" ${attr.dataKind === DATA_KINDS.NON_NUMERIC ? 'selected' : ''}>Non Numeric</option>
        </select>
        <button class="btn-remove-attr btn-remove-adat-attr" title="Delete Attribute" data-attr-id="${attr.id}">✕</button>
      </div>
    `).join('');

    this.formContainer.innerHTML = `
      <div class="form-group">
        <label>ADAT Name</label>
        <input type="text" id="adat-input-name" class="form-control" value="${this.escapeHtml(node.name)}">
      </div>

      <div class="form-group">
        <label>Nature</label>
        <select id="adat-input-nature" class="form-control">
          <option value="${NATURE_TYPES.STRUCTURED}" ${node.nature === NATURE_TYPES.STRUCTURED ? 'selected' : ''}>Structured</option>
          <option value="${NATURE_TYPES.UNSTRUCTURED}" ${node.nature === NATURE_TYPES.UNSTRUCTURED ? 'selected' : ''}>Unstructured</option>
        </select>
      </div>

      <div class="form-group">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label>Attributes (${(node.attributes || []).length})</label>
          <button id="btn-add-adat-attr" class="btn-sm btn-outline" style="font-size:0.75rem; padding: 0.25rem 0.6rem; font-weight:700;">+ Add Attribute</button>
        </div>
        <div class="attributes-editor-list" id="adat-attributes-list-container">
          ${attributesHtml || '<div style="font-size:0.78rem; color:var(--text-dim); text-align:center; padding:0.6rem; background:#F8FAFC; border-radius:4px; border:1px dashed var(--border-dark);">No attributes yet (Click + Add Attribute)</div>'}
        </div>
      </div>

      <div style="margin-top: 1.25rem;">
        <button id="btn-delete-adat" class="btn btn-secondary" style="color: #DC2626; width: 100%; border-color: #FECACA;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          <span>Delete ADAT</span>
        </button>
      </div>
    `;

    document.getElementById('adat-input-name').addEventListener('input', (e) => {
      const val = replaceSpacesWithUnderscores(e.target);
      this.model.updateNode(node.id, { name: val });
      this.titleEl.innerHTML = `<span class="node-badge adat-tag">ADAT</span> ${this.escapeHtml(node.name)}`;
    });

    document.getElementById('adat-input-nature').addEventListener('change', (e) => {
      this.model.updateNode(node.id, { nature: e.target.value });
    });

    document.getElementById('btn-add-adat-attr').addEventListener('click', () => {
      const attrs = [...(node.attributes || [])];
      attrs.push({
        id: this.model.generateId('attr'),
        name: `attr_${attrs.length + 1}`,
        dataKind: DATA_KINDS.NON_NUMERIC
      });
      this.model.updateNode(node.id, { attributes: attrs });
      this.renderADATForm(node);
      window.dispatchEvent(new CustomEvent('show_toast', { detail: { message: 'Attribute added to ADAT', type: 'success' } }));
    });

    document.querySelectorAll('.btn-remove-adat-attr').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const attrId = btn.getAttribute('data-attr-id');
        const filtered = (node.attributes || []).filter(a => a.id !== attrId);
        this.model.updateNode(node.id, { attributes: filtered });
        this.renderADATForm(node);
        window.dispatchEvent(new CustomEvent('show_toast', { detail: { message: 'Attribute deleted', type: 'info' } }));
      });
    });

    document.querySelectorAll('.adat-attr-name-input').forEach(input => {
      const row = input.closest('.attr-item-edit');
      const attrId = row.getAttribute('data-attr-id');
      const attr = (node.attributes || []).find(a => a.id === attrId);
      if (!attr) return;

      input.addEventListener('input', (e) => {
        const val = replaceSpacesWithUnderscores(e.target);
        attr.name = val;
        this.model.updateNode(node.id, { attributes: node.attributes });
      });
    });

    document.querySelectorAll('.adat-attr-kind-select').forEach(select => {
      const row = select.closest('.attr-item-edit');
      const attrId = row.getAttribute('data-attr-id');
      const attr = (node.attributes || []).find(a => a.id === attrId);
      if (!attr) return;

      select.addEventListener('change', (e) => {
        attr.dataKind = e.target.value;
        this.model.updateNode(node.id, { attributes: node.attributes });
      });
    });

    document.getElementById('btn-delete-adat').addEventListener('click', () => {
      this.model.removeNode(node.id);
    });
  }

  // --- Connection / Relationship Properties Form ---
  renderEdgeForm(edge) {
    const sourceNode = this.model.nodes.get(edge.sourceId);
    const targetNode = this.model.nodes.get(edge.targetId);

    const currentLabel = LINK_LABELS[edge.linkType] || edge.linkType;
    this.titleEl.innerHTML = `<span>Connection: <strong>${currentLabel}</strong></span>`;

    const isPanPan = (sourceNode?.type === NODE_TYPES.PAN && targetNode?.type === NODE_TYPES.PAN);
    const isAdatPan = ((sourceNode?.type === NODE_TYPES.PAN && targetNode?.type === NODE_TYPES.ADAT) ||
                       (sourceNode?.type === NODE_TYPES.ADAT && targetNode?.type === NODE_TYPES.PAN));
    const isISAB = (edge.linkType === LINK_TYPES.SOLID);

    // Custom Source/Target labels
    let sourceRoleLabel = 'Source';
    let targetRoleLabel = 'Target';

    if (edge.linkType === LINK_TYPES.DISJOINT_D) {
      sourceRoleLabel = 'Base';
      targetRoleLabel = 'Derived';
    } else if (edge.linkType === LINK_TYPES.COMPLETE_C) {
      sourceRoleLabel = 'Content';
      targetRoleLabel = 'Container';
    } else if (edge.linkType === LINK_TYPES.AGGREGATION_DIAMOND) {
      sourceRoleLabel = 'Constituent';
      targetRoleLabel = 'Complex';
    } else if (edge.linkType === LINK_TYPES.UML_INHERITANCE) {
      sourceRoleLabel = 'Child';
      targetRoleLabel = 'Parent';
    }

    // Determine normalized PAN multiplicity ('one' or 'many' or empty)
    const currentPanMulti = (edge.panMultiplicity || '').trim().toLowerCase();
    let panMultiValue = '';
    if (currentPanMulti === '*' || currentPanMulti === 'many' || currentPanMulti === '1..*') {
      panMultiValue = 'many';
    } else if (currentPanMulti === '1' || currentPanMulti === 'one' || currentPanMulti === '0..1') {
      panMultiValue = 'one';
    }

    if (isISAB) {
      edge.adatMultiplicity = 'many';
      edge.panMultiplicity = panMultiValue;
    }

    // ISAB Properties Section:
    // 1a. Adat Multiplicity: Always many, unchangeable, displayed to user with compact text size
    // 1b. Pan Multiplicity: Dropdown with 'one' and 'many' (empty if not selected yet)
    const isabPropertiesSection = isISAB ? `
      <div class="form-group-row">
        <div class="form-group">
          <label>Adat Multiplicity</label>
          <input type="text" id="edge-input-adat-multi" class="form-control" value="many" readonly disabled style="background:var(--bg-panel-subtle, #F1F5F9); cursor:not-allowed; font-weight:700; color:var(--text-main, #334155); width:68px; text-align:center;" title="Adat cardinality is fixed to 'many'">
        </div>
        <div class="form-group">
          <label>Pan Multiplicity</label>
          <select id="edge-input-pan-multi" class="form-control">
            <option value="" ${!panMultiValue ? 'selected disabled' : ''}>-- Select --</option>
            <option value="one" ${panMultiValue === 'one' ? 'selected' : ''}>one</option>
            <option value="many" ${panMultiValue === 'many' ? 'selected' : ''}>many</option>
          </select>
        </div>
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label>Additivity</label>
          <select id="edge-input-additivity" class="form-control">
            <option value="${BOOLEAN_OPTIONS.TRUE}" ${(edge.additivity || BOOLEAN_OPTIONS.TRUE) === BOOLEAN_OPTIONS.TRUE ? 'selected' : ''}>True</option>
            <option value="${BOOLEAN_OPTIONS.FALSE}" ${(edge.additivity || BOOLEAN_OPTIONS.TRUE) === BOOLEAN_OPTIONS.FALSE ? 'selected' : ''}>False</option>
          </select>
        </div>
        <div class="form-group">
          <label>Applicability</label>
          <select id="edge-input-applicability" class="form-control">
            <option value="${BOOLEAN_OPTIONS.TRUE}" ${(edge.applicability || BOOLEAN_OPTIONS.TRUE) === BOOLEAN_OPTIONS.TRUE ? 'selected' : ''}>True</option>
            <option value="${BOOLEAN_OPTIONS.FALSE}" ${(edge.applicability || BOOLEAN_OPTIONS.TRUE) === BOOLEAN_OPTIONS.FALSE ? 'selected' : ''}>False</option>
          </select>
        </div>
      </div>
    ` : '';

    // Options filtered by connection rule
    let relationshipOptions = '';
    if (isPanPan) {
      // PAN-PAN: Specialization, Container, Complex allowed. Derived disallowed.
      relationshipOptions = `
        <option value="${LINK_TYPES.UML_INHERITANCE}" ${edge.linkType === LINK_TYPES.UML_INHERITANCE ? 'selected' : ''}>Specialization</option>
        <option value="${LINK_TYPES.COMPLETE_C}" ${edge.linkType === LINK_TYPES.COMPLETE_C ? 'selected' : ''}>Container</option>
        <option value="${LINK_TYPES.AGGREGATION_DIAMOND}" ${edge.linkType === LINK_TYPES.AGGREGATION_DIAMOND ? 'selected' : ''}>Complex</option>
      `;
    } else if (isAdatPan) {
      // ADAT-PAN: Strictly ISAB
      relationshipOptions = `
        <option value="${LINK_TYPES.SOLID}" selected>ISAB</option>
      `;
    } else {
      // ADAT-ADAT: All 5
      relationshipOptions = `
        <option value="${LINK_TYPES.SOLID}" ${edge.linkType === LINK_TYPES.SOLID ? 'selected' : ''}>ISAB</option>
        <option value="${LINK_TYPES.UML_INHERITANCE}" ${edge.linkType === LINK_TYPES.UML_INHERITANCE ? 'selected' : ''}>Specialization</option>
        <option value="${LINK_TYPES.DISJOINT_D}" ${edge.linkType === LINK_TYPES.DISJOINT_D ? 'selected' : ''}>Derived</option>
        <option value="${LINK_TYPES.COMPLETE_C}" ${edge.linkType === LINK_TYPES.COMPLETE_C ? 'selected' : ''}>Container</option>
        <option value="${LINK_TYPES.AGGREGATION_DIAMOND}" ${edge.linkType === LINK_TYPES.AGGREGATION_DIAMOND ? 'selected' : ''}>Complex</option>
      `;
    }

    this.formContainer.innerHTML = `
      <div class="form-group">
        <label>Relationship Type</label>
        <select id="edge-input-type" class="form-control" ${isAdatPan ? 'disabled' : ''}>
          ${relationshipOptions}
        </select>
        ${isAdatPan ? '<span style="font-size:0.72rem; color:var(--pan-color);">ADAT-PAN connections are strictly ISAB.</span>' : ''}
        ${isPanPan ? '<span style="font-size:0.72rem; color:var(--pan-color);">PAN-PAN supports Specialization, Container, and Complex trees.</span>' : ''}
      </div>

      <div class="form-group">
        <label>Connected Nodes</label>
        <div style="background:var(--bg-panel-subtle); padding:0.65rem 0.85rem; border-radius:6px; font-size:0.8rem; border:1px solid var(--border-color); display:flex; flex-direction:column; gap:0.4rem;">
          <div><strong style="color:var(--text-muted);">${sourceRoleLabel}:</strong> <span style="font-weight:700; color:#1E1B4B;">${this.escapeHtml(sourceNode?.name || 'Unknown')}</span> (${sourceNode?.type || ''})</div>
          <div><strong style="color:var(--text-muted);">${targetRoleLabel}:</strong> <span style="font-weight:700; color:#1E1B4B;">${this.escapeHtml(targetNode?.name || 'Unknown')}</span> (${targetNode?.type || ''})</div>
        </div>
      </div>

      ${isabPropertiesSection}

      <div class="form-group" style="margin-top: 0.5rem;">
        <button id="btn-reset-waypoint" class="btn-sm btn-outline" style="width:100%; justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          <span>Reset Custom Line Placement</span>
        </button>
      </div>

      <div style="margin-top: 1rem;">
        <button id="btn-delete-edge" class="btn btn-secondary" style="color: #DC2626; width: 100%; border-color: #FECACA;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          <span>Delete Connection</span>
        </button>
      </div>
    `;

    document.getElementById('edge-input-type').addEventListener('change', (e) => {
      const res = this.model.updateEdge(edge.id, { linkType: e.target.value });
      if (res.error) {
        window.dispatchEvent(new CustomEvent('show_toast', { detail: { message: res.error, type: 'error' } }));
      } else {
        this.renderEdgeForm(edge);
      }
    });

    if (isISAB) {
      document.getElementById('edge-input-pan-multi')?.addEventListener('change', (e) => {
        this.model.updateEdge(edge.id, { panMultiplicity: e.target.value, adatMultiplicity: 'many' });
      });

      document.getElementById('edge-input-additivity')?.addEventListener('change', (e) => {
        this.model.updateEdge(edge.id, { additivity: e.target.value });
      });

      document.getElementById('edge-input-applicability')?.addEventListener('change', (e) => {
        this.model.updateEdge(edge.id, { applicability: e.target.value });
      });
    }

    document.getElementById('btn-reset-waypoint').addEventListener('click', () => {
      this.model.updateEdge(edge.id, { waypoint: null });
      this.canvas.renderAllConnections();
      window.dispatchEvent(new CustomEvent('show_toast', { detail: { message: 'Line position reset to auto', type: 'info' } }));
    });

    document.getElementById('btn-delete-edge').addEventListener('click', () => {
      this.model.removeEdge(edge.id);
    });
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
