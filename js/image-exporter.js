/**
 * image-exporter.js
 * High-Resolution Image Exporter and CSV/TXT Schema Package Generator
 * Generates:
 * 1. Schema Diagram Image (PNG / SVG / JPEG)
 * 2. PANCSVFiles/<PAN NAME>.TXT (<PAN Name>,<attribute>,<update/no update>)
 * 3. AdatCSVFiles/<ADAT NAME>.TXT (<ADAT Name>,<structured/unstructured>,<attribute>,<data type>)
 * 4. ISAB.TXT (<Adat name>,<attribute of Adat>,<Pan Name>,<Additivity value>,<Adat multiplicity Pan multiplicity>,<Applicability value>)
 */

import { LINK_TYPES, NODE_TYPES, DATA_KINDS, NATURE_TYPES, UPDATE_TYPES, BOOLEAN_OPTIONS } from './schema-model.js';

export class ImageExporter {
  constructor(canvasEngine, model) {
    this.canvas = canvasEngine;
    this.model = model;
  }

  getSchemaBounds(padding = 60) {
    if (this.model.nodes.size === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    this.model.nodes.forEach(n => {
      const el = document.getElementById(`node-${n.id}`);
      const w = el ? el.offsetWidth : (n.width || 250);
      const h = el ? el.offsetHeight : (n.height || 140);

      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    });

    this.model.edges.forEach(e => {
      if (e.waypoint) {
        minX = Math.min(minX, e.waypoint.x);
        minY = Math.min(minY, e.waypoint.y);
        maxX = Math.max(maxX, e.waypoint.x);
        maxY = Math.max(maxY, e.waypoint.y);
      }
    });

    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(400, maxX - minX),
      height: Math.max(300, maxY - minY)
    };
  }

  // --- SVG Vector Generator ---

  generateSVGString(bgColor = '#ffffff') {
    const bounds = this.getSchemaBounds(60);
    const width = bounds.width;
    const height = bounds.height;

    const svgDefs = document.querySelector('#canvas-svg defs')?.innerHTML || '';

    const incomingByTarget = new Map();
    this.model.edges.forEach(edge => {
      if (!incomingByTarget.has(edge.targetId)) {
        incomingByTarget.set(edge.targetId, []);
      }
      incomingByTarget.get(edge.targetId).push(edge);
    });

    let connectionsSVG = '';

    this.model.edges.forEach(edge => {
      const src = this.model.nodes.get(edge.sourceId);
      const tgt = this.model.nodes.get(edge.targetId);
      if (!src || !tgt) return;

      const { sAnchor, tAnchor } = this.canvas.getSmartAnchorPair(
        src,
        tgt,
        edge.sourceAnchor,
        edge.targetAnchor
      );

      let sPos = this.canvas.getAnchorPosition(src, sAnchor);
      let tPos = this.canvas.getAnchorPosition(tgt, tAnchor);

      const incomingList = incomingByTarget.get(edge.targetId) || [edge];
      if (incomingList.length > 1) {
        const edgeIndex = incomingList.indexOf(edge);
        const total = incomingList.length;
        const spread = Math.min(140, (tAnchor === 'top' || tAnchor === 'bottom' ? tgt.width || 250 : tgt.height || 140) * 0.7);
        const step = spread / (total + 1);
        const offset = (edgeIndex + 1) * step - (spread / 2);

        if (tAnchor === 'top' || tAnchor === 'bottom') {
          tPos.x += offset;
        } else {
          tPos.y += offset;
        }
      }

      const sX = sPos.x - bounds.minX;
      const sY = sPos.y - bounds.minY;
      const tX = tPos.x - bounds.minX;
      const tY = tPos.y - bounds.minY;
      const color = this.canvas.getLinkColor(edge.linkType);

      let d = '';
      let arrivalAngle = 0;
      let departureAngle = 0;

      if (edge.waypoint) {
        const wpX = edge.waypoint.x - bounds.minX;
        const wpY = edge.waypoint.y - bounds.minY;
        d = `M ${sX} ${sY} Q ${wpX} ${wpY}, ${tX} ${tY}`;
        arrivalAngle = Math.atan2(tY - wpY, tX - wpX);
        departureAngle = Math.atan2(wpY - sY, wpX - sX);
      } else {
        const bezier = this.canvas.getBezierControlPoints(sX, sY, tX, tY, sAnchor, tAnchor);
        d = `M ${sX} ${sY} C ${bezier.cx1} ${bezier.cy1}, ${bezier.cx2} ${bezier.cy2}, ${tX} ${tY}`;
        arrivalAngle = Math.atan2(tY - bezier.cy2, tX - bezier.cx2);
        departureAngle = Math.atan2(bezier.cy1 - sY, bezier.cx1 - sX);
      }

      connectionsSVG += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.6"/>`;
      connectionsSVG += this.generateDirectionalHeadSymbolSVG(edge.linkType, tX, tY, arrivalAngle);

      if (edge.linkType === LINK_TYPES.SOLID) {
        const adatMulti = (edge.adatMultiplicity || '').trim();
        if (adatMulti) {
          const m1X = sX + Math.cos(departureAngle) * 24;
          const m1Y = sY + Math.sin(departureAngle) * 24;
          const w = Math.max(26, adatMulti.length * 9 + 12);
          connectionsSVG += `
            <rect x="${m1X - w/2}" y="${m1Y - 10}" width="${w}" height="20" rx="5" fill="#FFFFFF" stroke="#2563EB" stroke-width="1.5"/>
            <text x="${m1X}" y="${m1Y}" fill="#1D4ED8" font-size="12" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${this.escapeXml(adatMulti)}</text>
          `;
        }

        const panMulti = (edge.panMultiplicity || '').trim();
        if (panMulti) {
          const m2X = tX - Math.cos(arrivalAngle) * 24;
          const m2Y = tY - Math.sin(arrivalAngle) * 24;
          const w = Math.max(26, panMulti.length * 9 + 12);
          connectionsSVG += `
            <rect x="${m2X - w/2}" y="${m2Y - 10}" width="${w}" height="20" rx="5" fill="#FFFFFF" stroke="#2563EB" stroke-width="1.5"/>
            <text x="${m2X}" y="${m2Y}" fill="#1D4ED8" font-size="12" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${this.escapeXml(panMulti)}</text>
          `;
        }
      }
    });

    let nodesSVG = '';
    this.model.nodes.forEach(node => {
      const el = document.getElementById(`node-${node.id}`);
      const w = el ? el.offsetWidth : (node.width || 250);
      const h = el ? el.offsetHeight : (node.height || 140);
      const x = node.x - bounds.minX;
      const y = node.y - bounds.minY;

      if (node.type === 'PAN') {
        const attrs = node.attributes || [];
        let attrRowsSvg = '';
        attrs.forEach((a, i) => {
          const rowY = 56 + (i * 26);
          const isUpdate = (a.updateType === 'UPDATE');
          const tagBg = isUpdate ? '#ECFDF5' : '#F1F5F9';
          const tagColor = isUpdate ? '#047857' : '#475569';
          const tagBorder = isUpdate ? '#A7F3D0' : '#CBD5E1';
          const tagText = isUpdate ? 'UPDATE' : 'NO UPDATE';
          const tagW = isUpdate ? 64 : 86;

          attrRowsSvg += `
            <text x="12" y="${rowY}" fill="#64748B" font-size="11" font-family="sans-serif">Attribute: <tspan fill="#0F172A" font-weight="bold" font-family="monospace">${this.escapeXml(a.name)}</tspan></text>
            <rect x="${w - tagW - 12}" y="${rowY - 12}" width="${tagW}" height="17" rx="4" fill="${tagBg}" stroke="${tagBorder}" stroke-width="1"/>
            <text x="${w - (tagW/2) - 12}" y="${rowY}" fill="${tagColor}" font-size="9.5" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${tagText}</text>
          `;
        });

        nodesSVG += `
          <g transform="translate(${x}, ${y})">
            <rect width="${w}" height="${h}" rx="12" fill="#FFFFFF" stroke="#0284C7" stroke-width="2.5"/>
            <path d="M 0 12 Q 0 0 12 0 L ${w - 12} 0 Q ${w} 0 ${w} 12 L ${w} 34 L 0 34 Z" fill="#F0F9FF"/>
            <line x1="0" y1="34" x2="${w}" y2="34" stroke="#BAE6FD" stroke-width="1"/>
            
            <rect x="10" y="7" width="38" height="20" rx="4" fill="rgba(2, 132, 199, 0.1)" stroke="#0284C7" stroke-width="1"/>
            <text x="29" y="21" fill="#0284C7" font-size="11" font-family="sans-serif" font-weight="bold" text-anchor="middle">PAN</text>
            <text x="56" y="22" fill="#0369A1" font-size="15" font-family="sans-serif" font-weight="800">${this.escapeXml(node.name)}</text>
            
            <rect x="0" y="34" width="${w}" height="18" fill="#F8FAFC"/>
            <text x="12" y="47" fill="#0284C7" font-size="9.5" font-family="sans-serif" font-weight="bold">ATTRIBUTES (${attrs.length})</text>
            
            ${attrRowsSvg || `<text x="12" y="68" fill="#94A3B8" font-size="10" font-family="sans-serif" font-style="italic">No attributes</text>`}
          </g>
        `;
      } else {
        const isStructured = (node.nature || 'Structured') === 'Structured';
        const natureBg = isStructured ? '#ECFDF5' : '#FFFBEB';
        const natureColor = isStructured ? '#047857' : '#B45309';
        const natureBorder = isStructured ? '#A7F3D0' : '#FDE68A';
        const natureText = isStructured ? 'Structured' : 'Unstructured';

        const attrs = node.attributes || [];
        let attrSvg = '';
        attrs.forEach((a, i) => {
          const rowY = 96 + (i * 24);
          const isNum = (a.dataKind === 'Numeric');
          const kindBg = isNum ? '#EFF6FF' : '#F5F3FF';
          const kindColor = isNum ? '#1D4ED8' : '#6D28D9';
          const kindBorder = isNum ? '#BFDBFE' : '#DDD6FE';
          const tagW = isNum ? 62 : 84;

          attrSvg += `
            <text x="12" y="${rowY}" fill="#1E293B" font-size="12" font-family="monospace" font-weight="bold">${this.escapeXml(a.name)}</text>
            <rect x="${w - tagW - 12}" y="${rowY - 12}" width="${tagW}" height="17" rx="4" fill="${kindBg}" stroke="${kindBorder}" stroke-width="1"/>
            <text x="${w - (tagW/2) - 12}" y="${rowY}" fill="${kindColor}" font-size="10" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${this.escapeXml(a.dataKind || 'Non Numeric')}</text>
          `;
        });

        nodesSVG += `
          <g transform="translate(${x}, ${y})">
            <rect width="${w}" height="${h}" rx="8" fill="#FFFFFF" stroke="#4F46E5" stroke-width="2.5"/>
            <path d="M 0 8 Q 0 0 8 0 L ${w - 8} 0 Q ${w} 0 ${w} 8 L ${w} 34 L 0 34 Z" fill="#EEF2FF"/>
            <line x1="0" y1="34" x2="${w}" y2="34" stroke="#C7D2FE" stroke-width="1"/>
            
            <rect x="10" y="7" width="44" height="20" rx="4" fill="rgba(79, 70, 229, 0.1)" stroke="#4F46E5" stroke-width="1"/>
            <text x="32" y="21" fill="#4F46E5" font-size="11" font-family="sans-serif" font-weight="bold" text-anchor="middle">ADAT</text>
            <text x="${w - 12}" y="23" fill="#1E1B4B" font-size="16" font-family="sans-serif" font-weight="800" text-anchor="end">${this.escapeXml(node.name)}</text>
            
            <rect x="0" y="34" width="${w}" height="18" fill="#F8FAFC"/>
            <text x="12" y="47" fill="#4F46E5" font-size="9.5" font-family="sans-serif" font-weight="bold">NATURE</text>
            <rect x="12" y="55" width="${isStructured ? 72 : 86}" height="18" rx="9" fill="${natureBg}" stroke="${natureBorder}" stroke-width="1"/>
            <text x="${12 + (isStructured ? 36 : 43)}" y="67.5" fill="${natureColor}" font-size="9.5" font-family="sans-serif" font-weight="bold" text-anchor="middle">${natureText}</text>
            
            <line x1="0" y1="78" x2="${w}" y2="78" stroke="#E2E8F0" stroke-width="1"/>
            
            <rect x="0" y="78" width="${w}" height="18" fill="#F8FAFC"/>
            <text x="12" y="91" fill="#4F46E5" font-size="9.5" font-family="sans-serif" font-weight="bold">ATTRIBUTES (${attrs.length})</text>
            
            ${attrSvg || `<text x="12" y="110" fill="#94A3B8" font-size="10" font-family="sans-serif" font-style="italic">No attributes</text>`}
          </g>
        `;
      }
    });

    const bgRect = (bgColor && bgColor !== 'transparent') 
      ? `<rect width="${width}" height="${height}" fill="${bgColor}"/>` 
      : '';

    return `<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    ${svgDefs}
  </defs>
  ${bgRect}
  <g id="export-connections">${connectionsSVG}</g>
  <g id="export-nodes">${nodesSVG}</g>
</svg>`;
  }

  generateDirectionalHeadSymbolSVG(linkType, tipX, tipY, angleRad) {
    if (linkType === LINK_TYPES.SOLID) return '';

    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const perpX = -sin;
    const perpY = cos;

    if (linkType === LINK_TYPES.UML_INHERITANCE) {
      const length = 16;
      const halfWidth = 9;
      const baseX = tipX - length * cos;
      const baseY = tipY - length * sin;
      return `<polygon points="${tipX},${tipY} ${baseX + halfWidth * perpX},${baseY + halfWidth * perpY} ${baseX - halfWidth * perpX},${baseY - halfWidth * perpY}" fill="#FFFFFF" stroke="#7C3AED" stroke-width="2.2"/>`;
    } else if (linkType === LINK_TYPES.DISJOINT_D) {
      const length = 20;
      const halfWidth = 11;
      const baseX = tipX - length * cos;
      const baseY = tipY - length * sin;
      const centerX = tipX - (length * 0.6) * cos;
      const centerY = tipY - (length * 0.6) * sin;
      return `
        <polygon points="${tipX},${tipY} ${baseX + halfWidth * perpX},${baseY + halfWidth * perpY} ${baseX - halfWidth * perpX},${baseY - halfWidth * perpY}" fill="#FDF2F8" stroke="#DB2777" stroke-width="2.2"/>
        <text x="${centerX}" y="${centerY + 3.5}" font-size="10" font-family="sans-serif" font-weight="bold" fill="#BE185D" text-anchor="middle">D</text>
      `;
    } else if (linkType === LINK_TYPES.COMPLETE_C) {
      const length = 20;
      const halfWidth = 11;
      const baseX = tipX - length * cos;
      const baseY = tipY - length * sin;
      const centerX = tipX - (length * 0.6) * cos;
      const centerY = tipY - (length * 0.6) * sin;
      return `
        <polygon points="${tipX},${tipY} ${baseX + halfWidth * perpX},${baseY + halfWidth * perpY} ${baseX - halfWidth * perpX},${baseY - halfWidth * perpY}" fill="#ECFDF5" stroke="#059669" stroke-width="2.2"/>
        <text x="${centerX}" y="${centerY + 3.5}" font-size="10" font-family="sans-serif" font-weight="bold" fill="#047857" text-anchor="middle">C</text>
      `;
    } else if (linkType === LINK_TYPES.AGGREGATION_DIAMOND) {
      const length = 18;
      const halfWidth = 7;
      const midX = tipX - (length / 2) * cos;
      const midY = tipY - (length / 2) * sin;
      const backX = tipX - length * cos;
      const backY = tipY - length * sin;
      return `<polygon points="${tipX},${tipY} ${midX + halfWidth * perpX},${midY + halfWidth * perpY} ${backX},${backY} ${midX - halfWidth * perpX},${midY - halfWidth * perpY}" fill="#FFFBEB" stroke="#D97706" stroke-width="2.2"/>`;
    }
    return '';
  }

  async exportToRaster(format = 'png', scale = 2, bgColor = '#ffffff') {
    const svgString = this.generateSVGString(bgColor);
    const bounds = this.getSchemaBounds(60);
    const width = bounds.width * scale;
    const height = bounds.height * scale;

    return new Promise((resolve, reject) => {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (bgColor && bgColor !== 'transparent') {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const dataUrl = canvas.toDataURL(mimeType, 0.95);
        resolve({ dataUrl, svgString, width, height });
      };

      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };

      img.src = url;
    });
  }

  // --- CSV / TXT Schema Export Package Generators ---

  /**
   * Converts multi-word names into single words with underscores
   */
  formatName(name) {
    if (!name) return '';
    return name.trim().replace(/[\s\-]+/g, '_');
  }

  /**
   * Generates PAN files map: { "<PAN NAME>.TXT": "<PAN Name>,<attribute>,<update/no update>" }
   */
  generatePANFiles() {
    const panFiles = {};
    const panNodes = Array.from(this.model.nodes.values()).filter(n => n.type === NODE_TYPES.PAN);

    panNodes.forEach(node => {
      const panName = this.formatName(node.name || 'PAN');
      const fileName = `${panName}.TXT`;
      const lines = [];
      const attrs = node.attributes || [];

      if (attrs.length === 0) {
        lines.push(`${panName},,`);
      } else {
        attrs.forEach(attr => {
          const attrName = this.formatName(attr.name || '');
          const updateOpt = (attr.updateType || UPDATE_TYPES.NO_UPDATE).trim();
          lines.push(`${panName},${attrName},${updateOpt}`);
        });
      }
      panFiles[fileName] = lines.join('\n');
    });

    return panFiles;
  }

  /**
   * Generates ADAT files map: { "<ADAT NAME>.TXT": "<ADAT Name>,<structured/unstructured>,<attribute>,<data type>" }
   */
  generateADATFiles() {
    const adatFiles = {};
    const adatNodes = Array.from(this.model.nodes.values()).filter(n => n.type === NODE_TYPES.ADAT);

    adatNodes.forEach(node => {
      const adatName = this.formatName(node.name || 'ADAT');
      const fileName = `${adatName}.TXT`;
      const nature = (node.nature || NATURE_TYPES.STRUCTURED).trim();
      const lines = [];
      const attrs = node.attributes || [];

      if (attrs.length === 0) {
        lines.push(`${adatName},${nature},,`);
      } else {
        attrs.forEach(attr => {
          const attrName = this.formatName(attr.name || '');
          const dataType = (attr.dataKind || DATA_KINDS.NUMERIC).trim();
          lines.push(`${adatName},${nature},${attrName},${dataType}`);
        });
      }
      adatFiles[fileName] = lines.join('\n');
    });

    return adatFiles;
  }

  /**
   * Generates ISAB.TXT content:
   * For each attribute of ADAT:
   *   For each ADAT-ISAB-PAN:
   *     <Adat name>,<attribute of Adat>,<Pan Name>,<Additivity value>,<Adat multiplicity Pan multiplicity>, <Applicability value>
   */
  generateISABFile() {
    const lines = [];
    const edges = Array.from(this.model.edges.values()).filter(e => e.linkType === LINK_TYPES.SOLID);
    const adatNodes = Array.from(this.model.nodes.values()).filter(n => n.type === NODE_TYPES.ADAT);

    adatNodes.forEach(adatNode => {
      // Find all ISAB edges connected to this ADAT and a PAN
      const isabEdges = edges.filter(e => {
        if (e.sourceId === adatNode.id) {
          const target = this.model.nodes.get(e.targetId);
          return target && target.type === NODE_TYPES.PAN;
        } else if (e.targetId === adatNode.id) {
          const source = this.model.nodes.get(e.sourceId);
          return source && source.type === NODE_TYPES.PAN;
        }
        return false;
      });

      const attrs = (adatNode.attributes && adatNode.attributes.length > 0) 
        ? adatNode.attributes 
        : [{ name: '' }];

      attrs.forEach(attr => {
        const attrName = this.formatName(attr.name || '');

        isabEdges.forEach(edge => {
          const panNode = (edge.sourceId === adatNode.id) 
            ? this.model.nodes.get(edge.targetId) 
            : this.model.nodes.get(edge.sourceId);
          
          if (!panNode) return;

          const adatName = this.formatName(adatNode.name || 'ADAT');
          const panName = this.formatName(panNode.name || 'PAN');
          const additivity = (edge.additivity || BOOLEAN_OPTIONS.TRUE).trim();
          const applicability = (edge.applicability || edge.associativity || BOOLEAN_OPTIONS.TRUE).trim();
          
          const adatMulti = (edge.adatMultiplicity || 'many').trim();
          const panMulti = (edge.panMultiplicity || 'many').trim();
          const multiplicityPair = `${adatMulti} ${panMulti}`.trim() || 'many many';

          lines.push(`${adatName},${attrName},${panName},${additivity},${multiplicityPair},${applicability}`);
        });
      });
    });

    return lines.join('\n');
  }

  /**
   * Generates AdatAdatMultilevel.Txt content:
   * (i) For root ADAT of a tree:
   *       For each immediate child of the parent:
   *         <type of tree specialization/derived/container/complex all in lower case>,<Parent Adat name>,<child Adat name>
   *       If the child Adat is a parent then goto (i)
   */
  generateAdatAdatMultilevelFile() {
    const adatNodes = Array.from(this.model.nodes.values()).filter(n => n.type === NODE_TYPES.ADAT);
    const adatIds = new Set(adatNodes.map(n => n.id));
    
    const treeLinkTypes = [
      LINK_TYPES.UML_INHERITANCE,
      LINK_TYPES.DISJOINT_D,
      LINK_TYPES.COMPLETE_C,
      LINK_TYPES.AGGREGATION_DIAMOND
    ];

    const adatEdges = Array.from(this.model.edges.values()).filter(
      e => adatIds.has(e.sourceId) && adatIds.has(e.targetId) && treeLinkTypes.includes(e.linkType)
    );

    const getLinkTypeName = (linkType) => {
      switch (linkType) {
        case LINK_TYPES.UML_INHERITANCE: return 'specialization';
        case LINK_TYPES.DISJOINT_D: return 'derived';
        case LINK_TYPES.COMPLETE_C: return 'container';
        case LINK_TYPES.AGGREGATION_DIAMOND: return 'complex';
        default: return 'specialization';
      }
    };

    const parentToChildren = new Map();
    const childToParent = new Map();

    adatEdges.forEach(edge => {
      const parentId = edge.targetId;
      const childId = edge.sourceId;
      const type = getLinkTypeName(edge.linkType);

      if (!parentToChildren.has(parentId)) {
        parentToChildren.set(parentId, []);
      }
      parentToChildren.get(parentId).push({ childId, type });
      childToParent.set(childId, parentId);
    });

    const allParents = Array.from(parentToChildren.keys());
    const rootParents = allParents.filter(pid => !childToParent.has(pid));

    const lines = [];
    const visited = new Set();

    const traverse = (parentId) => {
      if (visited.has(parentId)) return;
      visited.add(parentId);

      const parentNode = this.model.nodes.get(parentId);
      const parentName = this.formatName(parentNode?.name || 'ADAT');
      const children = parentToChildren.get(parentId) || [];

      children.forEach(({ childId, type }) => {
        const childNode = this.model.nodes.get(childId);
        const childName = this.formatName(childNode?.name || 'ADAT');
        lines.push(`${type},${parentName},${childName}`);
      });

      children.forEach(({ childId }) => {
        if (parentToChildren.has(childId)) {
          traverse(childId);
        }
      });
    };

    rootParents.forEach(rootId => traverse(rootId));

    return lines.join('\n');
  }

  /**
   * Generates PanPanMultilevel.txt content:
   * (ii) For root PAN of a tree:
   *        For each immediate child of the parent:
   *          <type of tree specialization/derived/container/complex all in lower case>,<Parent PAN name>,<child PAN name>
   *        If the child PAN is a parent then goto (ii)
   */
  generatePanPanMultilevelFile() {
    const panNodes = Array.from(this.model.nodes.values()).filter(n => n.type === NODE_TYPES.PAN);
    const panIds = new Set(panNodes.map(n => n.id));

    const treeLinkTypes = [
      LINK_TYPES.UML_INHERITANCE,
      LINK_TYPES.COMPLETE_C,
      LINK_TYPES.AGGREGATION_DIAMOND
    ];

    const panEdges = Array.from(this.model.edges.values()).filter(
      e => panIds.has(e.sourceId) && panIds.has(e.targetId) && treeLinkTypes.includes(e.linkType)
    );

    const getLinkTypeName = (linkType) => {
      switch (linkType) {
        case LINK_TYPES.UML_INHERITANCE: return 'specialization';
        case LINK_TYPES.COMPLETE_C: return 'container';
        case LINK_TYPES.AGGREGATION_DIAMOND: return 'complex';
        default: return 'specialization';
      }
    };

    const parentToChildren = new Map();
    const childToParent = new Map();

    panEdges.forEach(edge => {
      const parentId = edge.targetId;
      const childId = edge.sourceId;
      const type = getLinkTypeName(edge.linkType);

      if (!parentToChildren.has(parentId)) {
        parentToChildren.set(parentId, []);
      }
      parentToChildren.get(parentId).push({ childId, type });
      childToParent.set(childId, parentId);
    });

    const allParents = Array.from(parentToChildren.keys());
    const rootParents = allParents.filter(pid => !childToParent.has(pid));

    const lines = [];
    const visited = new Set();

    const traverse = (parentId) => {
      if (visited.has(parentId)) return;
      visited.add(parentId);

      const parentNode = this.model.nodes.get(parentId);
      const parentName = this.formatName(parentNode?.name || 'PAN');
      const children = parentToChildren.get(parentId) || [];

      children.forEach(({ childId, type }) => {
        const childNode = this.model.nodes.get(childId);
        const childName = this.formatName(childNode?.name || 'PAN');
        lines.push(`${type},${parentName},${childName}`);
      });

      children.forEach(({ childId }) => {
        if (parentToChildren.has(childId)) {
          traverse(childId);
        }
      });
    };

    rootParents.forEach(rootId => traverse(rootId));

    return lines.join('\n');
  }

  /**
   * Generates Input.txt content:
   * a. For every PAN tree:
   *      pan,<name of root Pan of the tree>, <type of link complex/specialization/container>
   *      (if specialization -> specialization1)
   * b. For every ADAT tree:
   *      If tree has different types of links:
   *        adat,<name of root Adat of the tree>, complex1,mixed
   *      else:
   *        adat,<name of root Adat of the tree>, <type of link>,notmixed
   *        (for complex: complex1 if all ADATs in tree link to exact same PANs else complex2)
   *        (for derived: derived1 if all ADATs in tree link to exact same PANs else derived2)
   * c. Atomic / standalone nodes
   */
  generateInputFile() {
    const lines = [];

    // Helper: Map link type
    const getLinkTypeName = (linkType) => {
      switch (linkType) {
        case LINK_TYPES.UML_INHERITANCE: return 'specialization';
        case LINK_TYPES.DISJOINT_D: return 'derived';
        case LINK_TYPES.COMPLETE_C: return 'container';
        case LINK_TYPES.AGGREGATION_DIAMOND: return 'complex';
        default: return 'specialization';
      }
    };

    // Helper: get linked PAN names for an ADAT
    const isabEdges = Array.from(this.model.edges.values()).filter(e => e.linkType === LINK_TYPES.SOLID);
    const getLinkedPanNames = (adatId) => {
      const pans = new Set();
      isabEdges.forEach(e => {
        if (e.sourceId === adatId) {
          const target = this.model.nodes.get(e.targetId);
          if (target && target.type === NODE_TYPES.PAN) pans.add(this.formatName(target.name || 'PAN'));
        } else if (e.targetId === adatId) {
          const source = this.model.nodes.get(e.sourceId);
          if (source && source.type === NODE_TYPES.PAN) pans.add(this.formatName(source.name || 'PAN'));
        }
      });
      return pans;
    };

    // 1. Process PAN trees & Atomic PANs
    const panNodes = Array.from(this.model.nodes.values()).filter(n => n.type === NODE_TYPES.PAN);
    const panIds = new Set(panNodes.map(n => n.id));
    const panTreeLinkTypes = [
      LINK_TYPES.UML_INHERITANCE,
      LINK_TYPES.COMPLETE_C,
      LINK_TYPES.AGGREGATION_DIAMOND
    ];
    const panEdges = Array.from(this.model.edges.values()).filter(
      e => panIds.has(e.sourceId) && panIds.has(e.targetId) && panTreeLinkTypes.includes(e.linkType)
    );

    const panParentToChildren = new Map();
    const panChildToParent = new Map();
    const panInvolvedInTree = new Set();

    panEdges.forEach(edge => {
      panInvolvedInTree.add(edge.sourceId);
      panInvolvedInTree.add(edge.targetId);
      if (!panParentToChildren.has(edge.targetId)) {
        panParentToChildren.set(edge.targetId, []);
      }
      panParentToChildren.get(edge.targetId).push({ childId: edge.sourceId, linkType: edge.linkType });
      panChildToParent.set(edge.sourceId, edge.targetId);
    });

    const panRootParents = Array.from(panParentToChildren.keys()).filter(pid => !panChildToParent.has(pid));

    panRootParents.forEach(rootId => {
      const rootNode = this.model.nodes.get(rootId);
      const rootName = this.formatName(rootNode?.name || 'PAN');
      const children = panParentToChildren.get(rootId) || [];
      const linkType = children.length > 0 ? getLinkTypeName(children[0].linkType) : 'specialization';
      const formattedLink = (linkType === 'specialization') ? 'specialization1' : (linkType === 'container' ? 'containment' : linkType);
      lines.push(`pan,${rootName},${formattedLink}`);
    });

    // Atomic PANs
    panNodes.forEach(node => {
      if (!panInvolvedInTree.has(node.id)) {
        lines.push(`pan,${this.formatName(node.name || 'PAN')},atomic`);
      }
    });

    // 2. Process ADAT trees & Atomic ADATs
    const adatNodes = Array.from(this.model.nodes.values()).filter(n => n.type === NODE_TYPES.ADAT);
    const adatIds = new Set(adatNodes.map(n => n.id));
    const adatTreeLinkTypes = [
      LINK_TYPES.UML_INHERITANCE,
      LINK_TYPES.DISJOINT_D,
      LINK_TYPES.COMPLETE_C,
      LINK_TYPES.AGGREGATION_DIAMOND
    ];
    const adatEdges = Array.from(this.model.edges.values()).filter(
      e => adatIds.has(e.sourceId) && adatIds.has(e.targetId) && adatTreeLinkTypes.includes(e.linkType)
    );

    const adatParentToChildren = new Map();
    const adatChildToParent = new Map();
    const adatInvolvedInTree = new Set();

    adatEdges.forEach(edge => {
      adatInvolvedInTree.add(edge.sourceId);
      adatInvolvedInTree.add(edge.targetId);
      if (!adatParentToChildren.has(edge.targetId)) {
        adatParentToChildren.set(edge.targetId, []);
      }
      adatParentToChildren.get(edge.targetId).push({ childId: edge.sourceId, linkType: edge.linkType });
      adatChildToParent.set(edge.sourceId, edge.targetId);
    });

    const adatRootParents = Array.from(adatParentToChildren.keys()).filter(pid => !adatChildToParent.has(pid));

    adatRootParents.forEach(rootId => {
      const rootNode = this.model.nodes.get(rootId);
      const rootName = this.formatName(rootNode?.name || 'ADAT');

      // Collect all descendants and all link types in this tree
      const treeNodeIds = [rootId];
      const treeLinkTypesInTree = new Set();
      const queue = [rootId];

      while (queue.length > 0) {
        const curr = queue.shift();
        const children = adatParentToChildren.get(curr) || [];
        children.forEach(c => {
          treeNodeIds.push(c.childId);
          treeLinkTypesInTree.add(getLinkTypeName(c.linkType));
          queue.push(c.childId);
        });
      }

      if (treeLinkTypesInTree.size > 1) {
        // Mixed link types
        lines.push(`adat,${rootName},complex1,mixed`);
      } else {
        // Single link type in tree
        const linkType = treeLinkTypesInTree.values().next().value || 'specialization';
        
        if (linkType === 'complex' || linkType === 'derived') {
          // Check if every ADAT in tree is linked to exact same set of PANs
          const rootPanSet = getLinkedPanNames(rootId);
          const rootSig = Array.from(rootPanSet).sort().join(';');
          let exactSame = true;

          for (let i = 1; i < treeNodeIds.length; i++) {
            const childPanSet = getLinkedPanNames(treeNodeIds[i]);
            const childSig = Array.from(childPanSet).sort().join(';');
            if (childSig !== rootSig) {
              exactSame = false;
              break;
            }
          }

          const suffix = exactSame ? '1' : '2';
          const linkCode = `${linkType}${suffix}`;
          lines.push(`adat,${rootName},${linkCode},notmixed`);
        } else if (linkType === 'container') {
          lines.push(`adat,${rootName},containment,notmixed`);
        } else {
          lines.push(`adat,${rootName},${linkType},notmixed`);
        }
      }
    });

    // Atomic ADATs
    adatNodes.forEach(node => {
      if (!adatInvolvedInTree.has(node.id)) {
        lines.push(`adat,${this.formatName(node.name || 'ADAT')},atomic,notmixed`);
      }
    });

    return lines.join('\n');
  }

  /**
   * Packages all schema components into a dedicated schema folder
   * and sends to backend /api/save to write physical folders and files
   */
  async saveExportPackage(schemaName = 'My_ADAPT_Schema', format = 'png', scale = 2, bg = '#ffffff') {
    let imageData = '';
    if (format === 'svg') {
      imageData = this.generateSVGString(bg);
    } else {
      const res = await this.exportToRaster(format, scale, bg);
      imageData = res.dataUrl;
    }

    const panFiles = this.generatePANFiles();
    const adatFiles = this.generateADATFiles();
    const isabContent = this.generateISABFile();
    const adatAdatMultilevelContent = this.generateAdatAdatMultilevelFile();
    const panPanMultilevelContent = this.generatePanPanMultilevelFile();
    const inputContent = this.generateInputFile();
    const schemaData = this.model.toJSON();

    const payload = {
      schemaName,
      imageFormat: format,
      imageData,
      panFiles,
      adatFiles,
      isabContent,
      adatAdatMultilevelContent,
      panPanMultilevelContent,
      inputContent,
      schemaData
    };

    // Save to localStorage for instant browser retrieval
    try {
      localStorage.setItem(`adapt_schema_${schemaName}`, JSON.stringify(schemaData));
      localStorage.setItem('adapt_last_schema', schemaName);
    } catch (e) {}

    // Post to local server endpoint
    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resData = await response.json();
      return { success: true, schemaName: resData.schemaName || schemaName, savedFiles: resData.savedFiles || [], payload };
    } catch (err) {
      console.warn('Backend /api/save not reachable, fallback to client downloads:', err);
      return { success: false, schemaName, fallback: true, payload };
    }
  }

  downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadDataUrl(dataUrl, fileName) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
