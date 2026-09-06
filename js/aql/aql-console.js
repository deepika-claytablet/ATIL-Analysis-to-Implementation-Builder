/**
 * aql-console.js
 * Controller for the Resizable AQL Bottom Panel,
 * connecting Parser, Checker, and Translator with interactive UI.
 */

import { AQLParser } from './aql-parser.js';
import { AQLChecker } from './aql-checker.js';
import { AQLTranslator } from './aql-translator.js';

export class AQLConsole {
  constructor(app, model) {
    this.app = app;
    this.model = model;
    this.isOpen = false;
    this.currentHeight = 220; // Default height in px (~22% of standard window)
    this.isResizing = false;

    this.parser = new AQLParser();
    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.panelEl = document.getElementById('aql-console-panel');
    this.resizerEl = document.getElementById('aql-panel-resizer');
    this.queryInput = document.getElementById('aql-query-input');
    this.btnCheck = document.getElementById('btn-aql-check');
    this.btnTranslate = document.getElementById('btn-aql-translate');
    this.btnClear = document.getElementById('btn-aql-clear');
    this.btnClose = document.getElementById('btn-aql-close');
    this.sampleSelect = document.getElementById('aql-sample-queries');

    this.tabChecker = document.getElementById('tab-aql-checker');
    this.tabSql = document.getElementById('tab-aql-sql');
    this.paneChecker = document.getElementById('pane-aql-checker');
    this.paneSql = document.getElementById('pane-aql-sql');
    this.sqlCodeOutput = document.getElementById('aql-sql-output');
    this.checkerResultsOutput = document.getElementById('aql-checker-results');
    this.btnCopySql = document.getElementById('btn-aql-copy-sql');
  }

  bindEvents() {
    // 1. Resizer Drag Events
    if (this.resizerEl) {
      this.resizerEl.addEventListener('mousedown', (e) => {
        this.isResizing = true;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isResizing) return;
        const windowHeight = window.innerHeight;
        const newHeight = windowHeight - e.clientY;
        const minHeight = 120;
        const maxHeight = windowHeight * 0.75;

        if (newHeight >= minHeight && newHeight <= maxHeight) {
          this.currentHeight = newHeight;
          this.panelEl.style.height = `${newHeight}px`;
        }
      });

      window.addEventListener('mouseup', () => {
        if (this.isResizing) {
          this.isResizing = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }

    // 2. Open / Close Toggle
    document.getElementById('btn-toggle-aql')?.addEventListener('click', () => {
      this.toggle();
    });

    this.btnClose?.addEventListener('click', () => {
      this.close();
    });

    // 3. Tab Switching
    this.tabChecker?.addEventListener('click', () => this.switchTab('checker'));
    this.tabSql?.addEventListener('click', () => this.switchTab('sql'));

    // 4. Sample Queries Selector
    this.sampleSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        this.loadSampleQuery(val);
      }
    });

    // 5. Actions
    this.btnCheck?.addEventListener('click', () => this.runCheck());
    this.btnTranslate?.addEventListener('click', () => this.runTranslate());
    this.btnClear?.addEventListener('click', () => {
      if (this.queryInput) this.queryInput.value = '';
      if (this.checkerResultsOutput) this.checkerResultsOutput.innerHTML = '<div class="aql-empty-output">Click "Check AQL" to evaluate query.</div>';
      if (this.sqlCodeOutput) this.sqlCodeOutput.textContent = '-- SQL translation will appear here';
    });

    this.btnCopySql?.addEventListener('click', () => {
      const sql = this.sqlCodeOutput?.textContent;
      if (sql && !sql.startsWith('--')) {
        navigator.clipboard.writeText(sql);
        this.app.showToast('Translated SQL copied to clipboard!', 'success');
      }
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    if (this.panelEl) {
      this.panelEl.classList.remove('hidden');
      this.panelEl.style.height = `${this.currentHeight}px`;
    }
    if (this.resizerEl) {
      this.resizerEl.classList.remove('hidden');
    }
    document.getElementById('btn-toggle-aql')?.classList.add('active');
    this.populateSampleQueries();
    setTimeout(() => this.app.canvas?.fitToScreen(), 50);
  }

  close() {
    this.isOpen = false;
    if (this.panelEl) {
      this.panelEl.classList.add('hidden');
    }
    if (this.resizerEl) {
      this.resizerEl.classList.add('hidden');
    }
    document.getElementById('btn-toggle-aql')?.classList.remove('active');
    setTimeout(() => this.app.canvas?.fitToScreen(), 50);
  }

  switchTab(tab) {
    if (tab === 'checker') {
      this.tabChecker?.classList.add('active');
      this.tabSql?.classList.remove('active');
      this.paneChecker?.classList.remove('hidden');
      this.paneSql?.classList.add('hidden');
    } else {
      this.tabSql?.classList.add('active');
      this.tabChecker?.classList.remove('active');
      this.paneSql?.classList.remove('hidden');
      this.paneChecker?.classList.add('hidden');
    }
  }

  // --- Sample Queries Dynamic Population ---

  populateSampleQueries() {
    if (!this.sampleSelect) return;
    this.sampleSelect.innerHTML = '<option value="">-- Load Sample AQL Query --</option>';

    const adats = Array.from(this.model.nodes.values()).filter(n => n.type === 'ADAT');
    const pans = Array.from(this.model.nodes.values()).filter(n => n.type === 'PAN');

    if (adats.length === 0) {
      this.sampleSelect.innerHTML += '<option value="generic_sample">Generic OQL Sample</option>';
      return;
    }

    const firstAdat = adats[0];
    const adatName = firstAdat.name.trim().replace(/[\s\-]+/g, '_');
    const adatAttr = (firstAdat.attributes && firstAdat.attributes[0]?.name) || 'amount';

    // Find linked PAN via ISAB
    let linkedPan = null;
    this.model.edges.forEach(e => {
      if (e.linkType === 'SOLID' && !linkedPan) {
        if (e.sourceId === firstAdat.id) linkedPan = this.model.nodes.get(e.targetId);
        else if (e.targetId === firstAdat.id) linkedPan = this.model.nodes.get(e.sourceId);
      }
    });

    const panName = linkedPan ? linkedPan.name.trim().replace(/[\s\-]+/g, '_') : (pans[0]?.name || 'PAN');
    const panAttr = (linkedPan?.attributes && linkedPan.attributes[0]?.name) || 'code';

    this.sampleSelect.innerHTML += `
      <option value="simple">1. Simple Projection (${adatName} & ${panName})</option>
      <option value="agg_sum">2. Aggregation SUM() with GROUP BY</option>
      <option value="group_by_having">3. GROUP BY with HAVING Condition</option>
      <option value="where_filter">4. Filtering with WHERE Clause</option>
      <option value="union_sample">5. Set Operation: UNION of Two Queries</option>
      <option value="intersect_sample">6. Set Operation: INTERSECT of Two Queries</option>
      <option value="except_sample">7. Set Operation: EXCEPT of Two Queries</option>
      <option value="create_view">8. CREATE VIEW on AQL Query</option>
      <option value="invalid_demo">9. Invalid Demo (Semantic Violation)</option>
    `;

    // Store sample query texts
    this.sampleQueries = {
      simple: `SELECT S.${adatAttr}, P.${panAttr}\nFROM ${adatName} S, S.${panName} P`,
      agg_sum: `SELECT S.${adatAttr}, P.${panAttr}, SUM(S.${adatAttr}) AS total_metric\nFROM ${adatName} S, S.${panName} P\nGROUP BY S.${adatAttr}, P.${panAttr}`,
      group_by_having: `SELECT S.${adatAttr}, P.${panAttr}, SUM(S.${adatAttr}) AS total_metric\nFROM ${adatName} S, S.${panName} P\nGROUP BY S.${adatAttr}, P.${panAttr}\nHAVING SUM(S.${adatAttr}) > 1000`,
      where_filter: `SELECT S.${adatAttr}, P.${panAttr}\nFROM ${adatName} S, S.${panName} P\nWHERE S.${adatAttr} > 100`,
      union_sample: `SELECT S.${adatAttr}, P.${panAttr}\nFROM ${adatName} S, S.${panName} P\nWHERE S.${adatAttr} > 500\nUNION\nSELECT S.${adatAttr}, P.${panAttr}\nFROM ${adatName} S, S.${panName} P\nWHERE P.${panAttr} = 'Beverage'`,
      intersect_sample: `SELECT S.${adatAttr}, P.${panAttr}\nFROM ${adatName} S, S.${panName} P\nWHERE S.${adatAttr} > 200\nINTERSECT\nSELECT S.${adatAttr}, P.${panAttr}\nFROM ${adatName} S, S.${panName} P\nWHERE S.${adatAttr} < 800`,
      except_sample: `SELECT S.${adatAttr}, P.${panAttr}\nFROM ${adatName} S, S.${panName} P\nWHERE S.${adatAttr} > 100\nEXCEPT\nSELECT S.${adatAttr}, P.${panAttr}\nFROM ${adatName} S, S.${panName} P\nWHERE S.${adatAttr} > 500`,
      create_view: `CREATE VIEW HighValueMetrics AS\nSELECT S.${adatAttr}, P.${panAttr}\nFROM ${adatName} S, S.${panName} P\nWHERE S.${adatAttr} > 5000`,
      invalid_demo: `SELECT S.non_existent_attribute, P.${panAttr}\nFROM ${adatName} S, S.InvalidPan P`,
      generic_sample: `SELECT S.value, P.wattage\nFROM Sales S, S.Product P\nWHERE P.wattage = 20`
    };

    // If query input is empty, load sample 1 by default
    if (this.queryInput && !this.queryInput.value.trim()) {
      this.queryInput.value = this.sampleQueries.simple;
    }
  }

  loadSampleQuery(key) {
    if (this.sampleQueries && this.sampleQueries[key] && this.queryInput) {
      this.queryInput.value = this.sampleQueries[key];
      this.runCheck();
    }
  }

  // --- Execution Handlers ---

  runCheck() {
    const queryText = this.queryInput?.value?.trim();
    if (!queryText) {
      this.app.showToast('Please type an AQL query.', 'info');
      return null;
    }

    this.switchTab('checker');
    this.checkerResultsOutput.innerHTML = '<div class="aql-loading">Parsing and verifying AQL against conceptual schema...</div>';

    let ast = null;
    try {
      ast = this.parser.parse(queryText);
    } catch (parseErr) {
      this.renderParseError(parseErr);
      return null;
    }

    const checker = new AQLChecker(this.model);
    const report = checker.checkQuery(ast);
    this.renderCheckerReport(report, ast);

    if (report.isValid) {
      this.app.showToast('AQL Syntax & Multidimensional Semantics Verified!', 'success');
    } else {
      this.app.showToast('AQL Semantic Check Failed. See details.', 'error');
    }

    return { ast, report };
  }

  runTranslate() {
    const checkResult = this.runCheck();
    if (!checkResult) return;

    const { ast, report } = checkResult;
    if (!report.isValid) {
      this.switchTab('checker');
      this.app.showToast('Cannot translate query with semantic errors. Fix reported issues first.', 'error');
      return;
    }

    try {
      const translator = new AQLTranslator(this.model, report);
      const sql = translator.translate(ast);
      
      this.sqlCodeOutput.textContent = sql;
      this.switchTab('sql');
      this.app.showToast('AQL successfully translated to Relational SQL!', 'success');
    } catch (transErr) {
      console.error(transErr);
      this.sqlCodeOutput.textContent = `-- Translation Error: ${transErr.message}`;
      this.switchTab('sql');
      this.app.showToast(`Translation error: ${transErr.message}`, 'error');
    }
  }

  // --- Rendering UI Results ---

  renderParseError(err) {
    this.checkerResultsOutput.innerHTML = `
      <div class="aql-report-box error">
        <div class="aql-report-header">
          <span class="aql-badge badge-error">PARSER ERROR</span>
          <h4>Syntax Error in AQL Query</h4>
        </div>
        <p class="aql-report-msg">${this.escapeHtml(err.message)}</p>
        <div class="aql-tip">Tip: AQL follows OQL format: <code>[CREATE VIEW &lt;name&gt; AS] SELECT [DISTINCT] &lt;expr&gt; FROM &lt;iterators&gt; [WHERE &lt;cond&gt;] [GROUP BY &lt;cols&gt;] [HAVING &lt;cond&gt;]</code></div>
      </div>
    `;
  }

  renderCheckerReport(report, ast) {
    const statusClass = report.isValid ? 'valid' : 'error';
    const statusBadge = report.isValid 
      ? '<span class="aql-badge badge-success">✓ VALID AQL QUERY</span>' 
      : '<span class="aql-badge badge-error">✕ SEMANTIC CHECKS FAILED</span>';

    let html = `
      <div class="aql-report-box ${statusClass}">
        <div class="aql-report-header">
          ${statusBadge}
          <h4>${report.isValid ? 'Multidimensional Analysis Semantics Preserved' : 'Validity Violations Detected'}</h4>
        </div>
        <p class="aql-report-summary">${this.escapeHtml(report.summary)}</p>
    `;

    // Errors Section
    if (report.errors.length > 0) {
      html += `
        <div class="aql-section aql-errors-list">
          <h5>Identified Violations:</h5>
          <ul>
            ${report.errors.map(err => `<li><strong>✕</strong> ${this.escapeHtml(err)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    // ADAT Reference Chain Checks
    if (report.tableVIIChecks.length > 0) {
      html += `
        <div class="aql-section">
          <h5>ADAT Reference Chain Checks:</h5>
          <table class="aql-check-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th>Length (n)</th>
                <th>Type of A1</th>
                <th>Conditions Evaluated</th>
                <th>Analysis Semantics Preserved</th>
              </tr>
            </thead>
            <tbody>
              ${report.tableVIIChecks.map(chk => `
                <tr class="${chk.passed ? 'row-pass' : 'row-fail'}">
                  <td><code>${this.escapeHtml(chk.chain)}</code></td>
                  <td>${chk.chainLength}</td>
                  <td><span class="type-tag">${this.escapeHtml(chk.adatType)}</span></td>
                  <td>${chk.conditions.map(c => `<div class="${c.startsWith('PASSED') ? 'cond-pass' : 'cond-fail'}">${this.escapeHtml(c)}</div>`).join('')}</td>
                  <td><em>${this.escapeHtml(chk.semantics || (chk.passed ? 'Verified' : 'Violated'))}</em></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // PAN Reference Chain Checks
    if (report.tableVIIIChecks.length > 0) {
      html += `
        <div class="aql-section">
          <h5>PAN Reference Chain Checks (A.P1...Pn.p):</h5>
          <table class="aql-check-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th>Length (n)</th>
                <th>Type of P1</th>
                <th>Conditions Evaluated</th>
                <th>Analysis Semantics Preserved</th>
              </tr>
            </thead>
            <tbody>
              ${report.tableVIIIChecks.map(chk => `
                <tr class="${chk.passed ? 'row-pass' : 'row-fail'}">
                  <td><code>${this.escapeHtml(chk.chain)}</code></td>
                  <td>${chk.chainLength}</td>
                  <td><span class="type-tag">${this.escapeHtml(chk.panType)}</span></td>
                  <td>${chk.conditions.map(c => `<div class="${c.startsWith('PASSED') ? 'cond-pass' : 'cond-fail'}">${this.escapeHtml(c)}</div>`).join('')}</td>
                  <td><em>${this.escapeHtml(chk.semantics || (chk.passed ? 'Verified' : 'Violated'))}</em></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Aggregations Section
    if (report.aggregationChecks.length > 0) {
      html += `
        <div class="aql-section">
          <h5>Aggregation Checks (Additivity & Participating PANs):</h5>
          <table class="aql-check-table">
            <thead>
              <tr>
                <th>Expression</th>
                <th>Function</th>
                <th>ADAT & Attribute</th>
                <th>Additivity Evaluation</th>
              </tr>
            </thead>
            <tbody>
              ${report.aggregationChecks.map(chk => `
                <tr class="${chk.passed ? 'row-pass' : 'row-fail'}">
                  <td><code>${this.escapeHtml(chk.raw)}</code></td>
                  <td><strong>${this.escapeHtml(chk.func)}</strong></td>
                  <td>${this.escapeHtml(chk.adatName)} . ${this.escapeHtml(chk.attribute)}</td>
                  <td>${chk.details.map(d => `<div class="${d.startsWith('PASSED') ? 'cond-pass' : 'cond-fail'}">${this.escapeHtml(d)}</div>`).join('')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    html += `</div>`;
    this.checkerResultsOutput.innerHTML = html;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
