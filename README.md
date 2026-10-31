# 🔬 VERITAS
### Evidence-First Scientific Research Assistant for Verifiable Summaries & Cross-Paper Synthesis

> **"Every claim has evidence. Every disagreement has context. Every uncertainty is visible."**  
> *Built for CBIT Hacktoberfest '26 — Team OrbitX (`HFT26-TEAM-1`)*

---

## 📋 Hackathon Team Information

| Attribute | Details |
| :--- | :--- |
| **Product Name** | **VERITAS** |
| **Team Name** | **OrbitX** |
| **Team ID** | `TEAM-1` (`HFT26-TEAM-1`) |
| **Registration ID** | `HFEST26-2BTGENDH` |
| **Track** | AI / ML Research & Scientific Integrity |
| **Institution** | CBIT & KMIT Hyderabad |
| **Development Branch**| `veritas-development` |

---

## 🎯 Problem Statement & Product Vision

Generic PDF chat interfaces and LLM summarizers suffer from three fatal flaws when applied to scientific literature:
1. **Unverifiable Hallucinations:** Large models fabricate synthetic citations, misattribute results, and invent benchmark figures with plausible-sounding confidence.
2. **Loss of Structural Provenance:** Summaries merge multiple distinct findings into broad generalities without tracking the physical page numbers or verbatim quotations.
3. **Absence of Contextual Disagreement & Uncertainty:** Conventional AI ignores scientific nuances, failing to distinguish between consensus findings, methodological conflicts, author-reported limitations, and genuine uncertainty.

**VERITAS** is not a generic PDF chatbot. It is a **deterministic, evidence-first research auditing platform** that decomposes scientific literature into atomic factual propositions, retrieves verbatim source passages using hybrid Reciprocal Rank Fusion (BM25 + Dense Semantic Embeddings), validates claims into tri-state verdicts (**Supported**, **Contradicted**, or **Unresolved**), detects numerical and scope overreach, synthesizes grounded research gaps, and exports tamper-proof scientific audit dossiers.

---

## 🏗️ System Architecture

VERITAS is architected around strict separation of concerns, deterministic evidence safety barriers, and dual-layer persistence:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VERITAS FRONTEND (Next.js 14)                   │
│  Dashboard • Evidence Explorer • Matrix • Gap Explorer • Benchmarks   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ REST APIs (JSON / Multipart / Binary)
┌────────────────────────────────────▼───────────────────────────────────┐
│                        FASTAPI BACKEND RUNTIME                         │
│                                                                        │
│  1. Ingestion Pipeline        2. Structured Intelligence               │
│     PyMuPDF + Tesseract OCR      6-Dimension academic extraction       │
│                                                                        │
│  3. Claim Decomposition       4. Hybrid Evidence Retrieval             │
│     Atomic proposition parser    Lexical BM25 + Vector RRF (k=60)     │
│                                                                        │
│  5. Verification Engine       6. Advanced Research Audits              │
│     Tri-state verdict logic      Decimal Numerical Truth Detector      │
│     Verbatim quote validator     Scope & Overgeneralization Detector   │
│                                                                        │
│  7. Research Gap Synthesis    8. Audit Export & Benchmark Harness      │
│     Author limitation links      PDF, JSON, CSV, Markdown generation  │
│     Uncertainty discovery        Evaluation runner & Confusion Matrix │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Dual Persistence
                   ┌─────────────────┴─────────────────┐
                   ▼                                   ▼
          Supabase PostgreSQL                  Local Fallback Cache
      (Papers, Passages, Claims,            (Resilient JSON storage
       Audit Reports, Matrices)              for offline/isolated runs)
```

---

## ✨ Key Capabilities & Implemented Phases

| Phase | Milestone | Capabilities |
| :--- | :--- | :--- |
| **Phase 1** | Project & Multi-PDF Ingestion | Project workspace creation, drag-and-drop multi-file PDF upload, SHA-256 deduplication, file validation. |
| **Phase 2** | Text Extraction & Passages | Page-aware extraction via PyMuPDF, OCR fallback for scanned pages, passage chunking with bounding boxes. |
| **Phase 3** | Paper Intelligence | 6-dimension academic extraction: Research Objectives, Methodologies, Datasets, Metrics, Findings, Limitations. |
| **Phase 4** | Evidence-Grounded Summaries | Short, detailed, and critical summaries strictly grounded in paper passages; citation alignment check. |
| **Phase 5** | Cross-Paper Synthesis | Multi-paper comparison matrix, consensus extraction, methodological disagreements, and trade-off analysis. |
| **Phase 6** | Atomic Claim Decomposition | Decomposes compound prose into atomic verifiable propositions while preserving sentence and paragraph offsets. |
| **Phase 7** | Hybrid Retrieval & Verification | BM25 lexical + dense semantic similarity fused via Reciprocal Rank Fusion ($k=60$); Tri-State verdicts (**Supported**, **Contradicted**, **Unresolved**). |
| **Phase 8** | Visual Evidence Explorer | Split-screen interface with interactive PDF viewer, page navigation, passage highlighting, and 2D comparison matrix. |
| **Phase 9** | Advanced Research Audits | **Numerical Truth Detector** (Decimal arithmetic, percentage points vs relative change), **Overgeneralization Detector** (scope taxonomy & narrower wording), **Research Gap Explorer** (grounded in author limitations), **Provenance Ledger** (immutable audit timeline). |
| **Phase 10** | Evaluation & Audit Export | Benchmark evaluation harness (Accuracy, Macro/Weighted F1, 3x3 Confusion Matrix, failure diagnostics), Multi-format Report Export (**PDF**, **JSON**, **CSV**, **Markdown**). |

---

## 🚀 Quickstart & Setup Guide

### 1. Prerequisites
- **Python:** 3.10 to 3.14
- **Node.js:** v18.0.0 or higher (`npm` / `npx`)
- **Git**

### 2. Clone the Repository
```bash
git clone https://github.com/ritvikchandrapeddi-lang/HFT26-TEAM-1.git
cd HFT26-TEAM-1
git checkout veritas-development
```

### 3. Backend Setup (FastAPI)
```bash
# Navigate to backend directory
cd src/backend

# Create virtual environment (recommended)
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables (create .env from .env.example)
cp .env.example .env
```

#### Environment Variables (`src/backend/.env`)
```ini
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-key
BACKEND_PORT=8000
ENVIRONMENT=development
```

Start the backend server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be live at: `http://localhost:8000/docs`

---

### 4. Frontend Setup (Next.js 14)
```bash
# Open a new terminal and navigate to frontend
cd src/frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local

# Run development server
npm run dev
```
Open `http://localhost:3000` in your browser.

To verify a production build:
```bash
npm run build
npm start
```

---

## 🧪 Automated Test Suites

VERITAS includes full unit and integration test coverage across all pipeline stages:

```bash
# Run Phase 9: Advanced Research Audits (Numerical Truth, Overgeneralization, Gaps, Ledger)
python tests/backend/test_phase9_audits.py

# Run Phase 10: Evaluation Harness & Report Export
python tests/backend/test_phase10_evaluation_and_export.py

# Run Full Test Discovery
python -m unittest discover -s tests/backend -p "test_*.py"
```

---

## 📊 Scientific Benchmark Evaluation Suite

VERITAS includes a dedicated benchmarking harness designed to evaluate against scientific fact-checking datasets (e.g., SciFact, FEVER, or custom organizer benchmarks).

### Evaluation Metrics Reported:
- **Accuracy:** Overall verdict accuracy across all samples.
- **Macro F1:** Unweighted class-averaged F1 score.
- **Weighted F1:** Support-weighted F1 score adjusting for class imbalance.
- **Per-Class Metrics:** Individual Precision, Recall, and F1 for `Supported`, `Contradicted`, and `Unresolved`.
- **3×3 Confusion Matrix:** Diagonal true-positive intensity and off-diagonal error distribution.
- **Source Link Validity Rate:** Percentage of cited passages whose quotations are verbatim aligned.
- **Abstention Rate:** Proportion of claims legitimately flagged as `Unresolved` due to absent evidence.

### Running a Benchmark:
1. Navigate to **Evaluation & Benchmarks** in the sidebar.
2. Click **Benchmark Schema Template** to view or copy the expected JSON/JSONL format.
3. Upload any benchmark dataset (`.json` or `.jsonl`) and click **Execute Evaluation Run**.
4. Inspect confusion matrices, per-class metrics, and failure diagnostics (classified into 10 error categories).
5. Click **Download JSON** to export the evaluation scorecard.

---

## 📑 Research Audit Report Exports

Researchers can generate complete, downloadable academic dossiers in four formats via the **Export & Audit Reports** tab:

1. **Academic PDF Report (`.pdf`):** Multi-page formatted document with title page, executive summary, methodology comparison, claim verification table with color-coded verdicts, and provenance audit trail.
2. **Machine-Readable JSON (`.json`):** Full audit payload adhering to Supabase native `audit_reports` JSONB schema.
3. **Tabular CSV Table (`.csv`):** Excel/Pandas-compatible spreadsheet of every decomposed proposition, verdict, confidence score, exact quote, page number, numerical audit, and scope recommendation.
4. **Academic Markdown (`.md`):** Publication-ready report for academic repositories, documentation, or LaTeX pipelines.

---

## 🎬 Recommended 11-Stage Demonstration Workflow

Follow these steps for a complete live demonstration of VERITAS:

1. **Create Project:** Open Dashboard, click "New Project", enter project name and research question (e.g., *"Residual learning and self-attention scalability in deep vision models"*).
2. **Upload Papers:** Upload two or more academic PDFs in the "Upload Papers" view.
3. **Inspect Processing:** Confirm PDF validation, page-level passage chunking, and metadata extraction.
4. **Paper Intelligence:** Open "Paper Intelligence" to inspect extracted Objectives, Methodologies, Datasets, and author-stated Limitations.
5. **Research Summary:** Generate a grounded summary; click cited page references to preview source passages.
6. **Cross-Paper Synthesis:** Navigate to "Cross-Paper Synthesis", select two papers, and view consensus points, dimension matrices, and disagreements.
7. **Decompose Claims:** Under "Claim Verification", click "Decompose Prose into Atomic Claims" to see compound sentences split into atomic propositions.
8. **Verify Claims:** Click "Verify Selected" to run hybrid BM25 + Vector RRF retrieval. Observe **Supported**, **Contradicted**, and **Unresolved** verdicts.
9. **Evidence Explorer:** Click any proposition to open the split-screen Evidence Explorer, navigating directly to the physical PDF page with the highlighted passage.
10. **Advanced Audits & Gaps:**
    - Open "Numerical Truth Detector" to inspect Decimal-precision validation of metrics and percentage points vs relative changes.
    - Inspect "Research Gap Explorer" to view open research questions strictly grounded in author limitations.
    - Inspect "Provenance Ledger" for the complete cryptographic timeline.
11. **Evaluation & Export:**
    - Open "Evaluation & Benchmarks" to inspect the benchmark runner.
    - Open "Export & Audit Reports" and download the complete **Academic PDF Dossier** and **CSV Claims Table**.

---

## 🔒 Security & Research Integrity Guarantees

- **No Fabricated Evidence:** VERITAS never invents quotes or hallucinates numbers.
- **Verbatim Citation Requirement:** Quotes without direct substring or fuzzy alignment ($\ge 0.85$) are automatically rejected or downgraded to `Unresolved`.
- **Absence of Evidence $\neq$ Contradiction:** When source papers lack necessary facts, the verifier abstains with `Unresolved` rather than guessing.
- **Tenant Isolation:** Benchmark evaluations and cross-paper retrievals are strictly bounded to the active project workspace.
- **Credential Protection:** Secrets and service-role keys are strictly server-side and never exposed in client bundles.

---

## 📜 License & Acknowledgments

Developed by **Team OrbitX** for **CBIT Hacktoberfest '26**.  
Open-source under the [MIT License](LICENSE).
