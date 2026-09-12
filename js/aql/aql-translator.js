/**
 * aql-translator.js
 * Translates verified AQL AST into Relational Star Schema SQL queries.
 * Handles single queries as well as compound set operations (UNION, INTERSECT, EXCEPT).
 */

import { LINK_TYPES, NODE_TYPES } from '../schema-model.js';

export class AQLTranslator {
  constructor(model, report) {
    this.model = model;
    this.report = report;
    this.buildIndex();
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

  normalize(str) {
    if (!str) return '';
    return str.trim().toLowerCase().replace(/[\s\-]+/g, '_');
  }

  translate(ast) {
    if (!this.report || !this.report.isValid) {
      throw new Error("Cannot translate query that failed semantic checks.");
    }

    let sql = this.translateSingleQuery(ast);

    // If there are chained set operations: UNION [ALL], INTERSECT, EXCEPT
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

  translateSingleQuery(queryAst) {
    // Identify driving ADAT and PAN iterators for this specific subquery
    let mainAdatName = '';
    let adatAlias = '';
    const panIterators = [];

    queryAst.from.forEach(item => {
      const parts = item.chain.parts;
      const firstNorm = this.normalize(parts[0]);
      const rawAlias = item.alias ? item.alias : parts[parts.length - 1];
      const normAlias = this.normalize(rawAlias);

      const directAdat = this.adatsByName.get(firstNorm);
      if (directAdat && parts.length === 1) {
        if (!mainAdatName) {
          mainAdatName = directAdat.name.trim().replace(/[\s\-]+/g, '_');
          adatAlias = rawAlias;
        }
        return;
      }

      // Standalone PAN iterator in FROM, e.g. "FROM SALE S, Customer C"
      const directPan = this.pansByName.get(firstNorm);
      if (directPan && parts.length === 1) {
        panIterators.push({ alias: normAlias, targetAlias: rawAlias, panChain: [directPan] });
        return;
      }

      // Check if parts[0] is alias or ADAT with remaining PAN chain
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

    // Auto-detect any PANs referenced in expressions (Option A: S.customer.name) not already in panIterators
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

    // Build SELECT projections
    const selectClauses = queryAst.select.map(item => this.translateSelectItem(item, adatAlias)).join(',\n       ');

    // Build FROM and JOINs
    let fromClause = `${mainAdatName} ${adatAlias}`;
    const joins = [];
    const joinedPanIds = new Set();

    panIterators.forEach(info => {
      const panChain = info.panChain;
      const targetAlias = info.targetAlias;

      for (let i = 0; i < panChain.length; i++) {
        const pan = panChain[i];
        if (joinedPanIds.has(pan.id)) continue;
        joinedPanIds.add(pan.id);

        const panName = pan.name.trim().replace(/[\s\-]+/g, '_');
        const dimTable = `Dim_${panName}`;
        const currentAlias = (i === panChain.length - 1) ? targetAlias : `${panName.toLowerCase()}_dim`;

        if (i === 0) {
          joins.push(`INNER JOIN ${dimTable} ${currentAlias} ON ${currentAlias}.${panName}_SK = ${adatAlias}.${panName}_SK`);
        } else {
          const parentPan = panChain[i - 1];
          const parentPanName = parentPan.name.trim().replace(/[\s\-]+/g, '_');
          const parentAlias = (i - 1 === panChain.length - 1) ? targetAlias : `${parentPanName.toLowerCase()}_dim`;
          joins.push(`INNER JOIN ${dimTable} ${currentAlias} ON ${currentAlias}.${panName}_SK = ${parentAlias}.${panName}_SK`);
        }
      }
    });

    let fullFrom = fromClause;
    if (joins.length > 0) {
      fullFrom += '\n' + joins.join('\n');
    }

    // Build WHERE clause
    let whereClause = '';
    if (queryAst.where) {
      whereClause = '\nWHERE ' + this.translateExpression(queryAst.where, adatAlias);
    }

    // Build GROUP BY clause
    let groupByClause = '';
    if (queryAst.groupBy && queryAst.groupBy.length > 0) {
      groupByClause = '\nGROUP BY ' + queryAst.groupBy.map(expr => this.translateExpression(expr, adatAlias)).join(', ');
    }

    // Build HAVING clause
    let havingClause = '';
    if (queryAst.having) {
      havingClause = '\nHAVING ' + this.translateExpression(queryAst.having, adatAlias);
    }

    // Build ORDER BY clause
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

    // If first part is an iterator
    const iter = this.report.iterators.get(firstNorm);
    if (iter) {
      if (iter.kind === 'ADAT') {
        if (parts.length === 2) {
          // e.g. S.Ex_showroom_price
          const attrName = parts[1];
          return `${iter.alias}.${attrName}`;
        }
        if (parts.length > 2) {
          // e.g. S.C.name or S.customer.name or S.C.state.cityName
          const secondNorm = this.normalize(parts[1]);
          const secondIter = this.report.iterators.get(secondNorm);
          if (secondIter && (secondIter.kind === 'PAN' || secondIter.kind === 'PAN_STANDALONE')) {
            const attrName = parts[parts.length - 1];
            if (parts.length === 3) {
              return `${secondIter.alias}.${attrName}`;
            } else {
              const targetPanName = parts[parts.length - 2];
              return `${targetPanName}.${attrName}`;
            }
          }
          const panNode = this.pansByName.get(secondNorm);
          if (panNode) {
            const attrName = parts[parts.length - 1];
            const panIter = Array.from(this.report.iterators.values()).find(
              it => (it.kind === 'PAN' || it.kind === 'PAN_STANDALONE') && it.panNode?.id === panNode.id
            );
            const aliasToUse = panIter ? panIter.alias : panNode.name.trim().replace(/[\s\-]+/g, '_');
            return `${aliasToUse}.${attrName}`;
          }
          const attrName = parts[parts.length - 1];
          return `${parts[parts.length - 2]}.${attrName}`;
        }
      } else if (iter.kind === 'PAN' || iter.kind === 'PAN_STANDALONE') {
        const attrName = parts[parts.length - 1];
        return `${iter.alias}.${attrName}`;
      }
    }

    // Direct Schema Name
    if (parts.length === 2) {
      return `${parts[0]}.${parts[1]}`;
    }

    if (parts.length === 1) {
      return `${defaultAdatAlias}.${parts[0]}`;
    }

    // Multi-part chain
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  }
}
