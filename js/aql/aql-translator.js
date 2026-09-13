/**
 * aql-translator.js
 * Translates verified AQL AST into Relational Star Schema SQL queries.
 * Handles single queries as well as compound set operations (UNION, INTERSECT, EXCEPT).
 */

import { LINK_TYPES, NODE_TYPES } from '../schema-model.js';

export class AQLTranslator {
  constructor(model, report, outputSqlText = null) {
    this.model = model;
    this.report = report;
    this.outputSqlText = outputSqlText;
    this.buildIndex();
    this.initLogicalTables();
  }

  buildIndex() {
    this.adatsByName = new Map();
    this.pansByName = new Map();
    this.model.nodes.forEach(node => {
      const norm = this.normalize(node.name);
      if (node.type === NODE_TYPES.ADAT) {
        this.adatsByName.set(norm, node);
      } else if (node.type === NODE_TYPES.PAN) {
        this.pansByName.set(norm, node);
      }
    });
  }

  initLogicalTables() {
    if (this.outputSqlText) {
      this.logicalTables = this.parseRelationalSchema(this.outputSqlText);
    }
    if (!this.logicalTables || this.logicalTables.size === 0) {
      this.logicalTables = this.synthesizeLogicalTables();
    }
  }

  parseRelationalSchema(sqlText) {
    const tables = new Map();
    if (!sqlText || typeof sqlText !== 'string') return tables;

    // 1. Parse create table statements
    const createTableRegex = /create\s+table(?:\s+if\s+not\s+exists)?\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = createTableRegex.exec(sqlText)) !== null) {
      const rawTableName = match[1].trim();
      const body = match[2];
      const normTableName = this.normalize(rawTableName);

      const tableInfo = {
        name: rawTableName,
        columns: new Map(),
        primaryKey: null,
        foreignKeys: []
      };

      const lines = body.split(/[\r\n]+/);
      lines.forEach(line => {
        const trimmed = line.trim().replace(/,$/, '');
        if (!trimmed) return;

        if (trimmed.toUpperCase().includes('PRIMARY KEY')) {
          const inlinePk = trimmed.match(/^([a-zA-Z0-9_]+)\s+[a-zA-Z0-9_()]+\s+PRIMARY\s+KEY/i);
          const tablePk = trimmed.match(/PRIMARY\s+KEY\s*\(\s*([a-zA-Z0-9_]+)\s*\)/i);
          const pkCol = inlinePk ? inlinePk[1] : (tablePk ? tablePk[1] : null);
          if (pkCol) {
            tableInfo.primaryKey = pkCol.trim();
            tableInfo.columns.set(this.normalize(pkCol), pkCol.trim());
          }
        } else {
          const colMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+/);
          if (colMatch) {
            tableInfo.columns.set(this.normalize(colMatch[1]), colMatch[1].trim());
          }
        }
      });

      tables.set(normTableName, tableInfo);
    }

    // 2. Parse alter table statements
    const alterRegex = /alter\s+table\s+([a-zA-Z0-9_]+)\s+add\s+([\s\S]*?);/gi;
    while ((match = alterRegex.exec(sqlText)) !== null) {
      const rawTableName = match[1].trim();
      const rest = match[2].trim();
      const normTableName = this.normalize(rawTableName);
      let tableInfo = tables.get(normTableName);
      if (!tableInfo) {
        tableInfo = { name: rawTableName, columns: new Map(), primaryKey: null, foreignKeys: [] };
        tables.set(normTableName, tableInfo);
      }

      const fkMatch = rest.match(/foreign\s+key\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*references\s+([a-zA-Z0-9_]+)\s*\(\s*([a-zA-Z0-9_]+)\s*\)/i);
      if (fkMatch) {
        tableInfo.foreignKeys.push({
          column: fkMatch[1].trim(),
          refTable: fkMatch[2].trim(),
          refColumn: fkMatch[3].trim()
        });
      } else {
        const colMatch = rest.match(/^([a-zA-Z0-9_]+)\s+/);
        if (colMatch) {
          tableInfo.columns.set(this.normalize(colMatch[1]), colMatch[1].trim());
        }
      }
    }

    return tables;
  }

  synthesizeLogicalTables() {
    const tables = new Map();
    const panNodes = Array.from(this.model.nodes.values()).filter(n => n.type === NODE_TYPES.PAN);
    const adatNodes = Array.from(this.model.nodes.values()).filter(n => n.type === NODE_TYPES.ADAT);

    const isabEdges = Array.from(this.model.edges.values()).filter(e => e.linkType === LINK_TYPES.SOLID);
    const panHasISAB = (nodeId) => isabEdges.some(e => e.sourceId === nodeId || e.targetId === nodeId);

    const panParentToChildren = new Map();
    const panChildToParent = new Map();
    const panTreeTypes = [LINK_TYPES.UML_INHERITANCE, LINK_TYPES.COMPLETE_C, LINK_TYPES.AGGREGATION_DIAMOND];

    Array.from(this.model.edges.values()).forEach(e => {
      if (panTreeTypes.includes(e.linkType)) {
        const s = this.model.nodes.get(e.sourceId);
        const t = this.model.nodes.get(e.targetId);
        if (s?.type === NODE_TYPES.PAN && t?.type === NODE_TYPES.PAN) {
          if (!panParentToChildren.has(e.targetId)) panParentToChildren.set(e.targetId, []);
          panParentToChildren.get(e.targetId).push({ childId: e.sourceId, linkType: e.linkType });
          panChildToParent.set(e.sourceId, e.targetId);
        }
      }
    });

    const rootPanIds = Array.from(panParentToChildren.keys()).filter(pid => !panChildToParent.has(pid));
    const processedPanIds = new Set();

    rootPanIds.forEach(rootId => {
      const rootNode = this.model.nodes.get(rootId);
      const rootName = rootNode.name.trim().replace(/[\s\-]+/g, '_');
      const children = panParentToChildren.get(rootId) || [];
      const linkType = children.length > 0 ? children[0].linkType : LINK_TYPES.UML_INHERITANCE;

      if (linkType === LINK_TYPES.UML_INHERITANCE) {
        const rootHasIsab = panHasISAB(rootId);
        const childIds = [];
        const queue = [rootId];
        while (queue.length > 0) {
          const curr = queue.shift();
          (panParentToChildren.get(curr) || []).forEach(c => {
            childIds.push(c.childId);
            queue.push(c.childId);
          });
        }
        const nonRootsWithIsab = childIds.filter(id => panHasISAB(id));

        if (rootHasIsab && nonRootsWithIsab.length === 0) {
          const tInfo = { name: `Dim_${rootName}`, columns: new Map(), primaryKey: `${rootName}_SK`, foreignKeys: [] };
          tInfo.columns.set(this.normalize(`${rootName}_SK`), `${rootName}_SK`);
          (rootNode.attributes || []).forEach(a => tInfo.columns.set(this.normalize(a.name), a.name));
          childIds.forEach(cid => {
            const cn = this.model.nodes.get(cid);
            if (cn) {
              const cnName = cn.name.trim().replace(/[\s\-]+/g, '_');
              tInfo.columns.set(this.normalize(`${cnName}_SK`), `${cnName}_SK`);
              (cn.attributes || []).forEach(a => tInfo.columns.set(this.normalize(a.name), a.name));
            }
          });
          tables.set(this.normalize(`Dim_${rootName}`), tInfo);
          processedPanIds.add(rootId);
          childIds.forEach(id => processedPanIds.add(id));
        } else if (!rootHasIsab && nonRootsWithIsab.length > 0) {
          nonRootsWithIsab.forEach(childId => {
            const childNode = this.model.nodes.get(childId);
            const childName = childNode.name.trim().replace(/[\s\-]+/g, '_');
            const tInfo = { name: `Dim_${childName}`, columns: new Map(), primaryKey: `${childName}_SK`, foreignKeys: [] };
            tInfo.columns.set(this.normalize(`${childName}_SK`), `${childName}_SK`);
            tInfo.columns.set(this.normalize(`${rootName}_SK`), `${rootName}_SK`);
            (childNode.attributes || []).forEach(a => tInfo.columns.set(this.normalize(a.name), a.name));
            (rootNode.attributes || []).forEach(a => tInfo.columns.set(this.normalize(a.name), a.name));
            tables.set(this.normalize(`Dim_${childName}`), tInfo);
            processedPanIds.add(childId);
          });
          processedPanIds.add(rootId);
          childIds.forEach(id => processedPanIds.add(id));
        } else {
          const tInfo = { name: `Dim_${rootName}`, columns: new Map(), primaryKey: `${rootName}_SK`, foreignKeys: [] };
          tInfo.columns.set(this.normalize(`${rootName}_SK`), `${rootName}_SK`);
          (rootNode.attributes || []).forEach(a => tInfo.columns.set(this.normalize(a.name), a.name));
          tables.set(this.normalize(`Dim_${rootName}`), tInfo);
          processedPanIds.add(rootId);
        }
      } else if (linkType === LINK_TYPES.COMPLETE_C) {
        const tInfo = { name: `Dim_${rootName}`, columns: new Map(), primaryKey: `${rootName}_SK`, foreignKeys: [] };
        tInfo.columns.set(this.normalize(`${rootName}_SK`), `${rootName}_SK`);
        (rootNode.attributes || []).forEach(a => tInfo.columns.set(this.normalize(a.name), a.name));

        const queue = [rootId];
        while (queue.length > 0) {
          const curr = queue.shift();
          (panParentToChildren.get(curr) || []).forEach(c => {
            const cn = this.model.nodes.get(c.childId);
            if (cn) {
              const cnName = cn.name.trim().replace(/[\s\-]+/g, '_');
              tInfo.columns.set(this.normalize(`${cnName}_SK`), `${cnName}_SK`);
              (cn.attributes || []).forEach(a => tInfo.columns.set(this.normalize(a.name), a.name));
              processedPanIds.add(c.childId);
              queue.push(c.childId);
            }
          });
        }
        tables.set(this.normalize(`Dim_${rootName}`), tInfo);
        processedPanIds.add(rootId);
      }
    });

    panNodes.forEach(node => {
      if (!processedPanIds.has(node.id)) {
        const panName = node.name.trim().replace(/[\s\-]+/g, '_');
        const tInfo = { name: `Dim_${panName}`, columns: new Map(), primaryKey: `${panName}_SK`, foreignKeys: [] };
        tInfo.columns.set(this.normalize(`${panName}_SK`), `${panName}_SK`);
        (node.attributes || []).forEach(a => tInfo.columns.set(this.normalize(a.name), a.name));
        tables.set(this.normalize(`Dim_${panName}`), tInfo);
      }
    });

    adatNodes.forEach(node => {
      const adatName = node.name.trim().replace(/[\s\-]+/g, '_');
      const tInfo = { name: adatName, columns: new Map(), primaryKey: `${adatName}_Key`, foreignKeys: [] };
      tInfo.columns.set(this.normalize(`${adatName}_Key`), `${adatName}_Key`);
      (node.attributes || []).forEach(a => tInfo.columns.set(this.normalize(a.name), a.name));

      isabEdges.forEach(e => {
        if (e.sourceId === node.id || e.targetId === node.id) {
          const panId = (e.sourceId === node.id) ? e.targetId : e.sourceId;
          const pan = this.model.nodes.get(panId);
          if (pan && pan.type === NODE_TYPES.PAN) {
            const panName = pan.name.trim().replace(/[\s\-]+/g, '_');
            const adatM = (e.adatMultiplicity || '').toLowerCase();
            const panM = (e.panMultiplicity || '').toLowerCase();
            const isMtoN = (adatM === 'many' || adatM === '*' || !adatM) && (panM === 'many' || panM === '*');

            if (isMtoN) {
              const bridgeName = `Bridge_${adatName}_${panName}`;
              const bInfo = {
                name: bridgeName,
                columns: new Map([
                  [this.normalize(`${adatName}_key`), `${adatName}_key`],
                  [this.normalize(`${panName}_SK`), `${panName}_SK`]
                ]),
                primaryKey: null,
                foreignKeys: []
              };
              tables.set(this.normalize(bridgeName), bInfo);
            }

            const targetDimName = `Dim_${panName}`;
            let refDim = tables.get(this.normalize(targetDimName));
            if (!refDim) {
              for (const [tName, info] of tables.entries()) {
                if (info.columns.has(this.normalize(`${panName}_SK`))) {
                  refDim = info;
                  break;
                }
              }
            }
            if (refDim && !isMtoN) {
              const fkCol = refDim.primaryKey;
              tInfo.columns.set(this.normalize(fkCol), fkCol);
              tInfo.foreignKeys.push({
                column: fkCol,
                refTable: refDim.name,
                refColumn: refDim.primaryKey
              });
            }
          }
        }
      });

      tables.set(this.normalize(adatName), tInfo);
    });

    return tables;
  }

  findBridgeTable(mainAdatName, panNode) {
    if (!mainAdatName || !panNode) return null;
    const normAdat = this.normalize(mainAdatName);
    const panName = panNode.name.trim().replace(/[\s\-]+/g, '_');
    const normPan = this.normalize(panName);

    // Check direct bridge table name e.g. Bridge_sale_customer
    const directBridgeName = `bridge_${normAdat}_${normPan}`;
    const directTable = this.logicalTables.get(directBridgeName);
    if (directTable) {
      return directTable;
    }

    // Check all logical tables starting with Bridge_
    for (const [tName, info] of this.logicalTables.entries()) {
      if (tName.startsWith('bridge_') && tName.includes(normAdat) && tName.includes(normPan)) {
        return info;
      }
    }

    // Check if ISAB edge between this ADAT and PAN has many-to-many cardinality in conceptual model
    const isabEdges = Array.from(this.model.edges.values()).filter(e => e.linkType === LINK_TYPES.SOLID);
    const adatNode = Array.from(this.model.nodes.values()).find(n => n.type === NODE_TYPES.ADAT && this.normalize(n.name) === normAdat);
    if (adatNode) {
      const edge = isabEdges.find(e => 
        (e.sourceId === adatNode.id && e.targetId === panNode.id) ||
        (e.sourceId === panNode.id && e.targetId === adatNode.id)
      );
      if (edge) {
        const adatM = (edge.adatMultiplicity || '').toLowerCase();
        const panM = (edge.panMultiplicity || '').toLowerCase();
        const isMtoN = (adatM === 'many' || adatM === '*' || !adatM) && (panM === 'many' || panM === '*');
        if (isMtoN) {
          const bridgeName = `Bridge_${mainAdatName}_${panName}`;
          return {
            name: bridgeName,
            columns: new Map([
              [this.normalize(`${mainAdatName}_Key`), `${mainAdatName}_Key`],
              [this.normalize(`${panName}_SK`), `${panName}_SK`]
            ]),
            primaryKey: null,
            foreignKeys: []
          };
        }
      }
    }

    return null;
  }

  findTableForPan(panNode, attrName = null) {
    if (!panNode) return null;
    const panName = panNode.name.trim().replace(/[\s\-]+/g, '_');
    const directDim = `Dim_${panName}`;
    const directTable = this.logicalTables.get(this.normalize(directDim));
    if (directTable) {
      return directTable;
    }

    const skCol = this.normalize(`${panName}_SK`);
    for (const [tName, info] of this.logicalTables.entries()) {
      if (info.columns.has(skCol)) {
        return info;
      }
    }

    if (attrName) {
      const normAttr = this.normalize(attrName);
      for (const [tName, info] of this.logicalTables.entries()) {
        if (info.name.startsWith('Dim_') && info.columns.has(normAttr)) {
          return info;
        }
      }
    }

    if (panNode.attributes && panNode.attributes.length > 0) {
      for (const attr of panNode.attributes) {
        const normAttr = this.normalize(attr.name);
        for (const [tName, info] of this.logicalTables.entries()) {
          if (info.name.startsWith('Dim_') && info.columns.has(normAttr)) {
            return info;
          }
        }
      }
    }

    return null;
  }

  findForeignKey(mainAdatName, targetTableName) {
    const adatTable = this.logicalTables.get(this.normalize(mainAdatName));
    if (!adatTable) return null;

    const normTarget = this.normalize(targetTableName);
    const match = adatTable.foreignKeys.find(fk => this.normalize(fk.refTable) === normTarget);
    return match || null;
  }

  normalize(str) {
    if (!str) return '';
    return str.trim().toLowerCase().replace(/[\s\-]+/g, '_');
  }

  matchAttr(aName, bName) {
    if (!aName || !bName) return false;
    const n1 = this.normalize(aName);
    const n2 = this.normalize(bName);
    if (n1 === n2) return true;
    const clean1 = n1.replace(/_/g, '');
    const clean2 = n2.replace(/_/g, '');
    if (clean1 === clean2) return true;
    const exp1 = clean1.replace(/amt/g, 'amount');
    const exp2 = clean2.replace(/amt/g, 'amount');
    return exp1 === exp2;
  }

  findColumnInTable(tableInfo, attrName) {
    if (!tableInfo || !attrName) return attrName;
    const norm = this.normalize(attrName);
    if (tableInfo.columns.has(norm)) {
      return tableInfo.columns.get(norm);
    }
    for (const [cNorm, cName] of tableInfo.columns.entries()) {
      if (this.matchAttr(cNorm, norm)) {
        return cName;
      }
    }
    return attrName;
  }

  translate(ast) {
    if (!this.report || !this.report.isValid) {
      throw new Error("Cannot translate query that failed semantic checks.");
    }

    let sql = this.translateSingleQuery(ast);

    if (ast.setOperations && ast.setOperations.length > 0) {
      ast.setOperations.forEach(setOp => {
        const subSql = this.translateSingleQuery(setOp.query);
        sql += `\n\n${setOp.op}\n\n${subSql}`;
      });
    }

    sql += ';';

    if (ast.isView && ast.viewName) {
      sql = `CREATE VIEW ${ast.viewName} AS\n${sql}`;
    }

    return sql;
  }

  translateMultiAdatQuery(queryAst, adatIterators, panIterators) {
    // 1. Identify the shared dimension PAN
    let sharedPan = null;
    let dimAlias = 'L';

    if (panIterators.length > 0) {
      const pInfo = panIterators[0];
      sharedPan = pInfo.panChain[pInfo.panChain.length - 1];
      dimAlias = pInfo.targetAlias || 'L';
    } else {
      // Find PAN from AST chains
      for (const item of queryAst.select) {
        const expr = (item.type === 'AGGREGATE') ? item.argument : item.expression;
        if (expr && expr.type === 'CHAIN' && expr.parts.length > 2) {
          const panPart = expr.parts[1];
          const p = this.pansByName.get(this.normalize(panPart));
          if (p) {
            sharedPan = p;
            dimAlias = panPart;
            break;
          }
        }
      }
    }

    const dimTable = this.findTableForPan(sharedPan);
    const dimTableName = dimTable ? dimTable.name : (sharedPan ? `Dim_${sharedPan.name}` : 'Dim_Table');
    const dimPkCol = dimTable?.primaryKey || (dimTable ? this.findColumnInTable(dimTable, `${dimTableName.replace(/^Dim_/, '')}_SK`) : 'SK_Key');

    // 2. Classify SELECT projections & measure aggregations
    const dimProjections = [];
    const adatAggregations = new Map(); // adatNormAlias -> [ { item, factCol, aggAlias, func, expr } ]

    adatIterators.forEach(ai => {
      adatAggregations.set(ai.normAlias, []);
    });

    queryAst.select.forEach((item, idx) => {
      if (item.type === 'AGGREGATE') {
        const arg = item.argument;
        let matchedAdatInfo = null;
        let attrName = '';

        if (arg.type === 'CHAIN') {
          const parts = arg.parts;
          const firstNorm = this.normalize(parts[0]);

          // Match by iterator alias
          matchedAdatInfo = adatIterators.find(ai => ai.normAlias === firstNorm);
          
          // Match by ADAT name in parts
          if (!matchedAdatInfo) {
            for (const part of parts) {
              const pNorm = this.normalize(part);
              matchedAdatInfo = adatIterators.find(ai => this.normalize(ai.adatName) === pNorm || ai.normAlias === pNorm);
              if (matchedAdatInfo) break;
            }
          }

          attrName = parts[parts.length - 1];

          // If still not matched, check which ADAT has this attribute
          if (!matchedAdatInfo) {
            for (const ai of adatIterators) {
              const fTable = this.logicalTables.get(this.normalize(ai.adatName));
              if (fTable && this.findColumnInTable(fTable, attrName) !== attrName) {
                matchedAdatInfo = ai;
                break;
              }
            }
          }
        }

        if (!matchedAdatInfo && adatIterators.length > 0) {
          const adatIdx = adatAggregations.get(adatIterators[0].normAlias).length === 0 ? 0 : Math.min(1, adatIterators.length - 1);
          matchedAdatInfo = adatIterators[adatIdx];
        }

        const factTable = this.logicalTables.get(this.normalize(matchedAdatInfo.adatName));
        const factCol = this.findColumnInTable(factTable, attrName);

        // Alias for the aggregated column
        let aggAlias = item.alias;
        if (!aggAlias) {
          const normAdat = this.normalize(matchedAdatInfo.adatName);
          if (normAdat.includes('sale')) {
            aggAlias = 'TotalSales';
          } else if (normAdat.includes('service')) {
            aggAlias = 'TotalService';
          } else {
            aggAlias = `${item.func}_${factCol}`;
          }
        }

        const aggInfo = {
          item,
          factCol,
          aggAlias,
          func: item.func,
          distinct: item.distinct,
          subqueryAlias: matchedAdatInfo.alias
        };

        adatAggregations.get(matchedAdatInfo.normAlias).push(aggInfo);
      } else {
        // Dimension attribute projection
        const expr = item.expression;
        let dimCol = '';
        if (expr.type === 'CHAIN') {
          const attr = expr.parts[expr.parts.length - 1];
          dimCol = this.findColumnInTable(dimTable, attr);
        } else {
          dimCol = expr.value || expr.raw;
        }
        const projAlias = item.alias ? ` AS ${item.alias}` : '';
        dimProjections.push(`${dimAlias}.${dimCol}${projAlias}`);
      }
    });

    // 3. Construct outer SELECT list
    const outerSelectList = [...dimProjections];
    adatIterators.forEach(ai => {
      const aggs = adatAggregations.get(ai.normAlias) || [];
      aggs.forEach(ag => {
        outerSelectList.push(`${ag.subqueryAlias}.${ag.aggAlias}`);
      });
    });

    // 4. Construct Subqueries with LEFT JOINs
    const leftJoins = [];

    adatIterators.forEach(ai => {
      const factTable = this.logicalTables.get(this.normalize(ai.adatName));
      const factTableName = factTable ? factTable.name : ai.adatName;
      
      const fk = this.findForeignKey(ai.adatName, dimTableName);
      const fkCol = fk ? fk.column : (factTable ? this.findColumnInTable(factTable, dimPkCol) : dimPkCol);

      const aggs = adatAggregations.get(ai.normAlias) || [];
      const measureExprs = aggs.map(ag => {
        const distinctStr = ag.distinct ? 'DISTINCT ' : '';
        return `SUM(${distinctStr}${ag.factCol}) AS ${ag.aggAlias}`;
      });

      if (measureExprs.length === 0) {
        measureExprs.push(`COUNT(*) AS TotalCount`);
      }

      const subSql = `LEFT JOIN (
    SELECT
        ${fkCol},
        ${measureExprs.join(',\n        ')}
    FROM ${factTableName} ${ai.alias}
    GROUP BY ${fkCol}
) ${ai.alias}
    ON ${dimAlias}.${dimPkCol} = ${ai.alias}.${fkCol}`;

      leftJoins.push(subSql);
    });

    let sql = `SELECT ${outerSelectList.join(', ')}\nFROM ${dimTableName} ${dimAlias}\n` + leftJoins.join('\n');

    if (queryAst.where) {
      sql += `\nWHERE ` + this.translateExpression(queryAst.where, dimAlias);
    }
    if (queryAst.orderBy && queryAst.orderBy.length > 0) {
      sql += `\nORDER BY ` + queryAst.orderBy.map(item => `${this.translateExpression(item.expr, dimAlias)} ${item.direction}`).join(', ');
    }

    return sql;
  }

  translateSingleQuery(queryAst) {
    let mainAdatName = '';
    let adatAlias = '';
    const adatIterators = [];
    const panIterators = [];

    queryAst.from.forEach(item => {
      const parts = item.chain.parts;
      const firstNorm = this.normalize(parts[0]);
      const rawAlias = item.alias ? item.alias : parts[parts.length - 1];
      const normAlias = this.normalize(rawAlias);

      const directAdat = this.adatsByName.get(firstNorm);
      if (directAdat && parts.length === 1) {
        adatIterators.push({
          alias: rawAlias,
          normAlias,
          adatNode: directAdat,
          adatName: directAdat.name.trim().replace(/[\s\-]+/g, '_')
        });
        if (!mainAdatName) {
          mainAdatName = directAdat.name.trim().replace(/[\s\-]+/g, '_');
          adatAlias = rawAlias;
        }
        return;
      }

      const directPan = this.pansByName.get(firstNorm);
      if (directPan && parts.length === 1) {
        panIterators.push({ alias: normAlias, targetAlias: rawAlias, panChain: [directPan] });
        return;
      }

      if (parts.length > 1) {
        const panNames = parts.slice(1);
        const panChain = [];
        panNames.forEach(pn => {
          const p = this.pansByName.get(this.normalize(pn));
          if (p) panChain.push(p);
        });
        if (panChain.length > 0) {
          panIterators.push({ alias: normAlias, targetAlias: rawAlias, panChain });
        }
      }
    });

    if (adatIterators.length > 1) {
      return this.translateMultiAdatQuery(queryAst, adatIterators, panIterators);
    }

    if (!mainAdatName) {
      const firstAdat = Array.from(this.adatsByName.values())[0];
      if (firstAdat) {
        mainAdatName = firstAdat.name.trim().replace(/[\s\-]+/g, '_');
        adatAlias = mainAdatName;
      } else {
        mainAdatName = 'FactTable';
        adatAlias = 'S';
      }
    }

    const scanForChains = (expr) => {
      if (!expr) return;
      if (expr.type === 'CHAIN' && expr.parts.length > 2) {
        const panPart = expr.parts[1];
        const p = this.pansByName.get(this.normalize(panPart));
        if (p && !panIterators.some(pi => pi.panChain.some(pc => pc.id === p.id))) {
          const defaultPanAlias = p.name.trim().replace(/[\s\-]+/g, '_');
          panIterators.push({ alias: this.normalize(defaultPanAlias), targetAlias: defaultPanAlias, panChain: [p] });
        }
      } else if (expr.type === 'AGGREGATE') {
        scanForChains(expr.argument);
      } else if (expr.left && expr.right) {
        scanForChains(expr.left);
        scanForChains(expr.right);
      } else if (expr.expr) {
        scanForChains(expr.expr);
      }
    };

    queryAst.select.forEach(s => s.type === 'AGGREGATE' ? scanForChains(s) : scanForChains(s.expression));
    if (queryAst.where) scanForChains(queryAst.where);
    if (queryAst.groupBy) queryAst.groupBy.forEach(g => scanForChains(g));
    if (queryAst.having) scanForChains(queryAst.having);
    if (queryAst.orderBy) queryAst.orderBy.forEach(o => scanForChains(o.expr));

    // Build FROM and JOINs using logical tables from Convert to Logical layer
    let fromClause = `${mainAdatName} ${adatAlias}`;
    const joins = [];
    const tableToJoinedAlias = new Map();
    const aliasMapping = new Map();

    panIterators.forEach(info => {
      const panChain = info.panChain;
      const targetAlias = info.targetAlias;
      const targetPan = panChain[panChain.length - 1];

      const targetTable = this.findTableForPan(targetPan);
      if (targetTable) {
        const tableNorm = targetTable.name.toLowerCase();

        if (tableToJoinedAlias.has(tableNorm)) {
          // If the table is already joined, reuse the existing join alias and don't create another join
          const existingAlias = tableToJoinedAlias.get(tableNorm);
          aliasMapping.set(info.alias, existingAlias);
          aliasMapping.set(this.normalize(targetAlias), existingAlias);
          panChain.forEach(p => {
            aliasMapping.set(this.normalize(p.name), existingAlias);
          });
          return;
        }

        tableToJoinedAlias.set(tableNorm, targetAlias);
        aliasMapping.set(info.alias, targetAlias);
        aliasMapping.set(this.normalize(targetAlias), targetAlias);
        panChain.forEach(p => {
          aliasMapping.set(this.normalize(p.name), targetAlias);
        });

        const bridgeTable = this.findBridgeTable(mainAdatName, targetPan);
        if (bridgeTable) {
          const bridgeAlias = `B_${targetAlias}`;
          const adatTable = this.logicalTables.get(this.normalize(mainAdatName));
          const adatPkCol = adatTable?.primaryKey || `${mainAdatName}_Key`;
          const bridgeAdatCol = this.findColumnInTable(bridgeTable, adatPkCol) || adatPkCol;

          const panPkCol = targetTable.primaryKey || `${targetPan.name.replace(/^Dim_/, '')}_SK`;
          const bridgePanCol = this.findColumnInTable(bridgeTable, panPkCol) || panPkCol;

          joins.push(`INNER JOIN ${bridgeTable.name} ${bridgeAlias} ON ${adatAlias}.${adatPkCol} = ${bridgeAlias}.${bridgeAdatCol}`);
          joins.push(`INNER JOIN ${targetTable.name} ${targetAlias} ON ${bridgeAlias}.${bridgePanCol} = ${targetAlias}.${panPkCol}`);
        } else {
          const fk = this.findForeignKey(mainAdatName, targetTable.name);
          if (fk) {
            joins.push(`INNER JOIN ${targetTable.name} ${targetAlias} ON ${targetAlias}.${fk.refColumn} = ${adatAlias}.${fk.column}`);
          } else {
            const pk = targetTable.primaryKey || `${targetTable.name.replace(/^Dim_/, '')}_SK`;
            joins.push(`INNER JOIN ${targetTable.name} ${targetAlias} ON ${targetAlias}.${pk} = ${adatAlias}.${pk}`);
          }
        }
      }
    });

    this.currentAliasMapping = aliasMapping;
    this.currentTableToJoinedAlias = tableToJoinedAlias;

    let fullFrom = fromClause;
    if (joins.length > 0) {
      fullFrom += '\n' + joins.join('\n');
    }

    const selectClauses = queryAst.select.map(item => this.translateSelectItem(item, adatAlias)).join(',\n       ');

    let whereClause = '';
    if (queryAst.where) {
      whereClause = '\nWHERE ' + this.translateExpression(queryAst.where, adatAlias);
    }

    let groupByClause = '';
    if (queryAst.groupBy && queryAst.groupBy.length > 0) {
      groupByClause = '\nGROUP BY ' + queryAst.groupBy.map(expr => this.translateExpression(expr, adatAlias)).join(', ');
    }

    let havingClause = '';
    if (queryAst.having) {
      havingClause = '\nHAVING ' + this.translateExpression(queryAst.having, adatAlias);
    }

    let orderByClause = '';
    if (queryAst.orderBy && queryAst.orderBy.length > 0) {
      orderByClause = '\nORDER BY ' + queryAst.orderBy.map(item => `${this.translateExpression(item.expr, adatAlias)} ${item.direction}`).join(', ');
    }

    const distinctStr = queryAst.isDistinct ? 'DISTINCT ' : '';
    return `SELECT ${distinctStr}${selectClauses}\nFROM ${fullFrom}${whereClause}${groupByClause}${havingClause}${orderByClause}`;
  }

  translateSelectItem(item, defaultAdatAlias) {
    if (item.type === 'AGGREGATE') {
      const distinctStr = item.distinct ? 'DISTINCT ' : '';
      const argStr = item.argument.type === 'STAR' ? '*' : this.translateExpression(item.argument, defaultAdatAlias);
      const aliasStr = item.alias ? ` AS ${item.alias}` : '';
      return `${item.func}(${distinctStr}${argStr})${aliasStr}`;
    }

    if (item.type === 'PROJECTION') {
      const exprStr = this.translateExpression(item.expression, defaultAdatAlias);
      const aliasStr = item.alias ? ` AS ${item.alias}` : '';
      return `${exprStr}${aliasStr}`;
    }

    return '';
  }

  translateExpression(expr, defaultAdatAlias) {
    if (!expr) return '';

    switch (expr.type) {
      case 'CHAIN':
        return this.translateChain(expr, defaultAdatAlias);

      case 'AGGREGATE':
        const distinctStr = expr.distinct ? 'DISTINCT ' : '';
        const argStr = expr.argument.type === 'STAR' ? '*' : this.translateExpression(expr.argument, defaultAdatAlias);
        return `${expr.func}(${distinctStr}${argStr})`;

      case 'LITERAL_STRING':
        return `'${expr.value}'`;

      case 'LITERAL_NUMBER':
        return `${expr.value}`;

      case 'LITERAL_BOOLEAN':
        return expr.value ? 'TRUE' : 'FALSE';

      case 'LITERAL':
        if (typeof expr.value === 'string') {
          return `'${expr.value}'`;
        }
        return `${expr.value}`;

      case 'BOOLEAN':
        return expr.value ? 'TRUE' : 'FALSE';

      case 'NULL':
        return 'NULL';

      case 'COMPARISON':
      case 'BINARY_OP':
      case 'BINARY_MATH':
        const left = this.translateExpression(expr.left, defaultAdatAlias);
        const right = this.translateExpression(expr.right, defaultAdatAlias);
        const op = expr.op || expr.operator || '=';
        return `${left} ${op} ${right}`;

      case 'IS_NULL':
        const sub = this.translateExpression(expr.expr, defaultAdatAlias);
        return expr.not ? `${sub} IS NOT NULL` : `${sub} IS NULL`;

      default:
        return expr.raw || (expr.value !== undefined ? `${expr.value}` : '');
    }
  }

  translateChain(chain, defaultAdatAlias) {
    const parts = chain.parts;
    const firstNorm = this.normalize(parts[0]);

    const resolveAlias = (rawOrNorm) => {
      if (!rawOrNorm) return rawOrNorm;
      const norm = this.normalize(rawOrNorm);
      if (this.currentAliasMapping && this.currentAliasMapping.has(norm)) {
        return this.currentAliasMapping.get(norm);
      }
      return rawOrNorm;
    };

    // If first part is an iterator
    const iter = this.report?.iterators?.get(firstNorm);
    if (iter) {
      if (iter.kind === 'ADAT') {
        if (parts.length === 2) {
          // e.g. S.Ex_showroom_price
          const attrName = parts[1];
          return `${iter.alias}.${attrName}`;
        }
        if (parts.length > 2) {
          // e.g. S.CT.Cityname or S.ST.State_name or S.customer.name or S.C.state.cityName
          const secondNorm = this.normalize(parts[1]);
          const secondIter = this.report?.iterators?.get(secondNorm);
          if (secondIter && (secondIter.kind === 'PAN' || secondIter.kind === 'PAN_STANDALONE')) {
            const attrName = parts[parts.length - 1];
            if (parts.length === 3) {
              return `${resolveAlias(secondIter.alias)}.${attrName}`;
            } else {
              const targetPanName = parts[parts.length - 2];
              return `${resolveAlias(targetPanName)}.${attrName}`;
            }
          }
          const panNode = this.pansByName.get(secondNorm);
          if (panNode) {
            const attrName = parts[parts.length - 1];
            const panIter = Array.from(this.report.iterators.values()).find(
              it => (it.kind === 'PAN' || it.kind === 'PAN_STANDALONE') && it.panNode?.id === panNode.id
            );
            const aliasToUse = panIter ? panIter.alias : panNode.name.trim().replace(/[\s\-]+/g, '_');
            return `${resolveAlias(aliasToUse)}.${attrName}`;
          }
          const attrName = parts[parts.length - 1];
          const targetPanName = parts[parts.length - 2];
          return `${resolveAlias(targetPanName)}.${attrName}`;
        }
      } else if (iter.kind === 'PAN' || iter.kind === 'PAN_STANDALONE') {
        const attrName = parts[parts.length - 1];
        return `${resolveAlias(iter.alias)}.${attrName}`;
      }
    }

    // Direct Schema Name or Alias: e.g. CT.Cityname
    if (parts.length === 2) {
      const aliasOrPan = parts[0];
      const attrName = parts[1];
      return `${resolveAlias(aliasOrPan)}.${attrName}`;
    }

    if (parts.length === 1) {
      return `${defaultAdatAlias}.${parts[0]}`;
    }

    // Multi-part chain
    const target = resolveAlias(parts[parts.length - 2]);
    return `${target}.${parts[parts.length - 1]}`;
  }
}
