/**
 * canvas.js
 * Interactive SVG + DOM Canvas Manager with Dynamic Smart Anchoring, Multi-Connection Offsets,
 * Directional Arrowheads, Upright D/C Glyphs, Multiplicity at Line-Node Intersections,
 * and PAN/ADAT Attribute Structures.
 */

import { LINK_TYPES, LINK_LABELS, NODE_TYPES, DATA_KINDS, NATURE_TYPES, UPDATE_TYPES } from './schema-model.js';

export class CanvasEngine {
  constructor(model, elements) {
    this.model = model;
    this.container = elements.workspace;
    this.viewport = elements.viewport;
    this.svg = elements.svg;
    this.nodesContainer = elements.nodesContainer;
    this.connectionsGroup = elements.connectionsGroup;
    this.tempLine = elements.tempLine;

    // Viewport Transform State - Start at 50% zoom
    this.scale = 0.5;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startPan = { x: 0, y: 0 };

    // Node Dragging State
    this.isDraggingNode = false;
    this.draggedNodeId = null;
    this.dragOffset = { x: 0, y: 0 };

    // Waypoint Dragging State
    this.isDraggingWaypoint = false;
    this.draggedWaypointEdgeId = null;

    // Line Connection State
    this.isConnecting = false;
    this.connectionStart = null; // { nodeId, anchor, x, y }
    this.activeLinkType = LINK_TYPES.SOLID;
    this.selectedElement = null; // { type: 'node' | 'edge', id }

    this.init();
  }

  init() {
    this.bindViewportEvents();
    this.bindPaletteDragEvents();
    this.bindCanvasClickEvents();
    this.bindModelSubscription();
    this.updateViewportTransform();
  }

  // --- Viewport & Zoom Controls ---

  bindViewportEvents() {
    this.container.addEventListener('mousedown', (e) => {
      if (e.target === this.container || e.target === this.viewport || e.target.id === 'canvas-grid' || e.target === this.svg) {
        if (e.button === 0 || e.button === 1) {
          this.isPanning = true;
          this.startPan = { x: e.clientX - this.panX, y: e.clientY - this.panY };
          this.container.style.cursor = 'grabbing';
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startPan.x;
        this.panY = e.clientY - this.startPan.y;
        this.updateViewportTransform();
      } else if (this.isDraggingNode && this.draggedNodeId) {
        const node = this.model.nodes.get(this.draggedNodeId);
        if (node) {
          const rect = this.container.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - this.panX) / this.scale;
          const canvasY = (e.clientY - rect.top - this.panY) / this.scale;
          
          const newX = Math.max(20, Math.round((canvasX - this.dragOffset.x) / 10) * 10);
          const newY = Math.max(20, Math.round((canvasY - this.dragOffset.y) / 10) * 10);

          const deltaX = newX - node.x;
          const deltaY = newY - node.y;

          node.x = newX;
          node.y = newY;

          // Shift waypoints attached to this node proportionally
          this.model.edges.forEach(edge => {
            if (edge.waypoint && (edge.sourceId === node.id || edge.targetId === node.id)) {
              const factor = (edge.sourceId === node.id && edge.targetId === node.id) ? 1.0 : 0.5;
              edge.waypoint.x += deltaX * factor;
              edge.waypoint.y += deltaY * factor;
            }
          });

          this.updateNodeElementPosition(node);
          this.renderAllConnections();
        }
      } else if (this.isDraggingWaypoint && this.draggedWaypointEdgeId) {
        const edge = this.model.edges.get(this.draggedWaypointEdgeId);
        if (edge) {
          const rect = this.container.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - this.panX) / this.scale;
          const canvasY = (e.clientY - rect.top - this.panY) / this.scale;
          edge.waypoint = { x: Math.round(canvasX), y: Math.round(canvasY) };
          this.renderAllConnections();
        }
      } else if (this.isConnecting && this.connectionStart) {
        const rect = this.container.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - this.panX) / this.scale;
        const mouseY = (e.clientY - rect.top - this.panY) / this.scale;

        const pathData = this.calculateBezierPath(
          this.connectionStart.x,
          this.connectionStart.y,
          mouseX,
          mouseY,
          this.connectionStart.anchor,
          'auto'
        );
        this.tempLine.setAttribute('d', pathData);
        this.tempLine.classList.remove('hidden');
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.style.cursor = 'default';
      }
      if (this.isDraggingNode) {
        this.isDraggingNode = false;
        if (this.draggedNodeId) {
          this.model.recordSnapshot();
          this.draggedNodeId = null;
        }
      }
      if (this.isDraggingWaypoint) {
        this.isDraggingWaypoint = false;
        if (this.draggedWaypointEdgeId) {
          this.model.recordSnapshot();
          this.draggedWaypointEdgeId = null;
        }
      }
      if (this.isConnecting) {
        this.cancelConnection();
      }
    });

    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      const rect = this.container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let newScale = e.deltaY < 0 ? this.scale * zoomFactor : this.scale / zoomFactor;
      newScale = Math.min(Math.max(0.3, newScale), 2.5);

      this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
      this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
      this.scale = newScale;

      this.updateViewportTransform();
      this.notifyZoomChange();
    }, { passive: false });
  }

  zoomIn() {
    this.setScale(this.scale * 1.2);
  }

  zoomOut() {
    this.setScale(this.scale / 1.2);
  }

  resetZoom() {
    this.scale = 0.5;
    this.panX = 0;
    this.panY = 0;
    this.updateViewportTransform();
    this.notifyZoomChange();
  }

  fitToScreen() {
    if (this.model.nodes.size === 0) {
      this.resetZoom();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.model.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width || 250));
      maxY = Math.max(maxY, n.y + (n.height || 150));
    });

    const padding = 100;
    const diagramWidth = Math.max(100, maxX - minX + padding * 2);
    const diagramHeight = Math.max(100, maxY - minY + padding * 2);

    const containerRect = this.container.getBoundingClientRect();
    const cWidth = containerRect.width > 0 ? containerRect.width : (window.innerWidth - 250);
    const cHeight = containerRect.height > 0 ? containerRect.height : (window.innerHeight - 62);

    const scaleX = cWidth / diagramWidth;
    const scaleY = cHeight / diagramHeight;
    this.scale = Math.min(Math.max(0.35, Math.min(scaleX, scaleY)), 0.85);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.panX = (cWidth / 2) - (centerX * this.scale);
    this.panY = (cHeight / 2) - (centerY * this.scale);

    this.updateViewportTransform();
    this.notifyZoomChange();
  }

  setScale(scale) {
    this.scale = Math.min(Math.max(0.3, scale), 2.5);
    this.updateViewportTransform();
    this.notifyZoomChange();
  }

  updateViewportTransform() {
    this.viewport.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  notifyZoomChange() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = `${Math.round(this.scale * 100)}%`;
  }

  // --- Palette Drag and Drop ---

  bindPaletteDragEvents() {
    const draggables = document.querySelectorAll('.draggable-node');
    draggables.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const type = item.getAttribute('data-type');
        e.dataTransfer.setData('application/schema-node-type', type);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nodeType = e.dataTransfer.getData('application/schema-node-type');
      if (!nodeType) return;

      const rect = this.container.getBoundingClientRect();
      const dropX = (e.clientX - rect.left - this.panX) / this.scale;
      const dropY = (e.clientY - rect.top - this.panY) / this.scale;

      const snappedX = Math.max(10, Math.round(dropX / 10) * 10);
      const snappedY = Math.max(10, Math.round(dropY / 10) * 10);

      if (nodeType === NODE_TYPES.PAN) {
        const pan = this.model.createPAN(snappedX, snappedY);
        this.selectElement('node', pan.id);
      } else if (nodeType === NODE_TYPES.ADAT) {
        const adat = this.model.createADAT(snappedX, snappedY);
        this.selectElement('node', adat.id);
      }
    };

    this.container.addEventListener('dragover', handleDragOver);
    this.container.addEventListener('drop', handleDrop);
  }

  // --- Canvas Selection ---

  bindCanvasClickEvents() {
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container || e.target === this.viewport || e.target.id === 'canvas-grid' || e.target === this.svg) {
        this.deselectAll();
      }
    });
  }

  selectElement(type, id) {
    this.deselectAll();
    this.selectedElement = { type, id };

    if (type === 'node') {
      const nodeEl = document.getElementById(`node-${id}`);
      if (nodeEl) nodeEl.classList.add('selected');
    } else if (type === 'edge') {
      const edgeGroup = document.getElementById(`edge-group-${id}`);
      if (edgeGroup) edgeGroup.classList.add('selected');
    }

    this.renderAllConnections();
    window.dispatchEvent(new CustomEvent('element_selected', { detail: { type, id } }));
  }

  deselectAll() {
    this.selectedElement = null;
    document.querySelectorAll('.schema-node.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.connection-line-group.selected').forEach(el => el.classList.remove('selected'));
    this.renderAllConnections();
    window.dispatchEvent(new CustomEvent('element_deselected'));
  }

  // --- Model Sync ---

  bindModelSubscription() {
    this.model.subscribe((event, data) => {
      switch (event) {
        case 'node_created':
          this.renderNode(data);
          this.renderAllConnections();
          this.updateStats();
          break;
        case 'node_updated':
          this.reRenderNode(data);
          this.renderAllConnections();
          this.updateStats();
          break;
        case 'node_deleted':
          this.removeNodeElement(data.id);
          this.renderAllConnections();
          this.updateStats();
          if (this.selectedElement?.id === data.id) this.deselectAll();
          break;
        case 'edge_created':
        case 'edge_updated':
        case 'edge_deleted':
          this.renderAllConnections();
          this.updateStats();
          break;
        case 'cleared':
        case 'model_reloaded':
          this.rebuildWholeCanvas();
          this.updateStats();
          break;
      }
    });
  }

  updateStats() {
    const stats = this.model.getStats();
    const el = document.getElementById('schema-stats');
    if (el) {
      el.textContent = `${stats.pans} PANs | ${stats.adats} ADATs | ${stats.connections} Connections`;
    }
  }

  rebuildWholeCanvas() {
    this.nodesContainer.innerHTML = '';
    this.connectionsGroup.innerHTML = '';
    this.model.nodes.forEach(n => this.renderNode(n));
    this.renderAllConnections();
  }

  // --- Node Rendering (PAN & ADAT) ---

  renderNode(node) {
    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.className = `schema-node ${node.type === NODE_TYPES.PAN ? 'node-pan' : 'node-adat'}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;

    el.innerHTML = this.getNodeInnerHTML(node);

    el.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('node-anchor') || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') {
        return;
      }
      e.stopPropagation();

      if (this.isConnecting && this.connectionStart && this.connectionStart.nodeId !== node.id) {
        this.completeConnection(node.id);
        return;
      }

      this.selectElement('node', node.id);
      this.isDraggingNode = true;
      this.draggedNodeId = node.id;

      const rect = this.container.getBoundingClientRect();
      const canvasMouseX = (e.clientX - rect.left - this.panX) / this.scale;
      const canvasMouseY = (e.clientY - rect.top - this.panY) / this.scale;

      this.dragOffset = {
        x: canvasMouseX - node.x,
        y: canvasMouseY - node.y
      };
    });

    this.bindNodeAnchors(el, node);
    this.nodesContainer.appendChild(el);

    requestAnimationFrame(() => {
      const h = el.offsetHeight;
      if (h && h !== node.height) {
        node.height = h;
        this.renderAllConnections();
      }
    });
  }

  reRenderNode(node) {
    const el = document.getElementById(`node-${node.id}`);
    if (!el) return;
    el.innerHTML = this.getNodeInnerHTML(node);
    this.bindNodeAnchors(el, node);
    
    requestAnimationFrame(() => {
      const h = el.offsetHeight;
      if (h && h !== node.height) {
        node.height = h;
        this.renderAllConnections();
      }
    });
  }

  getNodeInnerHTML(node) {
    if (node.type === NODE_TYPES.PAN) {
      // PAN: Header + Attributes list with UPDATE/NO UPDATE option
      const attrs = node.attributes || [];
      const attrRows = attrs.map(attr => `
        <div class="pan-attr-row">
          <span class="pan-attr-label">Attribute: <strong class="pan-attr-name">${this.escapeHtml(attr.name)}</strong></span>
          <span class="update-tag ${(attr.updateType === UPDATE_TYPES.UPDATE) ? 'tag-update' : 'tag-no-update'}">
            ${this.escapeHtml(attr.updateType || UPDATE_TYPES.UPDATE)}
          </span>
        </div>
      `).join('');

      return `
        <div class="node-header">
          <span class="node-badge pan-tag">PAN</span>
          <span class="node-name">${this.escapeHtml(node.name)}</span>
        </div>
        <div class="pan-section-header">Attributes (${attrs.length})</div>
        <div class="pan-attributes-list">
          ${attrRows || '<div class="pan-empty-hint">No attributes</div>'}
        </div>
        <div class="node-anchor anchor-top" data-anchor="top" title="Connect Top"></div>
        <div class="node-anchor anchor-right" data-anchor="right" title="Connect Right"></div>
        <div class="node-anchor anchor-bottom" data-anchor="bottom" title="Connect Bottom"></div>
        <div class="node-anchor anchor-left" data-anchor="left" title="Connect Left"></div>
      `;
    } else {
      // ADAT: Header + Nature + Attributes list
      const isStructured = (node.nature || NATURE_TYPES.STRUCTURED) === NATURE_TYPES.STRUCTURED;
      const natureClass = isStructured ? 'structured' : 'unstructured';
      const natureLabel = isStructured ? 'Structured' : 'Unstructured';

      const attrs = node.attributes || [];
      const attrRows = attrs.map(attr => `
        <div class="adat-attr-row">
          <span class="attr-n">${this.escapeHtml(attr.name)}</span>
          <span class="kind-tag ${attr.dataKind === DATA_KINDS.NUMERIC ? 'num' : 'non-num'}">
            ${this.escapeHtml(attr.dataKind || DATA_KINDS.NON_NUMERIC)}
          </span>
        </div>
      `).join('');

      return `
        <div class="node-header">
          <span class="node-badge adat-tag">ADAT</span>
          <span class="node-name">${this.escapeHtml(node.name)}</span>
        </div>
        
        <!-- Section 1: Nature -->
        <div class="adat-section-block">
          <div class="adat-section-header">Nature</div>
          <div class="adat-nature-display">
            <span class="nature-value-badge ${natureClass}">${natureLabel}</span>
          </div>
        </div>

        <!-- Section 2: Attributes -->
        <div class="adat-section-block">
          <div class="adat-section-header">Attributes (${attrs.length})</div>
          <div class="adat-attributes-list">
            ${attrRows || '<div class="adat-empty-hint">No attributes</div>'}
          </div>
        </div>

        <!-- Connection Anchors -->
        <div class="node-anchor anchor-top" data-anchor="top" title="Connect Top"></div>
        <div class="node-anchor anchor-right" data-anchor="right" title="Connect Right"></div>
        <div class="node-anchor anchor-bottom" data-anchor="bottom" title="Connect Bottom"></div>
        <div class="node-anchor anchor-left" data-anchor="left" title="Connect Left"></div>
      `;
    }
  }

  bindNodeAnchors(nodeEl, node) {
    const anchors = nodeEl.querySelectorAll('.node-anchor');
    anchors.forEach(anchorEl => {
      anchorEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const anchorType = anchorEl.getAttribute('data-anchor');
        const pos = this.getAnchorPosition(node, anchorType);
        
        this.isConnecting = true;
        this.connectionStart = {
          nodeId: node.id,
          anchor: anchorType,
          x: pos.x,
          y: pos.y
        };
      });

      anchorEl.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        if (this.isConnecting && this.connectionStart && this.connectionStart.nodeId !== node.id) {
          const targetAnchor = anchorEl.getAttribute('data-anchor');
          this.completeConnection(node.id, targetAnchor);
        }
      });
    });
  }

  updateNodeElementPosition(node) {
    const el = document.getElementById(`node-${node.id}`);
    if (el) {
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
    }
  }

  removeNodeElement(id) {
    const el = document.getElementById(`node-${id}`);
    if (el) el.remove();
  }

  // --- Line Connection Creation ---

  setActiveLinkType(linkType) {
    this.activeLinkType = linkType;
  }

  completeConnection(targetNodeId, targetAnchor = null) {
    if (!this.connectionStart) return;

    const sourceId = this.connectionStart.nodeId;
    const sourceAnchor = this.connectionStart.anchor;
    const linkType = this.activeLinkType;

    const result = this.model.createEdge(sourceId, targetNodeId, linkType, {
      sourceAnchor: sourceAnchor || null,
      targetAnchor: targetAnchor || null
    });

    if (result.error) {
      window.dispatchEvent(new CustomEvent('show_toast', { detail: { message: result.error, type: 'error' } }));
    } else {
      this.selectElement('edge', result.edge.id);
      const label = LINK_LABELS[linkType] || linkType;
      window.dispatchEvent(new CustomEvent('show_toast', { detail: { message: `Connected via ${label}`, type: 'success' } }));
    }

    this.cancelConnection();
  }

  cancelConnection() {
    this.isConnecting = false;
    this.connectionStart = null;
    this.tempLine.classList.add('hidden');
    this.tempLine.setAttribute('d', '');
  }

  // --- Dynamic Smart Anchor Resolution ---
  getSmartAnchorPair(sourceNode, targetNode, preferredSource = null, preferredTarget = null) {
    const sW = sourceNode.width || 250;
    const sH = sourceNode.height || 140;
    const tW = targetNode.width || 250;
    const tH = targetNode.height || 140;

    const sCenterX = sourceNode.x + sW / 2;
    const sCenterY = sourceNode.y + sH / 2;
    const tCenterX = targetNode.x + tW / 2;
    const tCenterY = targetNode.y + tH / 2;

    const dx = tCenterX - sCenterX;
    const dy = tCenterY - sCenterY;

    let sAnchor = preferredSource;
    let tAnchor = preferredTarget;

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) {
        sAnchor = 'right';
        tAnchor = 'left';
      } else {
        sAnchor = 'left';
        tAnchor = 'right';
      }
    } else {
      if (dy > 0) {
        sAnchor = 'bottom';
        tAnchor = 'top';
      } else {
        sAnchor = 'top';
        tAnchor = 'bottom';
      }
    }

    return { sAnchor, tAnchor };
  }

  // --- Connection SVG Rendering ---

  renderAllConnections() {
    this.connectionsGroup.innerHTML = '';
    
    // Group incoming connections by target node to calculate dynamic port offsets
    const incomingByTarget = new Map();
    this.model.edges.forEach(edge => {
      if (!incomingByTarget.has(edge.targetId)) {
        incomingByTarget.set(edge.targetId, []);
      }
      incomingByTarget.get(edge.targetId).push(edge);
    });

    this.model.edges.forEach(edge => {
      const sourceNode = this.model.nodes.get(edge.sourceId);
      const targetNode = this.model.nodes.get(edge.targetId);
      if (!sourceNode || !targetNode) return;

      const { sAnchor, tAnchor } = this.getSmartAnchorPair(
        sourceNode,
        targetNode,
        edge.sourceAnchor,
        edge.targetAnchor
      );

      let sourcePos = this.getAnchorPosition(sourceNode, sAnchor);
      let targetPos = this.getAnchorPosition(targetNode, tAnchor);

      const incomingList = incomingByTarget.get(edge.targetId) || [edge];
      if (incomingList.length > 1) {
        const edgeIndex = incomingList.indexOf(edge);
        const total = incomingList.length;
        const spread = Math.min(140, (tAnchor === 'top' || tAnchor === 'bottom' ? targetNode.width || 250 : targetNode.height || 140) * 0.7);
        const step = spread / (total + 1);
        const offset = (edgeIndex + 1) * step - (spread / 2);

        if (tAnchor === 'top' || tAnchor === 'bottom') {
          targetPos.x += offset;
        } else {
          targetPos.y += offset;
        }
      }

      this.renderEdgePathAndHead(edge, sourcePos, targetPos, sAnchor, tAnchor);
    });
  }

  renderEdgePathAndHead(edge, sourcePos, targetPos, sAnchor, tAnchor) {
    const color = this.getLinkColor(edge.linkType);
    let pathData = '';
    let arrivalAngle = 0;
    let departureAngle = 0;

    if (edge.waypoint) {
      pathData = `M ${sourcePos.x} ${sourcePos.y} Q ${edge.waypoint.x} ${edge.waypoint.y}, ${targetPos.x} ${targetPos.y}`;
      arrivalAngle = Math.atan2(targetPos.y - edge.waypoint.y, targetPos.x - edge.waypoint.x);
      departureAngle = Math.atan2(edge.waypoint.y - sourcePos.y, edge.waypoint.x - sourcePos.x);
    } else {
      const bezier = this.getBezierControlPoints(
        sourcePos.x, sourcePos.y,
        targetPos.x, targetPos.y,
        sAnchor, tAnchor
      );
      pathData = `M ${sourcePos.x} ${sourcePos.y} C ${bezier.cx1} ${bezier.cy1}, ${bezier.cx2} ${bezier.cy2}, ${targetPos.x} ${targetPos.y}`;
      arrivalAngle = Math.atan2(targetPos.y - bezier.cy2, targetPos.x - bezier.cx2);
      departureAngle = Math.atan2(bezier.cy1 - sourcePos.y, bezier.cx1 - sourcePos.x);
    }

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.id = `edge-group-${edge.id}`;
    group.className.baseVal = `connection-line-group ${this.selectedElement?.id === edge.id ? 'selected' : ''}`;

    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', pathData);
    hitPath.className.baseVal = 'connection-path-bg';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.className.baseVal = `connection-path ${this.getLinkClass(edge.linkType)}`;

    group.appendChild(hitPath);
    group.appendChild(path);

    // Directional head symbol for Specialization, Derived, Container, Complex
    const headSymbol = this.createDirectionalHeadSymbol(edge.linkType, targetPos.x, targetPos.y, arrivalAngle);
    if (headSymbol) {
      group.appendChild(headSymbol);
    }

    // ISAB: Multiplicity positioned right at the intersection of the line with each node
    if (edge.linkType === LINK_TYPES.SOLID) {
      // 1. Adat Multiplicity (Near Source Node Intersection)
      const adatMulti = edge.adatMultiplicity || '';
      if (adatMulti.trim()) {
        const dist = 24;
        const m1X = sourcePos.x + Math.cos(departureAngle) * dist;
        const m1Y = sourcePos.y + Math.sin(departureAngle) * dist;
        const badge1 = this.createMultiplicityBadge(m1X, m1Y, adatMulti.trim());
        group.appendChild(badge1);
      }

      // 2. Pan Multiplicity (Near Target Node Intersection)
      const panMulti = edge.panMultiplicity || '';
      if (panMulti.trim()) {
        const dist = 24;
        const m2X = targetPos.x - Math.cos(arrivalAngle) * dist;
        const m2Y = targetPos.y - Math.sin(arrivalAngle) * dist;
        const badge2 = this.createMultiplicityBadge(m2X, m2Y, panMulti.trim());
        group.appendChild(badge2);
      }
    }

    // Draggable Waypoint Handle for user-defined placement
    if (this.selectedElement?.id === edge.id) {
      const wpX = edge.waypoint ? edge.waypoint.x : (sourcePos.x + targetPos.x) / 2;
      const wpY = edge.waypoint ? edge.waypoint.y : (sourcePos.y + targetPos.y) / 2;
      group.appendChild(this.createWaypointHandle(edge.id, wpX, wpY));
    }

    group.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectElement('edge', edge.id);
    });

    this.connectionsGroup.appendChild(group);
  }

  createMultiplicityBadge(x, y, text) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.className.baseVal = 'multiplicity-badge-group';

    const width = Math.max(26, text.length * 9 + 12);
    const height = 20;

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.className.baseVal = 'multiplicity-badge-bg';
    bg.setAttribute('x', x - width / 2);
    bg.setAttribute('y', y - height / 2);
    bg.setAttribute('width', width);
    bg.setAttribute('height', height);

    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.className.baseVal = 'multiplicity-badge-text';
    txt.setAttribute('x', x);
    txt.setAttribute('y', y);
    txt.textContent = text;

    g.appendChild(bg);
    g.appendChild(txt);
    return g;
  }

  createDirectionalHeadSymbol(linkType, tipX, tipY, angleRad) {
    if (linkType === LINK_TYPES.SOLID) return null;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.className.baseVal = 'directional-head-symbol';

    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const perpX = -sin;
    const perpY = cos;

    if (linkType === LINK_TYPES.UML_INHERITANCE) {
      const length = 16;
      const halfWidth = 9;

      const baseX = tipX - length * cos;
      const baseY = tipY - length * sin;

      const p1x = tipX;
      const p1y = tipY;
      const p2x = baseX + halfWidth * perpX;
      const p2y = baseY + halfWidth * perpY;
      const p3x = baseX - halfWidth * perpX;
      const p3y = baseY - halfWidth * perpY;

      const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      tri.setAttribute('points', `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
      tri.setAttribute('fill', '#FFFFFF');
      tri.setAttribute('stroke', '#7C3AED');
      tri.setAttribute('stroke-width', '2.2');
      g.appendChild(tri);
      return g;

    } else if (linkType === LINK_TYPES.DISJOINT_D) {
      const length = 20;
      const halfWidth = 11;

      const baseX = tipX - length * cos;
      const baseY = tipY - length * sin;

      const p1x = tipX;
      const p1y = tipY;
      const p2x = baseX + halfWidth * perpX;
      const p2y = baseY + halfWidth * perpY;
      const p3x = baseX - halfWidth * perpX;
      const p3y = baseY - halfWidth * perpY;

      const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      tri.setAttribute('points', `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
      tri.setAttribute('fill', '#FDF2F8');
      tri.setAttribute('stroke', '#DB2777');
      tri.setAttribute('stroke-width', '2.2');
      g.appendChild(tri);

      const centerX = tipX - (length * 0.6) * cos;
      const centerY = tipY - (length * 0.6) * sin;

      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', centerX);
      txt.setAttribute('y', centerY + 3.5);
      txt.setAttribute('font-size', '10');
      txt.setAttribute('font-family', 'Inter, sans-serif');
      txt.setAttribute('font-weight', '800');
      txt.setAttribute('fill', '#BE185D');
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = 'D';
      g.appendChild(txt);
      return g;

    } else if (linkType === LINK_TYPES.COMPLETE_C) {
      const length = 20;
      const halfWidth = 11;

      const baseX = tipX - length * cos;
      const baseY = tipY - length * sin;

      const p1x = tipX;
      const p1y = tipY;
      const p2x = baseX + halfWidth * perpX;
      const p2y = baseY + halfWidth * perpY;
      const p3x = baseX - halfWidth * perpX;
      const p3y = baseY - halfWidth * perpY;

      const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      tri.setAttribute('points', `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
      tri.setAttribute('fill', '#ECFDF5');
      tri.setAttribute('stroke', '#059669');
      tri.setAttribute('stroke-width', '2.2');
      g.appendChild(tri);

      const centerX = tipX - (length * 0.6) * cos;
      const centerY = tipY - (length * 0.6) * sin;

      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', centerX);
      txt.setAttribute('y', centerY + 3.5);
      txt.setAttribute('font-size', '10');
      txt.setAttribute('font-family', 'Inter, sans-serif');
      txt.setAttribute('font-weight', '800');
      txt.setAttribute('fill', '#047857');
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = 'C';
      g.appendChild(txt);
      return g;

    } else if (linkType === LINK_TYPES.AGGREGATION_DIAMOND) {
      const length = 18;
      const halfWidth = 7;

      const midX = tipX - (length / 2) * cos;
      const midY = tipY - (length / 2) * sin;
      const backX = tipX - length * cos;
      const backY = tipY - length * sin;

      const p1x = tipX;
      const p1y = tipY;
      const p2x = midX + halfWidth * perpX;
      const p2y = midY + halfWidth * perpY;
      const p3x = backX;
      const p3y = backY;
      const p4x = midX - halfWidth * perpX;
      const p4y = midY - halfWidth * perpY;

      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}`);
      poly.setAttribute('fill', '#FFFBEB');
      poly.setAttribute('stroke', '#D97706');
      poly.setAttribute('stroke-width', '2.2');
      g.appendChild(poly);
      return g;
    }

    return null;
  }

  createWaypointHandle(edgeId, x, y) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '7');
    circle.className.baseVal = 'waypoint-handle';
    circle.setAttribute('title', 'Drag to move connection path');

    circle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.isDraggingWaypoint = true;
      this.draggedWaypointEdgeId = edgeId;
    });

    return circle;
  }

  getLinkClass(linkType) {
    switch (linkType) {
      case LINK_TYPES.SOLID: return 'link-solid';
      case LINK_TYPES.UML_INHERITANCE: return 'link-uml-inheritance';
      case LINK_TYPES.DISJOINT_D: return 'link-disjoint-d';
      case LINK_TYPES.COMPLETE_C: return 'link-complete-c';
      case LINK_TYPES.AGGREGATION_DIAMOND: return 'link-aggregation';
      default: return 'link-solid';
    }
  }

  getLinkColor(linkType) {
    switch (linkType) {
      case LINK_TYPES.SOLID: return '#2563EB';
      case LINK_TYPES.UML_INHERITANCE: return '#7C3AED';
      case LINK_TYPES.DISJOINT_D: return '#DB2777';
      case LINK_TYPES.COMPLETE_C: return '#059669';
      case LINK_TYPES.AGGREGATION_DIAMOND: return '#D97706';
      default: return '#2563EB';
    }
  }

  getAnchorPosition(node, anchor) {
    const el = document.getElementById(`node-${node.id}`);
    const width = el ? el.offsetWidth : (node.width || 250);
    const height = el ? el.offsetHeight : (node.height || 140);

    switch (anchor) {
      case 'top':
        return { x: node.x + width / 2, y: node.y };
      case 'right':
        return { x: node.x + width, y: node.y + height / 2 };
      case 'bottom':
        return { x: node.x + width / 2, y: node.y + height };
      case 'left':
        return { x: node.x, y: node.y + height / 2 };
      default:
        return { x: node.x + width / 2, y: node.y + height / 2 };
    }
  }

  getBezierControlPoints(x1, y1, x2, y2, sourceAnchor = 'bottom', targetAnchor = 'top') {
    const dx = Math.abs(x2 - x1) * 0.5;
    const dy = Math.abs(y2 - y1) * 0.5;
    const offset = Math.max(35, Math.min(dx, dy));

    let cx1 = x1;
    let cy1 = y1;
    let cx2 = x2;
    let cy2 = y2;

    if (sourceAnchor === 'right') cx1 += offset;
    else if (sourceAnchor === 'left') cx1 -= offset;
    else if (sourceAnchor === 'bottom') cy1 += offset;
    else if (sourceAnchor === 'top') cy1 -= offset;

    if (targetAnchor === 'left') cx2 -= offset;
    else if (targetAnchor === 'right') cx2 += offset;
    else if (targetAnchor === 'top') cy2 -= offset;
    else if (targetAnchor === 'bottom') cy2 += offset;

    return { cx1, cy1, cx2, cy2 };
  }

  calculateBezierPath(x1, y1, x2, y2, sourceAnchor = 'bottom', targetAnchor = 'top') {
    const { cx1, cy1, cx2, cy2 } = this.getBezierControlPoints(x1, y1, x2, y2, sourceAnchor, targetAnchor);
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
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
