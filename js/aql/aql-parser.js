/**
 * aql-parser.js
 * Lexer and AST Parser for AQL (ADAPT Query Language based on OQL).
 * 
 * Supports:
 *   SELECT [DISTINCT] <projection_list>
 *   FROM <iterator_list>
 *   [WHERE <condition_expr>]
 *   [GROUP BY <group_list>]
 *   [HAVING <condition_expr>]
 *   [ORDER BY <order_list>]
 */

export class AQLParser {
  constructor() {
    this.tokens = [];
    this.pos = 0;
  }

  tokenize(input) {
    const tokens = [];
    let i = 0;
    const len = input.length;

    while (i < len) {
      const ch = input[i];

      // Whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Single-line comment -- or //
      if ((ch === '-' && input[i + 1] === '-') || (ch === '/' && input[i + 1] === '/')) {
        while (i < len && input[i] !== '\n') i++;
        continue;
      }

      // String literal '...' or "..."
      if (ch === "'" || ch === '"') {
        const quote = ch;
        let str = '';
        i++;
        while (i < len && input[i] !== quote) {
          if (input[i] === '\\' && i + 1 < len) {
            str += input[i + 1];
            i += 2;
          } else {
            str += input[i];
            i++;
          }
        }
        if (i < len) i++; // skip closing quote
        tokens.push({ type: 'STRING', value: str });
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        let numStr = '';
        while (i < len && /[0-9.]/.test(input[i])) {
          numStr += input[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // Comparison & Punctuation operators
      if (ch === '<' || ch === '>' || ch === '!' || ch === '=') {
        if (input.substr(i, 2) === '<=' || input.substr(i, 2) === '>=' || input.substr(i, 2) === '!=' || input.substr(i, 2) === '<>') {
          tokens.push({ type: 'OP', value: input.substr(i, 2) });
          i += 2;
        } else {
          tokens.push({ type: 'OP', value: ch });
          i++;
        }
        continue;
      }

      if (ch === '(' || ch === ')' || ch === ',' || ch === ';' || ch === '+' || ch === '-' || ch === '*' || ch === '/') {
        tokens.push({ type: ch, value: ch });
        i++;
        continue;
      }

      // Dot operator
      if (ch === '.') {
        tokens.push({ type: '.', value: '.' });
        i++;
        continue;
      }

      // Identifiers and Keywords (letters, digits, underscores)
      if (/[a-zA-Z_]/.test(ch)) {
        let ident = '';
        while (i < len && /[a-zA-Z0-9_]/.test(input[i])) {
          ident += input[i];
          i++;
        }

        const upper = ident.toUpperCase();
        const keywords = [
          'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 
          'ORDER', 'ASC', 'DESC', 'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 
          'IS', 'NULL', 'TRUE', 'FALSE', 'SUM', 'AVG', 'COUNT', 'MIN', 'MAX',
          'CREATE', 'VIEW', 'UPDATE', 'DELETE', 'SET'
        ];

        if (keywords.includes(upper)) {
          tokens.push({ type: 'KEYWORD', value: upper, raw: ident });
        } else {
          tokens.push({ type: 'IDENT', value: ident });
        }
        continue;
      }

      // Unknown character fallback
      i++;
    }

    tokens.push({ type: 'EOF', value: '' });
    return tokens;
  }

  parse(queryText) {
    this.tokens = this.tokenize(queryText.trim());
    this.pos = 0;

    // Check for disallowed UPDATE or DELETE statements
    if (this.matchKeyword('UPDATE') || this.matchKeyword('DELETE')) {
      throw new Error("UPDATE and DELETE statements are not permitted in AQL.");
    }

    let isView = false;
    let viewName = null;

    // Optional CREATE VIEW <view_name> AS
    if (this.matchKeyword('CREATE')) {
      if (!this.matchKeyword('VIEW')) {
        throw new Error("Expected 'VIEW' after 'CREATE'.");
      }
      const nameTok = this.expect('IDENT', null, "Expected view name after 'CREATE VIEW'.");
      viewName = nameTok.value;
      if (!this.matchKeyword('AS')) {
        throw new Error("Expected 'AS' after 'CREATE VIEW <view_name>'.");
      }
      isView = true;
    }

    // Check for disallowed UPDATE or DELETE inside view
    if (this.matchKeyword('UPDATE') || this.matchKeyword('DELETE')) {
      throw new Error("UPDATE and DELETE statements are not permitted in AQL.");
    }

    const ast = {
      isView,
      viewName,
      select: [],
      isDistinct: false,
      from: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      raw: queryText
    };

    if (!this.matchKeyword('SELECT')) {
      throw new Error("AQL query must start with 'SELECT' or 'CREATE VIEW <view_name> AS SELECT ...'.");
    }

    if (this.matchKeyword('DISTINCT')) {
      ast.isDistinct = true;
    }

    // Parse SELECT projections
    ast.select = this.parseSelectClause();

    if (!this.matchKeyword('FROM')) {
      throw new Error("Missing 'FROM' clause in AQL query.");
    }

    // Parse FROM clause (iterators and chains)
    ast.from = this.parseFromClause();

    // Optional WHERE clause
    if (this.matchKeyword('WHERE')) {
      ast.where = this.parseExpression();
    }

    // Optional GROUP BY clause
    if (this.matchKeyword('GROUP')) {
      if (!this.matchKeyword('BY')) {
        throw new Error("Expected 'BY' after 'GROUP'.");
      }
      ast.groupBy = this.parseExpressionList();
    }

    // Optional HAVING clause
    if (this.matchKeyword('HAVING')) {
      ast.having = this.parseExpression();
    }

    // Optional ORDER BY clause
    if (this.matchKeyword('ORDER')) {
      if (!this.matchKeyword('BY')) {
        throw new Error("Expected 'BY' after 'ORDER'.");
      }
      ast.orderBy = this.parseOrderByList();
    }

    return ast;
  }

  // --- Helper Methods ---

  peek() {
    return this.tokens[this.pos] || { type: 'EOF', value: '' };
  }

  next() {
    const tok = this.peek();
    this.pos++;
    return tok;
  }

  match(type, value = null) {
    const tok = this.peek();
    if (tok.type === type && (value === null || tok.value === value)) {
      this.pos++;
      return tok;
    }
    return null;
  }

  matchKeyword(kw) {
    const tok = this.peek();
    if (tok.type === 'KEYWORD' && tok.value.toUpperCase() === kw.toUpperCase()) {
      this.pos++;
      return tok;
    }
    return null;
  }

  expect(type, value = null, errMsg = null) {
    const tok = this.match(type, value);
    if (!tok) {
      const cur = this.peek();
      throw new Error(errMsg || `Expected '${value || type}', but found '${cur.value || cur.type}'.`);
    }
    return tok;
  }

  // --- Parse Clauses ---

  parseSelectClause() {
    const items = [];
    while (true) {
      const expr = this.parseSelectItem();
      items.push(expr);

      if (!this.match(',')) {
        break;
      }
    }
    return items;
  }

  parseSelectItem() {
    // Check for aggregate functions: SUM(...), AVG(...), COUNT(...), MIN(...), MAX(...)
    const tok = this.peek();
    if (tok.type === 'KEYWORD' && ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].includes(tok.value)) {
      const aggFunc = this.next().value;
      this.expect('(', '(', `Expected '(' after aggregate function ${aggFunc}`);
      
      let distinct = false;
      if (this.matchKeyword('DISTINCT')) distinct = true;

      let arg = null;
      if (aggFunc === 'COUNT' && this.match('*', '*')) {
        arg = { type: 'STAR', value: '*' };
      } else {
        arg = this.parsePathChainOrExpr();
      }
      this.expect(')', ')', `Expected ')' after ${aggFunc} argument`);

      let alias = null;
      if (this.matchKeyword('AS')) {
        alias = this.expect('IDENT').value;
      } else if (this.peek().type === 'IDENT') {
        alias = this.next().value;
      }

      return {
        type: 'AGGREGATE',
        func: aggFunc,
        distinct,
        argument: arg,
        alias,
        raw: `${aggFunc}(${arg.raw || arg.value || ''})`
      };
    }

    // Otherwise standard path chain or expression
    const chainExpr = this.parsePathChainOrExpr();

    let alias = null;
    if (this.matchKeyword('AS')) {
      alias = this.expect('IDENT').value;
    } else if (this.peek().type === 'IDENT' && !['FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER'].includes(this.peek().value.toUpperCase())) {
      alias = this.next().value;
    }

    return {
      type: 'PROJECTION',
      expression: chainExpr,
      alias,
      raw: chainExpr.raw
    };
  }

  parseFromClause() {
    const iterators = [];
    while (true) {
      const item = this.parseFromItem();
      iterators.push(item);

      if (!this.match(',')) {
        break;
      }
    }
    return iterators;
  }

  parseFromItem() {
    // e.g. "Sales S", "Sales as S", "S.Product P", "A.P1.P2 P"
    const chain = this.parsePathChain();
    let alias = null;

    if (this.matchKeyword('AS')) {
      alias = this.expect('IDENT').value;
    } else if (this.peek().type === 'IDENT' && !['WHERE', 'GROUP', 'HAVING', 'ORDER', 'FROM', 'SELECT'].includes(this.peek().value.toUpperCase())) {
      alias = this.next().value;
    }

    return {
      type: 'ITERATOR',
      chain,
      alias: alias || (chain.parts.length === 1 ? chain.parts[0] : null),
      raw: `${chain.raw}${alias ? ' ' + alias : ''}`
    };
  }

  parseExpressionList() {
    const list = [];
    while (true) {
      list.push(this.parsePathChainOrExpr());
      if (!this.match(',')) break;
    }
    return list;
  }

  parseOrderByList() {
    const list = [];
    while (true) {
      const expr = this.parsePathChainOrExpr();
      let direction = 'ASC';
      if (this.matchKeyword('DESC')) direction = 'DESC';
      else if (this.matchKeyword('ASC')) direction = 'ASC';

      list.push({ expr, direction });
      if (!this.match(',')) break;
    }
    return list;
  }

  // --- Path Chain Parser: e.g. A1.A2...An.a or A.P1.P2...Pn.p ---

  parsePathChain() {
    const firstTok = this.peek();
    if (firstTok.type !== 'IDENT' && !(firstTok.type === 'KEYWORD' && !['SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER'].includes(firstTok.value))) {
      throw new Error(`Expected identifier in path chain, but found '${firstTok.value || firstTok.type}'.`);
    }

    this.next();
    const parts = [firstTok.value];

    while (this.match('.')) {
      const nextTok = this.peek();
      if (nextTok.type === 'IDENT' || nextTok.type === 'KEYWORD') {
        parts.push(this.next().value);
      } else {
        throw new Error(`Expected identifier after '.' in path chain.`);
      }
    }

    return {
      type: 'CHAIN',
      parts,
      raw: parts.join('.')
    };
  }

  parsePathChainOrExpr() {
    return this.parseExpression();
  }

  // --- Boolean / Comparison Expression Parser ---

  parseExpression() {
    return this.parseLogicalOr();
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.matchKeyword('OR')) {
      const right = this.parseLogicalAnd();
      left = { type: 'BINARY_OP', op: 'OR', left, right };
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseComparison();
    while (this.matchKeyword('AND')) {
      const right = this.parseComparison();
      left = { type: 'BINARY_OP', op: 'AND', left, right };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAdditive();

    const cur = this.peek();
    if (cur.type === 'OP' && ['=', '!=', '<>', '<', '<=', '>', '>='].includes(cur.value)) {
      const op = this.next().value;
      const right = this.parseAdditive();
      return { type: 'COMPARISON', op, left, right };
    }

    if (this.matchKeyword('LIKE')) {
      const right = this.parseAdditive();
      return { type: 'COMPARISON', op: 'LIKE', left, right };
    }

    if (this.matchKeyword('IS')) {
      let not = false;
      if (this.matchKeyword('NOT')) not = true;
      if (this.matchKeyword('NULL')) {
        return { type: 'IS_NULL', expr: left, not };
      }
    }

    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (true) {
      if (this.match('+', '+')) {
        const right = this.parseMultiplicative();
        left = { type: 'BINARY_MATH', op: '+', left, right };
      } else if (this.match('-', '-')) {
        const right = this.parseMultiplicative();
        left = { type: 'BINARY_MATH', op: '-', left, right };
      } else {
        break;
      }
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parsePrimary();
    while (true) {
      if (this.match('*', '*')) {
        const right = this.parsePrimary();
        left = { type: 'BINARY_MATH', op: '*', left, right };
      } else if (this.match('/', '/')) {
        const right = this.parsePrimary();
        left = { type: 'BINARY_MATH', op: '/', left, right };
      } else {
        break;
      }
    }
    return left;
  }

  parsePrimary() {
    const tok = this.peek();

    // Parentheses
    if (this.match('(', '(')) {
      const expr = this.parseExpression();
      this.expect(')', ')');
      return expr;
    }

    // Aggregate function inside WHERE or HAVING
    if (tok.type === 'KEYWORD' && ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].includes(tok.value)) {
      const agg = this.next().value;
      this.expect('(', '(');
      const arg = this.parseExpression();
      this.expect(')', ')');
      return {
        type: 'AGGREGATE',
        func: agg,
        argument: arg,
        raw: `${agg}(${arg.raw || ''})`
      };
    }

    // Literal: String
    if (tok.type === 'STRING') {
      this.next();
      return { type: 'LITERAL_STRING', value: tok.value, raw: `'${tok.value}'` };
    }

    // Literal: Number
    if (tok.type === 'NUMBER') {
      this.next();
      return { type: 'LITERAL_NUMBER', value: tok.value, raw: `${tok.value}` };
    }

    // Literal: Boolean
    if (tok.type === 'KEYWORD' && (tok.value === 'TRUE' || tok.value === 'FALSE')) {
      this.next();
      return { type: 'LITERAL_BOOLEAN', value: tok.value === 'TRUE', raw: tok.value };
    }

    // Path chain: e.g. Sales.amount, S.Product.wattage, P.wattage
    if (tok.type === 'IDENT' || (tok.type === 'KEYWORD' && !['SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING'].includes(tok.value))) {
      return this.parsePathChain();
    }

    throw new Error(`Unexpected token '${tok.value || tok.type}' in AQL expression.`);
  }
}
