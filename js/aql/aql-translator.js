/**
 * aql-translator.js
 * Translates verified AQL queries to standard Relational SQL
 * based on the underlying schema's star/relational mappings:
 *   - ADAT tables (Fact/Entity relations)
 *   - Dimension tables (Dim_<Pan>)
 *   - Surrogate keys (<Pan>_SK) and foreign key joins
 *   - Aggregations, GROUP BY, WHERE, and ORDER BY
 */

import { NODE_TYPES } from '../schema-model.js';

export class AQLTranslator {
  constructor(model, checkReport) {
    this.model = model;
    this.report = checkReport;
  }

  normalize(str) {
    if (!str) return '';
    return str.trim().toLowerCase().replace(/[\s\-]+/g, '_');
  }

  translate(ast) {
    if (!this.report || !this.report.isValid) {
      throw new Error("Cannot translate query that failed semantic checks.");
    }

    // Identify main driving ADAT
    const adats = Array.from(this.report.participatingADATs);
    if (adats.length === 0) {
      throw new Error("Query does not specify an ADAT relation in FROM.");
    }

    const mainAdat = adats[0];
    const mainAdatName = mainAdat.name.trim().replace(/[\s\-]+/g, '_');
    
    // Find alias for main ADAT
    let adatAlias = mainAdatName;
    for (const [alias, info] of this.report.iterators.entries()) {
      if (info.kind === 'ADAT' && info.node.id === mainAdat.id) {
        adatAlias = info.alias || alias;
        break;
      }
    }

    // Build SELECT projections
    const selectClauses = ast.select.map(item => this.translateSelectItem(item, adatAlias)).join(',\n       ');

    // Build FROM and JOINs
    let fromClause = `${mainAdatName} ${adatAlias}`;
    const joins = [];
    const joinedPanIds = new Set();

    // Iterate through PAN iterators defined in query
    for (const [alias, info] of this.report.iterators.entries()) {
      if (info.kind === 'PAN') {
        const panChain = info.chain;
        const targetAlias = info.alias || alias;

        for (let i = 0; i < panChain.length; i++) {
          const pan = panChain[i];
          if (joinedPanIds.has(pan.id)) continue;
          joinedPanIds.add(pan.id);

          const panName = pan.name.trim().replace(/[\s\-]+/g, '_');
          const dimTable = `Dim_${panName}`;
          const currentAlias = (i === panChain.length - 1) ? targetAlias : `${panName.toLowerCase()}_dim`;

          if (i === 0) {
            // Join first PAN to Fact/ADAT table
            joins.push(`INNER JOIN ${dimTable} ${currentAlias} ON ${currentAlias}.${panName}_SK = ${adatAlias}.${panName}_SK`);
          } else {
            // Join child PAN to parent PAN
            const parentPan = panChain[i - 1];
            const parentPanName = parentPan.name.trim().replace(/[\s\-]+/g, '_');
            const parentAlias = (i - 1 === panChain.length - 1) ? targetAlias : `${parentPanName.toLowerCase()}_dim`;
            joins.push(`INNER JOIN ${dimTable} ${currentAlias} ON ${currentAlias}.${panName}_SK = ${parentAlias}.${panName}_SK`);
          }
        }
      }
    }

    let fullFrom = fromClause;
    if (joins.length > 0) {
      fullFrom += '\n' + joins.join('\n');
    }

    // Build WHERE clause
    let whereClause = '';
    if (ast.where) {
      whereClause = '\nWHERE ' + this.translateExpression(ast.where, adatAlias);
    }

    // Build GROUP BY clause
    let groupByClause = '';
    if (ast.groupBy && ast.groupBy.length > 0) {
      groupByClause = '\nGROUP BY ' + ast.groupBy.map(expr => this.translateExpression(expr, adatAlias)).join(', ');
    }

    // Build HAVING clause
    let havingClause = '';
    if (ast.having) {
      havingClause = '\nHAVING ' + this.translateExpression(ast.having, adatAlias);
    }

    // Build ORDER BY clause
    let orderByClause = '';
    if (ast.orderBy && ast.orderBy.length > 0) {
      orderByClause = '\nORDER BY ' + ast.orderBy.map(item => `${this.translateExpression(item.expr, adatAlias)} ${item.direction}`).join(', ');
    }

    const distinctStr = ast.isDistinct ? 'DISTINCT ' : '';
    let sql = `SELECT ${distinctStr}${selectClauses}\nFROM ${fullFrom}${whereClause}${groupByClause}${havingClause}${orderByClause};`;
    
    if (ast.isView && ast.viewName) {
      sql = `CREATE VIEW ${ast.viewName} AS\n${sql}`;
    }

    return sql;
  }

  translateSelectItem(item, defaultAdatAlias) {
    if (item.type === 'AGGREGATE') {
      const distinctStr = item.distinct ? 'DISTINCT ' : '';
      const argStr = item.argument.type === 'STAR' ? '*' : this.translateExpression(item.argument, defaultAdatAlias);
      const aliasStr = item.alias ? ` AS ${item.alias}` : '';
      return `${item.func}(${distinctStr}${argStr})${aliasStr}`;
    }

    const exprStr = this.translateExpression(item.expression, defaultAdatAlias);
    const aliasStr = item.alias ? ` AS ${item.alias}` : '';
    return `${exprStr}${aliasStr}`;
  }

  translateExpression(expr, defaultAdatAlias) {
    if (!expr) return '';

    if (expr.type === 'CHAIN') {
      return this.translateChain(expr, defaultAdatAlias);
    }

    if (expr.type === 'AGGREGATE') {
      const argStr = expr.argument.type === 'STAR' ? '*' : this.translateExpression(expr.argument, defaultAdatAlias);
      return `${expr.func}(${argStr})`;
    }

    if (expr.type === 'COMPARISON') {
      return `${this.translateExpression(expr.left, defaultAdatAlias)} ${expr.op} ${this.translateExpression(expr.right, defaultAdatAlias)}`;
    }

    if (expr.type === 'BINARY_OP') {
      return `${this.translateExpression(expr.left, defaultAdatAlias)} ${expr.op} ${this.translateExpression(expr.right, defaultAdatAlias)}`;
    }

    if (expr.type === 'BINARY_MATH') {
      return `${this.translateExpression(expr.left, defaultAdatAlias)} ${expr.op} ${this.translateExpression(expr.right, defaultAdatAlias)}`;
    }

    if (expr.type === 'IS_NULL') {
      return `${this.translateExpression(expr.expr, defaultAdatAlias)} IS ${expr.not ? 'NOT ' : ''}NULL`;
    }

    if (expr.type === 'LITERAL_STRING') {
      return `'${expr.value}'`;
    }

    if (expr.type === 'LITERAL_NUMBER') {
      return `${expr.value}`;
    }

    if (expr.type === 'LITERAL_BOOLEAN') {
      return expr.value ? 'TRUE' : 'FALSE';
    }

    return expr.raw || '';
  }

  translateChain(chain, defaultAdatAlias) {
    const parts = chain.parts;
    const firstNorm = this.normalize(parts[0]);

    // If first part is an iterator
    const iter = this.report.iterators.get(firstNorm);
    if (iter) {
      if (iter.kind === 'ADAT') {
        const attrName = parts[parts.length - 1];
        return `${iter.alias}.${attrName}`;
      } else if (iter.kind === 'PAN') {
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
