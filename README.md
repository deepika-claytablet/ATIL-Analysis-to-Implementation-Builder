# ATIL: Analysis-to-Implementation Builder for ADAPT Schemas & AQL Engine

**ATIL (Analysis-to-Implementation Layer / Builder)** is an interactive visual modeling system and multidimensional query translation engine built for the **ADAPT** conceptual modeling methodology and the **AQL (ADAPT Query Language)** query algebra.

This repository contains the full source code, semantic verification engine, relational SQL translator, and default sample schema (`sale`) accompanying the research paper.

---

## 🌟 1. Conceptual Schema Visual Modeling

ATIL models multidimensional data warehouses and analytical databases through two core conceptual entities and five formal relationship line types:

### Core Conceptual Nodes
- **ADAT (Abstract Data Type / Analysis Data)**:
  - Supports **Structured** and **Unstructured** natures.
  - Attributes parameterized by **Numeric** and **Non Numeric** data kinds.
- **PAN (Parameters of ANalysis / Access Nodes)**:
  - Dimensional analysis parameters with attribute update semantics (**UPDATE** / **NO UPDATE**).

### Relationship Notations & Visual Connectors
1. **ISAB (`──────` Solid Line)**:
   - Connects `ADAT ↔ PAN` with multidimensional metadata: **Additivity** (`True`/`False`), **Applicability** (`True`/`False`), and Multiplicity (`*`, `1..*`).
2. **Specialization (`───▷` UML Inheritance Triangle)**:
   - Specialization hierarchy pointing to parent entity.
3. **Derived (`───▷[D]` Triangle with "D")**:
   - Disjoint / Derived analytical hierarchies.
4. **Container (`───▷[C]` Triangle with "C")**:
   - Encapsulation / Containment hierarchies (single child per parent).
5. **Complex (`───◇` Aggregation Diamond)**:
   - Complex component aggregation hierarchies.

---

## 📐 2. Structural Validity Rules Enforced

The tool enforces rigorous structural constraints during diagram construction and analysis:
- **Parent ADAT Consistency**: A parent ADAT node in a hierarchy cannot mix connection types; once a hierarchy type is established, all children must share that type, and the only other relationship the parent can participate in is ISAB.
- **Specialization ADAT Trees**: Only **leaf-level ADATs** can be linked via ISAB to a PAN. Non-leaf parent ADATs are blocked from direct ISAB linkages.
- **Derived ADAT Trees**: Leaf-level ADATs cannot be linked via ISAB to a PAN; only the base/root ADATs participate in ISAB.
- **Containment Rule**: Each parent container node (for both ADAT and PAN) can have at most one child.

---

## 🔍 3. AQL (ADAPT Query Language) Engine

**AQL** is an OQL-based analytical query language enabling declarative querying over ADAPT conceptual schemas.

### 3.1 Semantic Checker
Enforces multidimensional analysis semantics:
- **ADAT Reference Chains ($A_1.A_2 \dots A_n.a$)**:
  - Validates atomic attributes, leaf specialization constraints, derived branches, complex aggregations, and container extractions.
- **PAN Reference Chains ($A.P_1.P_2 \dots P_n.p$)**:
  - Validates ISAB existence, complex/specialization hierarchy paths, and container applicability conditions ($\text{Applicability} = \text{TRUE}$).
- **Aggregation Checks**:
  - Summation (`SUM`) is permitted only if the attribute belongs to an ISAB relationship with $\text{Additivity} = \text{TRUE}$.
  - Verifies that all participating PANs analyse the target ADAT.
- **GROUP BY Compliance**:
  - When `GROUP BY` is present, all non-aggregate projections in `SELECT` must be included in the `GROUP BY` list.
- **Set Operations**:
  - Full support for **`UNION`** (and `UNION ALL`), **`INTERSECT`**, and **`EXCEPT`** with projection compatibility validation.
- **Views**:
  - Declarative view definitions via `CREATE VIEW <name> AS <query>`.

### 3.2 Relational SQL Translator
- Translates verified AQL queries into executable ANSI SQL / Relational Star Schemas.
- Generates Fact tables, dimension tables (`Dim_<Pan>`), surrogate key joins (`<Pan>_SK`), `WHERE` filters, `GROUP BY`, `HAVING`, and set operations (`UNION`, `INTERSECT`, `EXCEPT`).

---

## 🗂️ 4. Project Structure

```text
├── index.html                  # Main Web Application Interface
├── server.py                   # Lightweight Local Python HTTP Server & Java Bridge
├── README.md                   # System Documentation
├── .gitignore                  # Git Ignore Configuration
├── css/
│   └── style.css               # Clean Layout, Drawer, & AQL Console Styling
├── js/
│   ├── app.js                  # Application Orchestrator & State Manager
│   ├── canvas.js               # Interactive SVG/DOM Canvas Engine
│   ├── schema-model.js         # Core ADAPT Conceptual Model & Validation Rules
│   ├── templates.js            # Default Sample Schemas (sale)
│   ├── inspector.js            # Node & Edge Property Inspector
│   ├── image-exporter.js       # Diagram Exporter (PNG/SVG/JPEG/ISAB text)
│   ├── db-converters.js        # Star Relational Schema Generator
│   └── aql/
│       ├── aql-parser.js       # Lexer, Tokenizer, & AST Parser for AQL
│       ├── aql-checker.js      # Semantic Multidimensional Rules Checker
│       ├── aql-translator.js   # AQL-to-SQL Relational Translator
│       └── aql-console.js      # Resizable Bottom Drawer & UI Controller
├── schemas/
│   └── sale/                   # Clean Retail Sales Sample Schema
└── src/main/java/              # Java Backend for Star Schema Relational Conversion
```

---

## 🚀 5. Quick Start & Reproducibility

### Prerequisites
- Python 3.8+
- Java JDK 17 (optional, for standalone Java DDL generation)
- Any modern web browser (Chrome, Firefox, Edge, Safari)

### Running Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/deepika-claytablet/ATIL-Analysis-to-Implementation-Builder.git
   cd ATIL-Analysis-to-Implementation-Builder
   ```

2. Start the local server:
   ```bash
   python server.py
   ```

3. Open your browser at:
   ```text
   http://localhost:8080/index.html
   ```

4. **Testing AQL Queries**:
   - Click the **AQL** button in the top toolbar to open the resizable query drawer.
   - Select any sample query from the **`-- Load Sample AQL Query --`** dropdown (Projections, Aggregations with `GROUP BY / HAVING`, `UNION`, `INTERSECT`, `EXCEPT`, or `CREATE VIEW`).
   - Click **"Check AQL"** to run semantic verification.
   - Click **"Translate to SQL"** to generate the translated relational SQL query.
