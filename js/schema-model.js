/**
 * schema-model.js
 * Core Graph Data Model for Custom Conceptual Schema (PAN & ADAT)
 */

export const LINK_TYPES = {
  SOLID: 'SOLID',                           // (a) ISAB (Solid Line)
  UML_INHERITANCE: 'UML_INHERITANCE',       // (b) Specialization (Triangle)
  DISJOINT_D: 'DISJOINT_D',                 // (c) Derived (Triangle with 'D')
  COMPLETE_C: 'COMPLETE_C',                 // (d) Container (Triangle with 'C')
  AGGREGATION_DIAMOND: 'AGGREGATION_DIAMOND'// (e) Complex (Diamond ◊)
};

export const LINK_LABELS = {
  SOLID: 'ISAB',
  UML_INHERITANCE: 'Specialization',
  DISJOINT_D: 'Derived',
  COMPLETE_C: 'Container',
  AGGREGATION_DIAMOND: 'Complex'
};

export const NODE_TYPES = {
  PAN: 'PAN',   // Primary Access Node
  ADAT: 'ADAT'  // Abstract Data Type
};

export const DATA_KINDS = {
  NUMERIC: 'Numeric',
  NON_NUMERIC: 'Non Numeric'
};

export const NATURE_TYPES = {
  STRUCTURED: 'Structured',
  UNSTRUCTURED: 'Unstructured'
};

export const UPDATE_TYPES = {
  UPDATE: 'UPDATE',
  NO_UPDATE: 'NO UPDATE'
};

export const BOOLEAN_OPTIONS = {
  TRUE: 'True',
  FALSE: 'False'
};

export class SchemaModel {
  constructor() {
    this.nodes = new Map(); // id -> NodeObject
    this.edges = new Map(); // id -> EdgeObject
    this.history = [];
    this.historyIndex = -1;
    this.idCounter = 1;
    this.listeners = new Set();
  }

  generateId(prefix = 'el') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, payload) {
    this.listeners.forEach(fn => fn(event, payload));
  }

  recordSnapshot() {
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    const state = this.toJSON();
    this.history.push(state);
    if (this.history.length > 40) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const snapshot = this.history[this.historyIndex];
      this.fromJSON(snapshot, false);
      this.notify('history_change', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const snapshot = this.history[this.historyIndex];
      this.fromJSON(snapshot, false);
      this.notify('history_change', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    }
  }

  canUndo() {
    return this.historyIndex > 0;
  }

  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  // --- Node Operations ---

  createPAN(x = 100, y = 100, customProps = {}) {
    const id = this.generateId('pan');
    const index = Array.from(this.nodes.values()).filter(n => n.type === NODE_TYPES.PAN).length + 1;
    const rawName = customProps.name || `PAN_${index}`;
    
    // PAN: Name and list of attributes with default NO UPDATE
    const node = {
      id,
      type: NODE_TYPES.PAN,
      name: rawName.replace(/\s/g, '_'),
      attributes: (customProps.attributes || []).map(a => ({
        id: a.id || this.generateId('pan_attr'),
        name: (a.name || '').replace(/\s/g, '_'),
        updateType: a.updateType || UPDATE_TYPES.NO_UPDATE
      })),
      x,
      y,
      width: 250,
      height: 140
    };

    this.nodes.set(id, node);
    this.recordSnapshot();
    this.notify('node_created', node);
    return node;
  }

  createADAT(x = 350, y = 100, customProps = {}) {
    const id = this.generateId('adat');
    const index = Array.from(this.nodes.values()).filter(n => n.type === NODE_TYPES.ADAT).length + 1;
    const rawName = customProps.name || `ADAT_${index}`;
    
    // ADAT: Nature (Structured/Unstructured) and Attributes list
    const node = {
      id,
      type: NODE_TYPES.ADAT,
      name: rawName.replace(/\s/g, '_'),
      nature: customProps.nature || NATURE_TYPES.STRUCTURED,
      attributes: (customProps.attributes || []).map(a => ({
        id: a.id || this.generateId('attr'),
        name: (a.name || '').replace(/\s/g, '_'),
        dataKind: a.dataKind || DATA_KINDS.NON_NUMERIC
      })),
      x,
      y,
      width: 250,
      height: 150
    };

    this.nodes.set(id, node);
    this.recordSnapshot();
    this.notify('node_created', node);
    return node;
  }

  updateNode(id, patch) {
    const node = this.nodes.get(id);
    if (!node) return null;

    if (patch.name) {
      patch.name = patch.name.replace(/\s/g, '_');
    }
    if (patch.attributes) {
      patch.attributes = patch.attributes.map(a => ({
        ...a,
        name: (a.name || '').replace(/\s/g, '_'),
        ...(node.type === NODE_TYPES.PAN ? { updateType: a.updateType || UPDATE_TYPES.NO_UPDATE } : {})
      }));
    }

    Object.assign(node, patch);
    this.recordSnapshot();
    this.notify('node_updated', node);
    return node;
  }

  removeNode(id) {
    const node = this.nodes.get(id);
    if (!node) return;

    const connectedEdges = Array.from(this.edges.values()).filter(
      e => e.sourceId === id || e.targetId === id
    );
    connectedEdges.forEach(e => this.removeEdge(e.id, false));

    this.nodes.delete(id);
    this.recordSnapshot();
    this.notify('node_deleted', { id, node });
  }

  // --- Edge Operations & Validation Rules ---

  validateConnection(sourceId, targetId, linkType) {
    if (sourceId === targetId) {
      return { valid: false, message: 'Cannot connect an element to itself.' };
    }

    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (!source || !target) {
      return { valid: false, message: 'Source or Target node not found.' };
    }

    // Rule 1: PAN to PAN Connections
    // PAN-PAN Specialization, Container, and Complex trees are allowed.
    // PAN-PAN Derived is explicitly NOT allowed.
    if (source.type === NODE_TYPES.PAN && target.type === NODE_TYPES.PAN) {
      if (linkType === LINK_TYPES.DISJOINT_D) {
        return { 
          valid: false, 
          message: 'PAN-PAN Derived connections are not allowed.' 
        };
      }
      if (linkType === LINK_TYPES.SOLID) {
        return { 
          valid: false, 
          message: 'ISAB connection is between ADAT and PAN. For PAN to PAN, use Specialization, Container, or Complex.' 
        };
      }

      // Rule 1b: In a Specialization PAN tree, parent PAN (targetId) cannot have ISAB link
      if (linkType === LINK_TYPES.UML_INHERITANCE) {
        const parentHasIsab = Array.from(this.edges.values()).some(
          e => (e.sourceId === targetId || e.targetId === targetId) && e.linkType === LINK_TYPES.SOLID
        );
        if (parentHasIsab) {
          return {
            valid: false,
            message: 'In a specialization PAN tree, only the leaf level PANs can be linked via ISAB to an ADAT. Please remove the ISAB link from the parent PAN first.'
          };
        }
      }

      // Specialization, Container, Complex are ALLOWED
      return { valid: true };
    }

    // Rule 2: ADAT to PAN (or PAN to ADAT) Connections
    // Must be ISAB (Solid line)
    if ((source.type === NODE_TYPES.PAN && target.type === NODE_TYPES.ADAT) ||
        (source.type === NODE_TYPES.ADAT && target.type === NODE_TYPES.PAN)) {
      if (linkType !== LINK_TYPES.SOLID) {
        return { 
          valid: false, 
          message: 'ADAT to PAN can only be connected via ISAB.' 
        };
      }

      const adatId = source.type === NODE_TYPES.ADAT ? sourceId : targetId;
      const panId = source.type === NODE_TYPES.PAN ? sourceId : targetId;

      // Rule 2a: In a derived ADAT tree, leaf ADATs cannot be linked to any PAN using ISAB
      if (this.isAdatLeafInDerived(adatId)) {
        return {
          valid: false,
          message: 'In a derived ADAT tree, the leaf ADATs cannot be linked to any PAN using ISAB.'
        };
      }

      // Rule 2b: In a specialization ADAT tree, only leaf level ADATs can be linked via ISAB to a PAN
      if (this.isAdatNonLeafInSpecialization(adatId)) {
        return {
          valid: false,
          message: 'In a specialization ADAT tree, only the leaf level ADATs can be linked via ISAB to a PAN.'
        };
      }

      // Rule 2c: In a specialization PAN tree, only leaf level PANs can be linked via ISAB to an ADAT
      if (this.isPanNonLeafInSpecialization(panId)) {
        return {
          valid: false,
          message: 'In a specialization PAN tree, only the leaf level PANs can be linked via ISAB to an ADAT.'
        };
      }

      return { valid: true };
    }

    // Rule 3: ADAT to ADAT Connections
    if (source.type === NODE_TYPES.ADAT && target.type === NODE_TYPES.ADAT) {
      const hierarchyTypes = [
        LINK_TYPES.UML_INHERITANCE,
        LINK_TYPES.DISJOINT_D,
        LINK_TYPES.COMPLETE_C,
        LINK_TYPES.AGGREGATION_DIAMOND
      ];

      if (!hierarchyTypes.includes(linkType)) {
        return {
          valid: false,
          message: 'ADAT to ADAT connections must be Specialization, Derived, Container, or Complex.'
        };
      }

      // Rule 3a: Parent node link type consistency
      // Once a specific type of link is selected and drawn for a parent, it cannot have mixed hierarchy types.
      const existingChildEdges = Array.from(this.edges.values()).filter(
        e => e.targetId === targetId && hierarchyTypes.includes(e.linkType)
      );
      if (existingChildEdges.length > 0) {
        const existingType = existingChildEdges[0].linkType;
        if (existingType !== linkType) {
          return {
            valid: false,
            message: 'In an ADAT tree, once a link type is selected, the parent cannot participate in mixed hierarchy types. The only other relationship the parent can participate in is ISAB.'
          };
        }
      }

      // Rule 3b: In a specialization ADAT tree, parent ADAT cannot have an ISAB link
      if (linkType === LINK_TYPES.UML_INHERITANCE) {
        const parentHasIsab = Array.from(this.edges.values()).some(
          e => (e.sourceId === targetId || e.targetId === targetId) && e.linkType === LINK_TYPES.SOLID
        );
        if (parentHasIsab) {
          return {
            valid: false,
            message: 'In a specialization ADAT tree, only the leaf level ADATs can be linked via ISAB to a PAN. Please remove the ISAB link from the parent ADAT first.'
          };
        }
      }

      // Rule 3c: In a derived ADAT tree, leaf ADATs cannot have ISAB
      if (linkType === LINK_TYPES.DISJOINT_D) {
        const childHasIsab = Array.from(this.edges.values()).some(
          e => (e.sourceId === sourceId || e.targetId === sourceId) && e.linkType === LINK_TYPES.SOLID
        );
        if (childHasIsab) {
          return {
            valid: false,
            message: 'In a derived ADAT tree, the leaf ADATs cannot be linked to any PAN using ISAB. Please remove existing ISAB connection first.'
          };
        }
      }

      // Rule 3d: Containment single child rule
      if (linkType === LINK_TYPES.COMPLETE_C) {
        const existingContainerChild = Array.from(this.edges.values()).find(
          e => e.targetId === targetId && e.linkType === LINK_TYPES.COMPLETE_C
        );
        if (existingContainerChild) {
          return {
            valid: false,
            message: 'In Containment, each parent can have only one child.'
          };
        }
      }

      return { valid: true };
    }

    // Rule 4: PAN to PAN Containment single child rule
    if (linkType === LINK_TYPES.COMPLETE_C) {
      const existingContainerChild = Array.from(this.edges.values()).find(
        e => e.targetId === targetId && e.linkType === LINK_TYPES.COMPLETE_C
      );
      if (existingContainerChild) {
        return {
          valid: false,
          message: 'In Containment, each parent can have only one child.'
        };
      }
    }

    return { valid: true };
  }

  isPanNonLeafInSpecialization(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== NODE_TYPES.PAN) return false;

    // Has children connected to it via UML_INHERITANCE (target is parent)
    return Array.from(this.edges.values()).some(
      e => e.targetId === nodeId && e.linkType === LINK_TYPES.UML_INHERITANCE
    );
  }

  isAdatNonLeafInSpecialization(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== NODE_TYPES.ADAT) return false;

    // Has children connected to it via UML_INHERITANCE (target is parent)
    return Array.from(this.edges.values()).some(
      e => e.targetId === nodeId && e.linkType === LINK_TYPES.UML_INHERITANCE
    );
  }

  isAdatLeafInDerived(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== NODE_TYPES.ADAT) return false;

    // Has a parent edge in a derived tree (source is child, target is parent)
    const hasDerivedParent = Array.from(this.edges.values()).some(
      e => e.sourceId === nodeId && e.linkType === LINK_TYPES.DISJOINT_D
    );

    // Has no children deriving from it (target is parent)
    const hasDerivedChildren = Array.from(this.edges.values()).some(
      e => e.targetId === nodeId && e.linkType === LINK_TYPES.DISJOINT_D
    );

    return hasDerivedParent && !hasDerivedChildren;
  }

  createEdge(sourceId, targetId, linkType = LINK_TYPES.SOLID, props = {}) {
    const validation = this.validateConnection(sourceId, targetId, linkType);
    if (!validation.valid) {
      return { edge: null, error: validation.message };
    }

    const existing = Array.from(this.edges.values()).find(
      e => (e.sourceId === sourceId && e.targetId === targetId && e.linkType === linkType)
    );
    if (existing) {
      return { edge: existing, error: 'Identical connection already exists.' };
    }

    const isISAB = (linkType === LINK_TYPES.SOLID);
    let panMultiVal = '';
    if (props.panMultiplicity || props.targetMultiplicity) {
      const raw = (props.panMultiplicity || props.targetMultiplicity).trim().toLowerCase();
      if (raw === '*' || raw === 'many' || raw === '1..*') panMultiVal = 'many';
      else if (raw === '1' || raw === 'one' || raw === '0..1') panMultiVal = 'one';
      else panMultiVal = (props.panMultiplicity || props.targetMultiplicity);
    }

    const id = this.generateId('edge');
    const edge = {
      id,
      sourceId,
      targetId,
      linkType,
      adatMultiplicity: isISAB ? 'many' : (props.adatMultiplicity || props.sourceMultiplicity || ''),
      panMultiplicity: isISAB ? panMultiVal : (props.panMultiplicity || props.targetMultiplicity || ''),
      additivity: props.additivity || BOOLEAN_OPTIONS.TRUE,
      applicability: props.applicability || props.associativity || BOOLEAN_OPTIONS.TRUE,
      sourceAnchor: props.sourceAnchor || null,
      targetAnchor: props.targetAnchor || null,
      waypoint: props.waypoint || null
    };

    this.edges.set(id, edge);
    this.recordSnapshot();
    this.notify('edge_created', edge);
    return { edge, error: null };
  }

  updateEdge(id, patch) {
    const edge = this.edges.get(id);
    if (!edge) return null;

    if (patch.linkType && patch.linkType !== edge.linkType) {
      const val = this.validateConnection(edge.sourceId, edge.targetId, patch.linkType);
      if (!val.valid) {
        return { edge: null, error: val.message };
      }
    }

    if (patch.linkType === LINK_TYPES.SOLID || (!patch.linkType && edge.linkType === LINK_TYPES.SOLID)) {
      patch.adatMultiplicity = 'many';
    }

    Object.assign(edge, patch);
    this.recordSnapshot();
    this.notify('edge_updated', edge);
    return { edge, error: null };
  }

  removeEdge(id, snapshot = true) {
    const edge = this.edges.get(id);
    if (!edge) return;
    this.edges.delete(id);
    if (snapshot) this.recordSnapshot();
    this.notify('edge_deleted', { id, edge });
  }

  clear() {
    this.nodes.clear();
    this.edges.clear();
    this.recordSnapshot();
    this.notify('cleared', null);
  }

  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()).map(n => ({
        ...n,
        name: (n.name || '').replace(/\s/g, '_'),
        attributes: (n.attributes || []).map(a => ({
          ...a,
          name: (a.name || '').replace(/\s/g, '_'),
          ...(n.type === NODE_TYPES.PAN ? { updateType: a.updateType || UPDATE_TYPES.NO_UPDATE } : {})
        }))
      })),
      edges: Array.from(this.edges.values()).map(e => ({
        ...e,
        adatMultiplicity: e.linkType === LINK_TYPES.SOLID ? 'many' : (e.adatMultiplicity || ''),
        panMultiplicity: e.panMultiplicity || '',
        additivity: e.additivity || BOOLEAN_OPTIONS.TRUE,
        applicability: e.applicability || e.associativity || BOOLEAN_OPTIONS.TRUE
      }))
    };
  }

  fromJSON(json, record = true) {
    this.nodes.clear();
    this.edges.clear();

    if (json.nodes && Array.isArray(json.nodes)) {
      json.nodes.forEach(n => {
        const nodeObj = {
          ...n,
          name: (n.name || '').replace(/\s/g, '_'),
          attributes: (n.attributes || []).map(a => ({
            ...a,
            name: (a.name || '').replace(/\s/g, '_'),
            ...(n.type === NODE_TYPES.PAN ? { updateType: a.updateType || UPDATE_TYPES.NO_UPDATE } : {})
          }))
        };
        this.nodes.set(n.id, nodeObj);
      });
    }
    if (json.edges && Array.isArray(json.edges)) {
      json.edges.forEach(e => {
        const isISAB = (e.linkType === LINK_TYPES.SOLID);
        const edgeObj = {
          ...e,
          adatMultiplicity: isISAB ? 'many' : (e.adatMultiplicity || e.sourceMultiplicity || ''),
          panMultiplicity: e.panMultiplicity || e.targetMultiplicity || '',
          additivity: e.additivity || BOOLEAN_OPTIONS.TRUE,
          applicability: e.applicability || e.associativity || BOOLEAN_OPTIONS.TRUE
        };
        this.edges.set(e.id, edgeObj);
      });
    }

    if (record) {
      this.recordSnapshot();
    }
    this.notify('model_reloaded', this.toJSON());
  }

  /**
   * Validates that all standalone ADAT/PAN nodes (nodes not participating in any
   * Specialization, Derived, Container, or Complex tree) have at least one attribute.
   * Returns { valid: true } or { valid: false, node, message: string }
   */
  validateStandaloneAttributes() {
    const treeLinkTypes = new Set([
      LINK_TYPES.UML_INHERITANCE,
      LINK_TYPES.DISJOINT_D,
      LINK_TYPES.COMPLETE_C,
      LINK_TYPES.AGGREGATION_DIAMOND
    ]);

    const treeNodeIds = new Set();
    this.edges.forEach(edge => {
      if (treeLinkTypes.has(edge.linkType)) {
        treeNodeIds.add(edge.sourceId);
        treeNodeIds.add(edge.targetId);
      }
    });

    for (const [id, node] of this.nodes.entries()) {
      if (!treeNodeIds.has(id)) {
        const validAttrs = (node.attributes || []).filter(a => a && a.name && a.name.trim().length > 0);
        if (validAttrs.length === 0) {
          return {
            valid: false,
            node,
            message: `Standalone ${node.type} "${node.name || id}" is not part of a tree and must have at least one attribute. Please add an attribute.`
          };
        }
      }
    }

    return { valid: true };
  }

  getStats() {
    let panCount = 0;
    let adatCount = 0;
    this.nodes.forEach(n => {
      if (n.type === NODE_TYPES.PAN) panCount++;
      else if (n.type === NODE_TYPES.ADAT) adatCount++;
    });
    return {
      pans: panCount,
      adats: adatCount,
      connections: this.edges.size
    };
  }
}
