# ADAPT: Conceptual Schema Builder & AQL Query Engine

A visual modeling and multidimensional analysis tool for **ADAPT** conceptual schemas using **PAN** (Primary Access Node) and **ADAT** (Abstract Data Type) entities, complete with the **AQL (ADAPT Query Language)** parser, semantic checker, and relational SQL translator.

---

## 🌟 Key Features

### 1. Conceptual Schema Visual Modeling
- **ADAT (Abstract Data Type)**:
  - Supports **Structured** and **Unstructured** natures.
  - Attributes with **Numeric** and **Non Numeric** data kinds.
- **PAN (Primary Access Node)**:
  - Dimensional access points with `UPDATE` / `NO UPDATE` attribute semantics.
- **5 Relationship / Connection Line Types**:
  1. **ISAB (`──────` Solid Line)**: Connects ADAT $\leftrightarrow$ PAN with *Additivity* (`True`/`False`) and *Applicability* (`True`/`False`) properties.
  2. **Specialization (`───▷` UML Inheritance Triangle)**: Connects specialized entities to parent.
  3. **Derived (`───▷[D]` Triangle with "D")**: Disjoint / Derived hierarchies.
  4. **Container (`───▷[C]` Triangle with "C")**: Containment hierarchies.
  5. **Complex (`───◇` Aggregation Diamond)**: Complex aggregation hierarchies.

### 2. AQL (ADAPT Query Language) Engine
- **OQL-Based Dialect**: Write expressive multidimensional queries on conceptual schemas.
- **Semantic Checker**: Enforces analysis semantics:
  - **ADAT Reference Chains**: Validates atomic, leaf specialization, derived, complex, and container chains.
  - **PAN Reference Chains**: Verifies ISAB relationships, hierarchy branches, and container applicability.
  - **Aggregations (`SUM`, `AVG`, etc.)**: Ensures $\text{Additivity} = \text{TRUE}$ for summation and verifies participating PANs.
  - **GROUP BY Compliance**: Validates projection coverage against grouping expressions.
  - **Views**: Supports `CREATE VIEW <view_name> AS <valid AQL query>`.
- **Relational SQL Translator**: Converts verified AQL statements into relational SQL queries with dimension joins on surrogate keys.

### 3. Star Relational Conversion
- Converts conceptual schemas into relational star schemas (`output.sql`).
- Generates structured schema folders under `schemas/<schema_name>/`.

---

## 🚀 How to Run

1. Open PowerShell or terminal in the project directory:
   ```powershell
   cd conceptual-schema-builder
   python server.py
   ```
2. Open your web browser at **`http://localhost:8080/index.html`**.
3. Use the top toolbar to model schemas, save diagrams, convert to relational SQL, or launch the **AQL** console.
