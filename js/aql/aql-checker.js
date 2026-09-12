/**
 * aql-checker.js
 * Semantic Checker for AQL queries against an ADAPT SchemaModel.
 * Enforces formal validity conditions:
 *   - ADAT Reference Chains (A1.A2...An.a)
 *   - PAN Reference Chains (A.P1.P2...Pn.p)
 *   - Aggregations: Additivity=TRUE for SUM(), PANs must analyse ADAT
 *   - GROUP BY Constraint: Non-aggregate projections must be in GROUP BY
 *   - Clause validation: SELECT, FROM, WHERE, GROUP BY, HAVING
 *   - ISAB Restrictions: Leaf ADATs in derived tree cannot link to any PAN via ISAB
 */

import { LINK_TYPES, NODE_TYPES, BOOLEAN_OPTIONS } from '../schema-model.js';

export class AQLChecker {
  constructor(model) {
    this.model = model;
    this.buildSchemaIndices();
  }

  normalize(str) {
    if (!str) return '';
    return str.trim().toLowerCase().replace(/[\s\-]+/g, '_');
  }

  buildSchemaIndices() {
    this.adatsByName = new Map();
    this.pansByName = new Map();
    this.adatsById = new Map();
    this.pansById = new Map();

    // Index Nodes
    this.model.nodes.forEach(node => {
      const normName = this.normalize(node.name);
      if (node.type === NODE_TYPES.ADAT) {
        this.adatsByName.set(normName, node);
        this.adatsById.set(node.id, node);
      } else if (node.type === NODE_TYPES.PAN) {
        this.pansByName.set(normName, node);
        this.pansById.set(node.id, node);
      }
    });

    // Index Trees and Edges
    this.isabEdges = []; // ADAT <-> PAN (linkType === SOLID)
    this.specializationEdges = [];
    this.derivedEdges = [];
    this.containerEdges = [];
    this.complexEdges = [];

    // Adat-to-PAN direct ISAB map
    this.adatToPans = new Map(); // adatId -> Set(panId)
    this.panToAdats = new Map(); // panId -> Set(adatId)
    this.isabEdgeMap = new Map(); // `${adatId}_${panId}` -> edge

    // Hierarchy parent-child maps: parentId -> [{ childId, edge }]
    this.adatTreeChildren = new Map();
    this.adatTreeParents = new Map(); // childId -> { parentId, edge }
    this.panTreeChildren = new Map();
    this.panTreeParents = new Map();

    this.model.edges.forEach(edge => {
      if (edge.linkType === LINK_TYPES.SOLID) {
        // ISAB link
        this.isabEdges.push(edge);
        const source = this.model.nodes.get(edge.sourceId);
        const target = this.model.nodes.get(edge.targetId);

        let adatNode = null;
        let panNode = null;
        if (source?.type === NODE_TYPES.ADAT && target?.type === NODE_TYPES.PAN) {
          adatNode = source;
          panNode = target;
        } else if (source?.type === NODE_TYPES.PAN && target?.type === NODE_TYPES.ADAT) {
          adatNode = target;
          panNode = source;
        }

        if (adatNode && panNode) {
          if (!this.adatToPans.has(adatNode.id)) this.adatToPans.set(adatNode.id, new Set());
          this.adatToPans.get(adatNode.id).add(panNode.id);

          if (!this.panToAdats.has(panNode.id)) this.panToAdats.set(panNode.id, new Set());
          this.panToAdats.get(panNode.id).add(adatNode.id);

          this.isabEdgeMap.set(`${adatNode.id}_${panNode.id}`, edge);
        }
      } else {
        // Hierarchy Edge (source is child, target is parent in ADAPT model conventions)
        const parentId = edge.targetId;
        const childId = edge.sourceId;

        const parentNode = this.model.nodes.get(parentId);
        const childNode = this.model.nodes.get(childId);

        if (parentNode?.type === NODE_TYPES.ADAT && childNode?.type === NODE_TYPES.ADAT) {
          if (!this.adatTreeChildren.has(parentId)) this.adatTreeChildren.set(parentId, []);
          this.adatTreeChildren.get(parentId).push({ childId, edge });
          this.adatTreeParents.set(childId, { parentId, edge });
        } else if (parentNode?.type === NODE_TYPES.PAN && childNode?.type === NODE_TYPES.PAN) {
          if (!this.panTreeChildren.has(parentId)) this.panTreeChildren.set(parentId, []);
          this.panTreeChildren.get(parentId).push({ childId, edge });
          this.panTreeParents.set(childId, { parentId, edge });
        }
      }
    });
  }

  // --- Classification Helpers ---

  getAdatClassification(adatNode) {
    if (!adatNode) return 'Unknown';
    const hasParent = this.adatTreeParents.has(adatNode.id);
    const hasChildren = (this.adatTreeChildren.get(adatNode.id) || []).length > 0;

    if (!hasParent && !hasChildren) return 'Atomic';

    const sampleEdge = hasParent 
      ? this.adatTreeParents.get(adatNode.id).edge 
      : this.adatTreeChildren.get(adatNode.id)[0].edge;

    switch (sampleEdge.linkType) {
      case LINK_TYPES.UML_INHERITANCE: return 'Specialised';
      case LINK_TYPES.DISJOINT_D: return 'Derived';
      case LINK_TYPES.COMPLETE_C: return 'Container';
      case LINK_TYPES.AGGREGATION_DIAMOND: return 'Complex';
      default: return 'Atomic';
    }
  }

  getPanClassification(panNode) {
    if (!panNode) return 'Unknown';
    const hasParent = this.panTreeParents.has(panNode.id);
    const hasChildren = (this.panTreeChildren.get(panNode.id) || []).length > 0;

    if (!hasParent && !hasChildren) return 'Atomic';

    const sampleEdge = hasParent 
      ? this.panTreeParents.get(panNode.id).edge 
      : this.panTreeChildren.get(panNode.id)[0].edge;

    switch (sampleEdge.linkType) {
      case LINK_TYPES.UML_INHERITANCE: return 'Specialised';
      case LINK_TYPES.COMPLETE_C: return 'Container';
      case LINK_TYPES.AGGREGATION_DIAMOND: return 'Complex';
      default: return 'Atomic';
    }
  }

  getPanEffectiveAttributes(panNode) {
    if (!panNode) return [];
    const attrs = [...(panNode.attributes || [])];
    const visited = new Set([panNode.id]);

    let currentId = panNode.id;
    while (this.panTreeParents.has(currentId)) {
      const parentInfo = this.panTreeParents.get(currentId);
      // ONLY inherit in case of Specialization (UML_INHERITANCE)
      if (parentInfo.edge.linkType === LINK_TYPES.UML_INHERITANCE) {
        const parentNode = this.model.nodes.get(parentInfo.parentId);
        if (parentNode && !visited.has(parentNode.id)) {
          visited.add(parentNode.id);
          if (parentNode.attributes) {
            attrs.push(...parentNode.attributes);
          }
          currentId = parentNode.id;
        } else {
          break;
        }
      } else {
        // Do not inherit for other types of PAN trees
        break;
      }
    }

    return attrs;
  }

  isAdatLeafInSpecialization(adatNode) {
    // Leaf has no children specializing it
    const children = this.adatTreeChildren.get(adatNode.id) || [];
    const specChildren = children.filter(c => c.edge.linkType === LINK_TYPES.UML_INHERITANCE);
    return specChildren.length === 0;
  }

  isAdatLeafInDerived(adatNode) {
    // Has parent in derived tree and no children deriving from it
    const hasDerivedParent = this.adatTreeParents.has(adatNode.id) && 
      this.adatTreeParents.get(adatNode.id).edge.linkType === LINK_TYPES.DISJOINT_D;
    
    const children = this.adatTreeChildren.get(adatNode.id) || [];
    const derivedChildren = children.filter(c => c.edge.linkType === LINK_TYPES.DISJOINT_D);

    return hasDerivedParent && derivedChildren.length === 0;
  }

  isBranchInTree(nodesList, expectedLinkType) {
    // nodesList: [N1, N2, ..., Nn]
    for (let i = 0; i < nodesList.length - 1; i++) {
      const parent = nodesList[i];
      const child = nodesList[i + 1];
      const children = (parent.type === NODE_TYPES.ADAT ? this.adatTreeChildren.get(parent.id) : this.panTreeChildren.get(parent.id)) || [];
      const match = children.find(c => c.childId === child.id && c.edge.linkType === expectedLinkType);
      if (!match) return false;
    }
    return true;
  }

  getContainerContentPairEdge(parentPan, childPan) {
    const children = this.panTreeChildren.get(parentPan.id) || [];
    const match = children.find(c => c.childId === childPan.id && c.edge.linkType === LINK_TYPES.COMPLETE_C);
    return match ? match.edge : null;
  }

  getContainerTreeGroup(panNode) {
    if (!panNode) return [];
    const group = [panNode];
    const visited = new Set([panNode.id]);
    const queue = [panNode];

    while (queue.length > 0) {
      const current = queue.shift();

      if (this.panTreeParents.has(current.id)) {
        const parentInfo = this.panTreeParents.get(current.id);
        if (parentInfo.edge.linkType === LINK_TYPES.COMPLETE_C) {
          const parentNode = this.model.nodes.get(parentInfo.parentId);
          if (parentNode && !visited.has(parentNode.id)) {
            visited.add(parentNode.id);
            group.push(parentNode);
            queue.push(parentNode);
          }
        }
      }

      const children = this.panTreeChildren.get(current.id) || [];
      children.forEach(c => {
        if (c.edge.linkType === LINK_TYPES.COMPLETE_C) {
          const childNode = this.model.nodes.get(c.childId);
          if (childNode && !visited.has(childNode.id)) {
            visited.add(childNode.id);
            group.push(childNode);
            queue.push(childNode);
          }
        }
      });
    }

    return group;
  }

  getSpecializationTreeGroup(panNode) {
    if (!panNode) return [];
    const group = [panNode];
    const visited = new Set([panNode.id]);
    const queue = [panNode];

    while (queue.length > 0) {
      const current = queue.shift();
      if (this.panTreeParents.has(current.id)) {
        const parentInfo = this.panTreeParents.get(current.id);
        if (parentInfo.edge.linkType === LINK_TYPES.UML_INHERITANCE) {
          const parentNode = this.model.nodes.get(parentInfo.parentId);
          if (parentNode && !visited.has(parentNode.id)) {
            visited.add(parentNode.id);
            group.push(parentNode);
            queue.push(parentNode);
          }
        }
      }
      const children = this.panTreeChildren.get(current.id) || [];
      children.forEach(c => {
        if (c.edge.linkType === LINK_TYPES.UML_INHERITANCE) {
          const childNode = this.model.nodes.get(c.childId);
          if (childNode && !visited.has(childNode.id)) {
            visited.add(childNode.id);
            group.push(childNode);
            queue.push(childNode);
          }
        }
      });
    }

    return group;
  }

  hasDirectISAB(adatNode, panNode) {
    if (!adatNode || !panNode) return false;
    const pans = this.adatToPans.get(adatNode.id);
    return pans ? pans.has(panNode.id) : false;
  }

  getContainerISABConnection(adatNode, panNode) {
    if (!adatNode || !panNode) return null;

    if (this.hasDirectISAB(adatNode, panNode)) {
      const edge = this.getISABEdge(adatNode, panNode);
      const isabApp = (edge?.applicability || BOOLEAN_OPTIONS.TRUE).toString().trim().toLowerCase();
      return {
        isDirect: true,
        isabPan: panNode,
        isabEdge: edge,
        isApplicable: isabApp === 'true'
      };
    }

    const containerNodes = this.getContainerTreeGroup(panNode);
    if (containerNodes.length <= 1) return null;

    for (const otherPan of containerNodes) {
      if (this.hasDirectISAB(adatNode, otherPan)) {
        const edge = this.getISABEdge(adatNode, otherPan);
        const isabApp = (edge?.applicability || BOOLEAN_OPTIONS.TRUE).toString().trim().toLowerCase();
        
        let allEdgesApplicable = (isabApp === 'true');
        for (const cNode of containerNodes) {
          const children = this.panTreeChildren.get(cNode.id) || [];
          children.forEach(c => {
            if (c.edge.linkType === LINK_TYPES.COMPLETE_C) {
              const appVal = (c.edge.applicability || BOOLEAN_OPTIONS.TRUE).toString().trim().toLowerCase();
              if (appVal !== 'true') {
                allEdgesApplicable = false;
              }
            }
          });
        }

        return {
          isDirect: false,
          isabPan: otherPan,
          isabEdge: edge,
          isApplicable: allEdgesApplicable
        };
      }
    }

    return null;
  }

  hasISAB(adatNode, panNode) {
    if (!adatNode || !panNode) return false;

    if (this.hasDirectISAB(adatNode, panNode)) {
      return true;
    }

    const containerConn = this.getContainerISABConnection(adatNode, panNode);
    if (containerConn && containerConn.isApplicable) {
      return true;
    }

    return false;
  }

  getISABEdge(adatNode, panNode) {
    if (!adatNode || !panNode) return null;
    return this.isabEdgeMap.get(`${adatNode.id}_${panNode.id}`) || null;
  }

  isISABAdditive(adatNode, panNode, attrName = null) {
    const edge = this.getISABEdge(adatNode, panNode);
    if (!edge) return false;
    const addVal = (edge.additivity || BOOLEAN_OPTIONS.TRUE).toString().trim().toLowerCase();
    return addVal === 'true';
  }

  // --- Main Checker Entry Point ---

  checkQuery(ast) {
    const report = {
      isValid: true,
      errors: [],
      warnings: [],
      tableVIIChecks: [],
      tableVIIIChecks: [],
      aggregationChecks: [],
      iterators: new Map(),
      participatingADATs: new Set(),
      participatingPANs: new Set(),
      isView: !!ast.isView,
      viewName: ast.viewName || null,
      summary: ''
    };

    try {
      // 1. Check primary query
      this.checkSingleQuery(ast, report, 'Primary Query');

      // 2. Check chained set operations (UNION, INTERSECT, EXCEPT)
      if (ast.setOperations && ast.setOperations.length > 0) {
        ast.setOperations.forEach((setOp, idx) => {
          this.checkSingleQuery(setOp.query, report, `${setOp.op} Query #${idx + 1}`);

          // Set operation compatibility: both queries must have same projection count
          if (setOp.query.select.length !== ast.select.length) {
            report.errors.push(`In ${setOp.op} operation: Both queries must have the same number of expressions in their SELECT clause (primary query has ${ast.select.length}, ${setOp.op} branch has ${setOp.query.select.length}).`);
          }
        });
      }

      report.isValid = report.errors.length === 0;
      report.summary = report.isValid 
        ? (ast.isView 
            ? `View '${ast.viewName}' verified successfully! Satisfies multidimensional analysis semantics.`
            : (ast.setOperations && ast.setOperations.length > 0
                ? `Compound AQL query with set operations verified successfully! Satisfies multidimensional analysis semantics.`
                : `AQL query verified successfully! Satisfies multidimensional analysis semantics.`))
        : `AQL query contains ${report.errors.length} semantic error(s). Please review checks below.`;

    } catch (err) {
      report.isValid = false;
      report.errors.push(err.message);
      report.summary = `Semantic check halted: ${err.message}`;
    }

    return report;
  }

  checkSingleQuery(queryAst, report, queryLabel = 'Query') {
    // 1. Resolve FROM clause and define iterator variables
    this.resolveFromClause(queryAst.from, report);

    // 2. Check SELECT clause
    this.checkSelectClause(queryAst.select, report);

    // 3. Check WHERE clause (if present)
    if (queryAst.where) {
      this.checkExpression(queryAst.where, 'WHERE', report);
    }

    // 4. Check GROUP BY clause (if present)
    if (queryAst.groupBy && queryAst.groupBy.length > 0) {
      queryAst.groupBy.forEach(item => this.checkExpression(item, 'GROUP BY', report));
      this.checkGroupByCompliance(queryAst, report);
    }

    // 5. Check HAVING clause (if present)
    if (queryAst.having) {
      this.checkExpression(queryAst.having, 'HAVING', report);
    }

    // 6. Check Overall Aggregation rules (PANs participating in aggregation must analyse ADAT)
    this.checkOverallAggregation(report);

    // 7. Check ISAB restriction on Derived ADAT leaves
    this.checkDerivedLeafISABRestrictions(report);

    // 8. Check ISAB restriction on Specialization ADAT non-leaves
    this.checkSpecializationNonLeafISABRestrictions(report);

    // 9. Check ADAT parent hierarchy consistency
    this.checkAdatParentHierarchyConsistency(report);
  }

  // --- GROUP BY Projection Compliance Check (Requirement 1a) ---

  checkGroupByCompliance(ast, report) {
    if (!ast.groupBy || ast.groupBy.length === 0) return;

    // Collect all expressions in GROUP BY in canonical normalized forms
    const groupByTokens = new Set();

    const addTokensForExpr = (expr) => {
      if (!expr) return;
      if (expr.type === 'CHAIN') {
        const raw = expr.parts.map(p => this.normalize(p)).join('.');
        groupByTokens.add(raw);
        // Also add the last part (attribute)
        groupByTokens.add(this.normalize(expr.parts[expr.parts.length - 1]));
      } else if (expr.left && expr.right) {
        addTokensForExpr(expr.left);
        addTokensForExpr(expr.right);
      }
    };

    ast.groupBy.forEach(gExpr => addTokensForExpr(gExpr));

    // Verify each SELECT projection
    ast.select.forEach(item => {
      if (item.type === 'AGGREGATE') {
        // Aggregate functions (SUM, AVG, COUNT, etc.) are always valid with GROUP BY
        return;
      }

      if (item.type === 'PROJECTION') {
        const expr = item.expression;
        let isCovered = false;

        if (expr.type === 'CHAIN') {
          const rawChain = expr.parts.map(p => this.normalize(p)).join('.');
          const attr = this.normalize(expr.parts[expr.parts.length - 1]);
          if (groupByTokens.has(rawChain) || groupByTokens.has(attr)) {
            isCovered = true;
          }
        }

        if (!isCovered) {
          report.errors.push(`Attribute '${item.raw}' in SELECT clause must appear in the GROUP BY clause or be used in an aggregate function.`);
        }
      }
    });
  }

  // --- Derived ADAT Leaf ISAB Restriction Check (Requirement 9a) ---

  checkDerivedLeafISABRestrictions(report) {
    report.participatingADATs.forEach(adat => {
      if (this.isAdatLeafInDerived(adat)) {
        // Check if this leaf ADAT has an ISAB connection to any PAN
        const connectedPans = this.adatToPans.get(adat.id);
        if (connectedPans && connectedPans.size > 0) {
          report.errors.push(`In a derived ADAT tree, leaf ADAT '${adat.name}' cannot be linked to any PAN using ISAB.`);
        }
      }
    });
  }

  // --- Specialization ADAT Non-Leaf ISAB Restriction Check ---

  checkSpecializationNonLeafISABRestrictions(report) {
    report.participatingADATs.forEach(adat => {
      const children = this.adatTreeChildren.get(adat.id) || [];
      const isSpecParent = children.some(c => c.edge.linkType === LINK_TYPES.UML_INHERITANCE);
      if (isSpecParent) {
        const connectedPans = this.adatToPans.get(adat.id);
        if (connectedPans && connectedPans.size > 0) {
          report.errors.push(`In a specialization ADAT tree, only the leaf level ADATs can be linked via ISAB to a PAN. Non-leaf ADAT '${adat.name}' cannot have an ISAB relationship.`);
        }
      }
    });
  }

  // --- ADAT Parent Hierarchy Consistency Check ---

  checkAdatParentHierarchyConsistency(report) {
    this.adatTreeChildren.forEach((children, parentId) => {
      if (children.length > 1) {
        const firstType = children[0].edge.linkType;
        const hasMixed = children.some(c => c.edge.linkType !== firstType);
        if (hasMixed) {
          const parentNode = this.model.nodes.get(parentId);
          const parentName = parentNode ? parentNode.name : parentId;
          report.errors.push(`In an ADAT tree, parent node '${parentName}' cannot have mixed hierarchy types. Once a link type is selected, the only other relationship the parent can participate in is ISAB.`);
        }
      }
    });
  }

  // --- FROM Clause Iterator Resolution ---

  resolveFromClause(fromItems, report) {
    if (!fromItems || fromItems.length === 0) {
      throw new Error("Query must have at least one iterator in the 'FROM' clause.");
    }

    fromItems.forEach(item => {
      const parts = item.chain.parts;
      const firstNorm = this.normalize(parts[0]);
      const rawAlias = item.alias ? item.alias : parts[parts.length - 1];
      const normAlias = this.normalize(rawAlias);

      // Check if parts[0] is an ADAT or previously bound iterator
      let rootAdat = this.adatsByName.get(firstNorm);

      if (rootAdat && parts.length === 1) {
        // e.g. "FROM Sales S" or "FROM Sales"
        report.iterators.set(normAlias, {
          kind: 'ADAT',
          node: rootAdat,
          chain: [rootAdat],
          alias: rawAlias
        });
        report.participatingADATs.add(rootAdat);
        return;
      }

      // Check if parts[0] is an iterator defined earlier, e.g. "S.Product P" or "P.Category C"
      const parentIter = report.iterators.get(firstNorm);
      if (parentIter) {
        const remaining = parts.slice(1);
        if (parentIter.kind === 'ADAT') {
          // Could be S.Product (PAN) or S.ChildADAT (ADAT)
          const nextNorm = this.normalize(remaining[0]);
          const panNode = this.pansByName.get(nextNorm);
          const childAdat = this.adatsByName.get(nextNorm);

          if (panNode) {
            // S.Product P (PAN Chain)
            const panChain = this.resolvePanPath(parentIter.node, remaining, report);
            if (!this.hasISAB(parentIter.node, panChain[0])) {
              report.errors.push(`In FROM clause: ADAT '${parentIter.node.name}' does not have an ISAB relationship with PAN '${panChain[0].name}'.`);
            }
            report.iterators.set(normAlias, {
              kind: 'PAN',
              adatNode: parentIter.node,
              panNode: panChain[panChain.length - 1],
              chain: panChain,
              alias: rawAlias
            });
            report.participatingPANs.add(panChain[panChain.length - 1]);
            return;
          } else if (childAdat) {
            // S.ChildADAT (ADAT Chain)
            const adatChain = [parentIter.node, childAdat];
            report.iterators.set(normAlias, {
              kind: 'ADAT',
              node: childAdat,
              chain: adatChain,
              alias: rawAlias
            });
            report.participatingADATs.add(childAdat);
            return;
          } else {
            report.errors.push(`In FROM clause: '${remaining[0]}' is neither a recognized PAN nor ADAT associated with '${parts[0]}'.`);
            return;
          }
        } else if (parentIter.kind === 'PAN') {
          const nextNorm = this.normalize(remaining[0]);
          const panNode = this.pansByName.get(nextNorm);
          if (panNode) {
            const panChain = [...parentIter.chain, panNode];
            report.iterators.set(normAlias, {
              kind: 'PAN',
              adatNode: parentIter.adatNode,
              panNode: panNode,
              chain: panChain,
              alias: rawAlias
            });
            report.participatingPANs.add(panNode);
            return;
          } else {
            report.errors.push(`In FROM clause: '${remaining[0]}' is not a recognized PAN associated with '${parts[0]}'.`);
            return;
          }
        }
      }

      // Direct ADAT.PAN syntax without iterator alias, e.g. "Sales.Product P"
      if (rootAdat && parts.length > 1) {
        const panChain = this.resolvePanPath(rootAdat, parts.slice(1), report);
        if (!this.hasISAB(rootAdat, panChain[0])) {
          report.errors.push(`In FROM clause: ADAT '${rootAdat.name}' does not have an ISAB relationship with PAN '${panChain[0].name}'.`);
        }
        report.iterators.set(normAlias, {
          kind: 'PAN',
          adatNode: rootAdat,
          panNode: panChain[panChain.length - 1],
          chain: panChain,
          alias: rawAlias
        });
        report.participatingADATs.add(rootAdat);
        report.participatingPANs.add(panChain[panChain.length - 1]);
        return;
      }

      // Standalone PAN iterator: e.g. "FROM Customer C" or "FROM SALE S, Customer C" (NOT PERMITTED)
      const panDirect = this.pansByName.get(firstNorm);
      if (panDirect) {
        report.errors.push(`In FROM clause: Chaining must always start with an ADAT or ADAT iterator (e.g., 'S.${panDirect.name} ${rawAlias}'). Standalone PAN '${parts[0]}' is not permitted as an iterator in the FROM clause.`);
        return;
      }

      report.errors.push(`In FROM clause: Unrecognized entity '${item.chain.raw}'. Please verify schema node names.`);
    });
  }

  resolvePanPath(rootAdat, panNames, report) {
    const chain = [];
    panNames.forEach(pn => {
      const pNode = this.pansByName.get(this.normalize(pn));
      if (!pNode) {
        throw new Error(`Unrecognized PAN '${pn}' in chain.`);
      }
      chain.push(pNode);
    });
    return chain;
  }

  // --- SELECT Clause Checking ---

  checkSelectClause(selectItems, report) {
    if (!selectItems || selectItems.length === 0) {
      report.errors.push("SELECT clause must specify at least one projection.");
      return;
    }

    selectItems.forEach(item => {
      if (item.type === 'AGGREGATE') {
        this.checkAggregateExpression(item, report);
      } else {
        this.checkExpression(item.expression, 'SELECT', report);
      }
    });
  }

  // --- General Expression / Chain Checking ---

  checkExpression(expr, clauseName, report) {
    if (!expr) return;

    if (expr.type === 'CHAIN') {
      this.checkPathChain(expr, clauseName, report);
    } else if (expr.type === 'AGGREGATE') {
      this.checkAggregateExpression(expr, report);
    } else if (expr.type === 'COMPARISON' || expr.type === 'BINARY_OP' || expr.type === 'BINARY_MATH') {
      this.checkExpression(expr.left, clauseName, report);
      this.checkExpression(expr.right, clauseName, report);
    } else if (expr.type === 'IS_NULL') {
      this.checkExpression(expr.expr, clauseName, report);
    }
  }

  // --- Path Chain Verification ---

  checkPathChain(chain, clauseName, report) {
    const parts = chain.parts;
    const rawChain = chain.raw;
    const firstNorm = this.normalize(parts[0]);

    // Case 1: First part is a defined iterator
    const iter = report.iterators.get(firstNorm);
    if (iter) {
      if (iter.kind === 'ADAT') {
        const remaining = parts.slice(1);
        if (remaining.length === 1) {
          const attrName = remaining[0];
          this.verifyAdatChain(iter.node, [], attrName, rawChain, clauseName, report);
        } else if (remaining.length > 1) {
          const secondNorm = this.normalize(remaining[0]);
          let possiblePan = this.pansByName.get(secondNorm);
          let possibleChildAdat = this.adatsByName.get(secondNorm);

          // Support Iterator Navigation: e.g. S.C.name where C is iterator for Customer
          const secondIter = report.iterators.get(secondNorm);
          if (secondIter) {
            if (secondIter.kind === 'PAN' || secondIter.kind === 'PAN_STANDALONE') {
              possiblePan = secondIter.panNode;
            } else if (secondIter.kind === 'ADAT') {
              possibleChildAdat = secondIter.node;
            }
          }

          if (possiblePan) {
            const restOfChain = remaining.slice(1, remaining.length - 1);
            const panChainParts = (secondIter && secondIter.kind === 'PAN' && secondIter.chain)
              ? [...secondIter.chain.map(p => p.name), ...restOfChain]
              : [possiblePan.name, ...restOfChain];
            const panAttr = remaining[remaining.length - 1];
            this.verifyPanChain(iter.node, panChainParts, panAttr, rawChain, clauseName, report);
          } else if (possibleChildAdat) {
            const restOfChain = remaining.slice(1, remaining.length - 1);
            const adatChainParts = [possibleChildAdat.name, ...restOfChain];
            const adatAttr = remaining[remaining.length - 1];
            this.verifyAdatChain(iter.node, adatChainParts, adatAttr, rawChain, clauseName, report);
          } else {
            report.errors.push(`In ${clauseName}: '${remaining[0]}' in '${rawChain}' is neither a valid attribute, PAN, nor ADAT.`);
          }
        }
        return;
      } else if (iter.kind === 'PAN' || iter.kind === 'PAN_STANDALONE') {
        // Direct chaining on PAN without ADAT prefix is not permitted in AQL
        report.errors.push(`In ${clauseName}: Chaining must always start with an ADAT or ADAT iterator (e.g., 'S.${rawChain}'). Direct PAN reference '${rawChain}' is not permitted in AQL.`);
        return;
      }
    }

    // Case 2: Direct Schema Name
    const directAdat = this.adatsByName.get(firstNorm);
    if (directAdat) {
      report.participatingADATs.add(directAdat);
      const remaining = parts.slice(1);
      if (remaining.length === 1) {
        this.verifyAdatChain(directAdat, [], remaining[0], rawChain, clauseName, report);
      } else if (remaining.length > 1) {
        const secondNorm = this.normalize(remaining[0]);
        let possiblePan = this.pansByName.get(secondNorm);
        let possibleChildAdat = this.adatsByName.get(secondNorm);

        // Also check if second part is an iterator
        const secondIter = report.iterators.get(secondNorm);
        if (secondIter) {
          if (secondIter.kind === 'PAN' || secondIter.kind === 'PAN_STANDALONE') {
            possiblePan = secondIter.panNode;
          } else if (secondIter.kind === 'ADAT') {
            possibleChildAdat = secondIter.node;
          }
        }

        if (possiblePan) {
          const restOfChain = remaining.slice(1, remaining.length - 1);
          const panChainParts = [possiblePan.name, ...restOfChain];
          const panAttr = remaining[remaining.length - 1];
          this.verifyPanChain(directAdat, panChainParts, panAttr, rawChain, clauseName, report);
        } else if (possibleChildAdat) {
          const restOfChain = remaining.slice(1, remaining.length - 1);
          const adatChainParts = [possibleChildAdat.name, ...restOfChain];
          const adatAttr = remaining[remaining.length - 1];
          this.verifyAdatChain(directAdat, adatChainParts, adatAttr, rawChain, clauseName, report);
        } else {
          report.errors.push(`In ${clauseName}: '${remaining[0]}' in '${rawChain}' is neither a valid attribute, PAN, nor ADAT.`);
        }
      }
      return;
    }

    // Case 3: Direct PAN reference without ADAT, e.g. Customer.name
    const directPan = this.pansByName.get(firstNorm);
    if (directPan) {
      report.errors.push(`In ${clauseName}: Chaining must always start with an ADAT or ADAT iterator (e.g., 'S.${rawChain}'). Direct PAN reference '${rawChain}' is not permitted in AQL.`);
      return;
    }

    report.errors.push(`In ${clauseName}: Unrecognized identifier chain '${rawChain}'. Check table and attribute names.`);
  }

  // =========================================================================
  // ADAT Chain Verification (A1.A2...An.a)
  // =========================================================================

  verifyAdatChain(rootAdat, intermediateNames, attrName, rawChain, clauseName, report) {
    const chainNodes = [rootAdat];
    for (const name of intermediateNames) {
      const node = this.adatsByName.get(this.normalize(name));
      if (!node) {
        report.errors.push(`Check Failed for '${rawChain}': ADAT '${name}' does not exist in schema.`);
        return;
      }
      chainNodes.push(node);
    }

    const n = chainNodes.length;
    const targetAdat = chainNodes[chainNodes.length - 1];
    const a1 = chainNodes[0];
    const a1Type = this.getAdatClassification(a1);

    const checkRecord = {
      chain: rawChain,
      clause: clauseName,
      chainLength: n,
      adatType: a1Type,
      passed: true,
      conditions: [],
      semantics: ''
    };

    const normAttr = this.normalize(attrName);
    const hasAttr = (targetAdat.attributes || []).some(a => this.normalize(a.name) === normAttr);

    if (n === 1) {
      if (a1Type === 'Atomic') {
        if (!hasAttr) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${attrName}' is not an attribute of atomic ADAT '${a1.name}'.`);
          report.errors.push(`Error: '${attrName}' is not an attribute of atomic ADAT '${a1.name}'.`);
        } else {
          checkRecord.conditions.push(`PASSED: '${attrName}' is an attribute of '${a1.name}'.`);
          checkRecord.semantics = "The ADAT is analysable.";
        }
      } else if (a1Type === 'Specialised') {
        const isLeaf = this.isAdatLeafInSpecialization(a1);
        if (!isLeaf) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${a1.name}' is not a leaf of the specialization hierarchy.`);
          report.errors.push(`Error: '${a1.name}' is a non-leaf ADAT in a specialization hierarchy. Only leaves are analysable.`);
        } else if (!hasAttr) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${attrName}' is not an attribute of leaf specialized ADAT '${a1.name}'.`);
          report.errors.push(`Error: Attribute '${attrName}' not found in leaf specialized ADAT '${a1.name}'.`);
        } else {
          checkRecord.conditions.push(`PASSED: '${a1.name}' is a leaf of the specialization hierarchy and has attribute '${attrName}'.`);
          checkRecord.semantics = "Only leaves are analysable.";
        }
      } else if (a1Type === 'Derived') {
        const hasDerivedParent = this.adatTreeParents.has(a1.id) && 
          this.adatTreeParents.get(a1.id).edge.linkType === LINK_TYPES.DISJOINT_D;
        if (hasDerivedParent || !hasAttr) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: ${attrName} of Base ADAT cannot be accessed independently`);
          report.errors.push(`FAILED: ${attrName} of Base ADAT cannot be accessed independently`);
        } else {
          checkRecord.conditions.push(`PASSED: '${attrName}' is an attribute of '${a1.name}'.`);
          checkRecord.semantics = "The ADAT is analysable.";
        }
      } else {
        if (!hasAttr) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${attrName}' is not an attribute of '${a1.name}'.`);
          report.errors.push(`Error: Attribute '${attrName}' not found in ADAT '${a1.name}'.`);
        } else {
          checkRecord.conditions.push(`PASSED: '${attrName}' is an attribute of '${a1.name}'.`);
          checkRecord.semantics = `ADAT ${a1Type} reference valid.`;
        }
      }
    } else {
      if (a1Type === 'Derived') {
        const isBranch = this.isBranchInTree(chainNodes, LINK_TYPES.DISJOINT_D);
        if (!isBranch) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${chainNodes.map(n => n.name).join('.')}' is not a valid branch in the Derived hierarchy.`);
          report.errors.push(`Error: '${rawChain}' is not a valid branch in the Derived hierarchy.`);
        } else {
          checkRecord.conditions.push(`PASSED: Branch in Derived hierarchy verified.`);
        }

        if (!hasAttr) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${attrName}' is not an attribute of '${targetAdat.name}'.`);
          report.errors.push(`Error: Attribute '${attrName}' not found in base ADAT '${targetAdat.name}'.`);
        } else {
          checkRecord.conditions.push(`PASSED: '${attrName}' is an attribute of '${targetAdat.name}'.`);
        }

        checkRecord.semantics = "Attributes of base ADATS can be retrieved through the derived ADAT.";
      } else if (a1Type === 'Complex') {
        const isBranch = this.isBranchInTree(chainNodes, LINK_TYPES.AGGREGATION_DIAMOND);
        if (!isBranch) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${chainNodes.map(n => n.name).join('.')}' is not a valid branch in the Complex hierarchy.`);
          report.errors.push(`Error: '${rawChain}' is not a valid branch in the Complex hierarchy.`);
        } else {
          checkRecord.conditions.push(`PASSED: Branch in Complex hierarchy verified.`);
        }

        if (!hasAttr) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${attrName}' is not an attribute of '${targetAdat.name}'.`);
          report.errors.push(`Error: Attribute '${attrName}' not found in component ADAT '${targetAdat.name}'.`);
        } else {
          checkRecord.conditions.push(`PASSED: '${attrName}' is an attribute of '${targetAdat.name}'.`);
        }

        checkRecord.semantics = "Any attribute in the hierarchy can be analysed.";
      } else if (a1Type === 'Container') {
        const isBranch = this.isBranchInTree(chainNodes, LINK_TYPES.COMPLETE_C);
        if (!isBranch) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: Container-content relationship not found between pairs in '${chainNodes.map(n => n.name).join('.')}'.`);
          report.errors.push(`Error: Container-content relationship missing in chain '${rawChain}'.`);
        } else {
          checkRecord.conditions.push(`PASSED: Container-content relationships verified.`);
        }

        if (!hasAttr) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${attrName}' is not an attribute of content ADAT '${targetAdat.name}'.`);
          report.errors.push(`Error: Attribute '${attrName}' not found in content ADAT '${targetAdat.name}'.`);
        } else {
          checkRecord.conditions.push(`PASSED: '${attrName}' is an attribute of content ADAT '${targetAdat.name}'.`);
        }

        checkRecord.semantics = "Attributes of content ADAT can be retrieved.";
      } else {
        if (!hasAttr) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: Attribute '${attrName}' not found on '${targetAdat.name}'.`);
          report.errors.push(`Error: Attribute '${attrName}' not found on '${targetAdat.name}'.`);
        } else {
          checkRecord.conditions.push(`PASSED: Attribute '${attrName}' found on '${targetAdat.name}'.`);
          checkRecord.semantics = "Hierarchy reference valid.";
        }
      }
    }

    report.tableVIIChecks.push(checkRecord);
  }

  // =========================================================================
  // PAN Chain Verification (A.P1.P2...Pn.p)
  // =========================================================================

  verifyPanChain(adatNode, panNames, attrName, rawChain, clauseName, report) {
    if (!panNames || panNames.length === 0) {
      report.errors.push(`Check Failed for '${rawChain}': Missing PAN name.`);
      return;
    }

    const panNodes = [];
    for (const name of panNames) {
      const node = this.pansByName.get(this.normalize(name));
      if (!node) {
        report.errors.push(`Check Failed for '${rawChain}': PAN '${name}' does not exist in schema.`);
        return;
      }
      panNodes.push(node);
    }

    const n = panNodes.length;
    const p1 = panNodes[0];
    const pn = panNodes[panNodes.length - 1];
    const p1Type = this.getPanClassification(p1);

    report.participatingADATs.add(adatNode);
    report.participatingPANs.add(pn);

    const checkRecord = {
      chain: rawChain,
      clause: clauseName,
      chainLength: n,
      panType: p1Type,
      passed: true,
      conditions: [],
      semantics: ''
    };

    // 1. Common condition: A ISAB P1 (or A ISAB Container PAN tree with Applicability=TRUE)
    const containerConn = this.getContainerISABConnection(adatNode, p1);
    const hasIsab = this.hasISAB(adatNode, p1);
    if (!hasIsab) {
      checkRecord.passed = false;
      if (containerConn && !containerConn.isApplicable) {
        checkRecord.conditions.push(`FAILED: Applicability is FALSE for Container PAN tree connection with ADAT '${adatNode.name}'.`);
        report.errors.push(`Error: Applicability is FALSE between Container PAN tree ('${p1.name}') and ADAT '${adatNode.name}'. Analysis semantics not preserved.`);
      } else {
        checkRecord.conditions.push(`FAILED: '${adatNode.name}' ISAB '${p1.name}' relationship does not exist.`);
        report.errors.push(`Error: ADAT '${adatNode.name}' does not have an ISAB relationship with PAN '${p1.name}'.`);
      }
    } else {
      if (containerConn && !containerConn.isDirect) {
        checkRecord.conditions.push(`PASSED: '${adatNode.name}' is connected to Container PAN tree via '${containerConn.isabPan.name}' with Applicability=TRUE.`);
      } else {
        checkRecord.conditions.push(`PASSED: '${adatNode.name}' ISAB '${p1.name}' verified.`);
      }
    }

    // 2. Check p is attribute of Pn (including inherited attributes in Specialization trees)
    const normAttr = this.normalize(attrName);
    const effectiveAttrs = this.getPanEffectiveAttributes(pn);
    const hasAttr = effectiveAttrs.some(a => this.normalize(a.name) === normAttr);
    if (!hasAttr) {
      checkRecord.passed = false;
      checkRecord.conditions.push(`FAILED: '${attrName}' is not an attribute of PAN '${pn.name}'.`);
      report.errors.push(`Error: Attribute '${attrName}' not found in PAN '${pn.name}'.`);
    } else {
      const isInherited = !(pn.attributes || []).some(a => this.normalize(a.name) === normAttr);
      if (isInherited) {
        checkRecord.conditions.push(`PASSED: '${attrName}' is an inherited attribute of specialized PAN '${pn.name}'.`);
      } else {
        checkRecord.conditions.push(`PASSED: '${attrName}' is an attribute of PAN '${pn.name}'.`);
      }
    }

    if (n === 1) {
      if (checkRecord.passed) {
        if (containerConn && !containerConn.isDirect) {
          checkRecord.semantics = `${adatNode.name} can be analysed by the entire container PAN tree because Applicability=TRUE.`;
        } else {
          checkRecord.semantics = `${adatNode.name} is indeed analysable by ${p1.name}.`;
        }
      }
    } else {
      if (p1Type === 'Complex') {
        const isBranch = this.isBranchInTree(panNodes, LINK_TYPES.AGGREGATION_DIAMOND);
        if (!isBranch) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${panNodes.map(p => p.name).join('.')}' is not a valid branch in the Complex PAN hierarchy.`);
          report.errors.push(`Error: '${rawChain}' is not a valid branch in the Complex PAN hierarchy.`);
        } else {
          checkRecord.conditions.push(`PASSED: Branch in Complex PAN hierarchy verified.`);
          checkRecord.semantics = `${adatNode.name} can be analysed by the root and any component of the complex hierarchy.`;
        }
      } else if (p1Type === 'Specialised') {
        const isBranch = this.isBranchInTree(panNodes, LINK_TYPES.UML_INHERITANCE);
        if (!isBranch) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: '${panNodes.map(p => p.name).join('.')}' is not a valid branch in the Specialization PAN hierarchy.`);
          report.errors.push(`Error: '${rawChain}' is not a valid branch in the Specialization PAN hierarchy.`);
        } else {
          checkRecord.conditions.push(`PASSED: Branch in Specialization PAN hierarchy verified.`);
          checkRecord.semantics = `${adatNode.name} can be analysed by the root and any PAN in the specialisation hierarchy.`;
        }
      } else if (p1Type === 'Container') {
        const isBranch = this.isBranchInTree(panNodes, LINK_TYPES.COMPLETE_C);
        if (!isBranch) {
          checkRecord.passed = false;
          checkRecord.conditions.push(`FAILED: Container-content relationship not found between all pairs in '${panNodes.map(p => p.name).join('.')}'.`);
          report.errors.push(`Error: Missing container-content relationship in chain '${rawChain}'.`);
        } else {
          checkRecord.conditions.push(`PASSED: Container-content relationships verified.`);
        }

        for (let i = 0; i < panNodes.length - 1; i++) {
          const parent = panNodes[i];
          const child = panNodes[i + 1];
          const edge = this.getContainerContentPairEdge(parent, child);
          const appVal = (edge?.applicability || edge?.associativity || BOOLEAN_OPTIONS.TRUE).toString().trim().toLowerCase();
          if (appVal !== 'true') {
            checkRecord.passed = false;
            checkRecord.conditions.push(`FAILED: Applicability is FALSE between container '${parent.name}' and content '${child.name}'.`);
            report.errors.push(`Error: Applicability is FALSE between container '${parent.name}' and content '${child.name}'. Analysis semantics not preserved.`);
          } else {
            checkRecord.conditions.push(`PASSED: Applicability=TRUE between '${parent.name}' and '${child.name}'.`);
          }
        }

        if (checkRecord.passed) {
          checkRecord.semantics = `${adatNode.name} can be analysed by container PAN and content PAN only if Applicability=TRUE.`;
        }
      }
    }

    report.tableVIIIChecks.push(checkRecord);
  }

  // =========================================================================
  // Aggregation Verification: Additivity & Participating PANs
  // =========================================================================

  checkAggregateExpression(aggItem, report) {
    const func = aggItem.func; // SUM, AVG, COUNT, MIN, MAX
    const arg = aggItem.argument;

    if (arg.type === 'STAR') return;

    if (arg.type === 'CHAIN') {
      const parts = arg.parts;
      const firstNorm = this.normalize(parts[0]);

      let targetAdat = null;
      let attrName = parts[parts.length - 1];

      const iter = report.iterators.get(firstNorm);
      if (iter && iter.kind === 'ADAT') {
        targetAdat = iter.node;
      } else {
        targetAdat = this.adatsByName.get(firstNorm);
      }

      if (!targetAdat) {
        targetAdat = Array.from(report.participatingADATs)[0];
      }

      const aggCheck = {
        func,
        raw: aggItem.raw,
        adatName: targetAdat ? targetAdat.name : 'Unknown',
        attribute: attrName,
        passed: true,
        details: []
      };

      if (targetAdat) {
        if (func === 'SUM') {
          const isabEdges = this.isabEdges.filter(e => {
            const s = this.model.nodes.get(e.sourceId);
            const t = this.model.nodes.get(e.targetId);
            return (s?.id === targetAdat.id || t?.id === targetAdat.id);
          });

          if (isabEdges.length === 0) {
            aggCheck.passed = false;
            aggCheck.details.push(`FAILED: ADAT '${targetAdat.name}' has no ISAB relationship in schema.`);
            report.errors.push(`Aggregation Error: Summation on '${attrName}' disallowed because '${targetAdat.name}' has no ISAB relationships.`);
          } else {
            const nonAdditiveEdges = isabEdges.filter(e => {
              const addVal = (e.additivity || BOOLEAN_OPTIONS.TRUE).toString().trim().toLowerCase();
              return addVal === 'false';
            });

            if (nonAdditiveEdges.length > 0) {
              aggCheck.passed = false;
              aggCheck.details.push(`FAILED: ISAB relationship for '${targetAdat.name}' has Additivity=FALSE.`);
              report.errors.push(`Aggregation Error: Summation is allowed only if the attribute of the ADAT being summed up is in an ISAB relationship that has Additivity=TRUE. Attribute '${attrName}' of '${targetAdat.name}' has Additivity=FALSE.`);
            } else {
              aggCheck.details.push(`PASSED: ISAB relationship for '${targetAdat.name}' has Additivity=TRUE.`);
            }
          }
        } else {
          aggCheck.details.push(`PASSED: Function ${func} does not require strict Additivity=TRUE constraint.`);
        }
      }

      report.aggregationChecks.push(aggCheck);
    }
  }

  checkOverallAggregation(report) {
    const adats = Array.from(report.participatingADATs);
    const pans = Array.from(report.participatingPANs);

    if (adats.length > 0 && pans.length > 0) {
      adats.forEach(adat => {
        pans.forEach(pan => {
          let canAnalyse = this.hasISAB(adat, pan);
          if (!canAnalyse) {
            // Check if pan is a specialization descendant of a parent PAN that has ISAB to adat
            let curr = pan;
            while (curr && this.panTreeParents.has(curr.id)) {
              const parentInfo = this.panTreeParents.get(curr.id);
              if (parentInfo.edge.linkType === LINK_TYPES.UML_INHERITANCE) {
                const parentNode = this.model.nodes.get(parentInfo.parentId);
                if (parentNode && this.hasISAB(adat, parentNode)) {
                  canAnalyse = true;
                  break;
                }
                curr = parentNode;
              } else {
                break;
              }
            }
          }

          if (!canAnalyse) {
            report.errors.push(`Aggregation Error: PAN '${pan.name}' participating in the query does not analyse ADAT '${adat.name}'.`);
          }
        });
      });
    }
  }
}
