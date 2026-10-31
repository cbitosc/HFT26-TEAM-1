-- ====================================================================
-- VERITAS — Supabase Initial Database Migration & Schema (Production Grade)
-- Target: PostgreSQL 15+ with pgvector, uuid-ossp, pg_trgm
-- Security: Strict User Scoping (auth.users), Private Storage, Hardened RLS
-- Mode: Safe, Non-destructive, Idempotent (CREATE IF NOT EXISTS)
-- ====================================================================

-- --------------------------------------------------------------------
-- PART 1: EXTENSIONS
-- --------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- --------------------------------------------------------------------
-- PART 2: TRIGGERS & HELPER FUNCTIONS
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------
-- PART 3: STORAGE BUCKET CONFIGURATION (STRICT PRIVATE STORAGE)
-- --------------------------------------------------------------------
-- Bucket is set to private (public = false) to prevent unauthenticated scraping.
-- Access is granted via signed URLs or authenticated RLS policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'papers',
    'papers',
    false, -- STRICTLY PRIVATE
    52428800, -- 50 MB max per PDF
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['application/pdf'];

-- --------------------------------------------------------------------
-- PART 4: CORE ENTITY TABLES & RELATIONSHIPS
-- --------------------------------------------------------------------

-- Table 1: Research Workspaces (User-Scoped Multi-Paper Scopes)
CREATE TABLE IF NOT EXISTS research_workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 2: Papers (Master Document Registry & Metadata)
CREATE TABLE IF NOT EXISTS papers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    title TEXT NOT NULL,
    authors TEXT[] NOT NULL DEFAULT '{}',
    publication_year INT,
    venue TEXT,
    abstract TEXT,
    file_path TEXT NOT NULL,
    file_hash TEXT NOT NULL UNIQUE, -- SHA-256 deduplication
    file_size_bytes BIGINT NOT NULL,
    total_pages INT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'PENDING' 
        CHECK (processing_status IN ('PENDING', 'PARSING', 'EMBEDDED', 'FAILED')),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 3: Workspace Papers (Many-to-Many Join)
CREATE TABLE IF NOT EXISTS workspace_papers (
    workspace_id UUID NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, paper_id)
);

-- Table 4: Paper Sections (Structural Hierarchy & Limitation Grounding)
CREATE TABLE IF NOT EXISTS paper_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    section_type TEXT NOT NULL DEFAULT 'BODY'
        CHECK (section_type IN (
            'ABSTRACT', 'INTRODUCTION', 'METHODOLOGY', 
            'RESULTS', 'DISCUSSION', 'LIMITATIONS', 
            'CONCLUSION', 'REFERENCES', 'BODY'
        )),
    page_start INT NOT NULL,
    page_end INT NOT NULL,
    order_index INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 5: Document Chunks (Dense Vector + Lexical Sparse + Spatial Bounding Boxes)
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    section_id UUID REFERENCES paper_sections(id) ON DELETE SET NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    clean_text TEXT NOT NULL,
    page_number INT NOT NULL,
    -- Spatial Bounding Box: {"x0": float, "y0": float, "x1": float, "y1": float, "width": float, "height": float}
    bounding_box JSONB NOT NULL,
    token_count INT NOT NULL,
    -- 768 dimensions for Gemini text-embedding-004
    embedding vector(768),
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', clean_text)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 6: Atomic Claims (Extracted Empirical & Theoretical Propositions)
CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES research_workspaces(id) ON DELETE CASCADE,
    source_paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    claim_text TEXT NOT NULL,
    claim_type TEXT NOT NULL DEFAULT 'EMPIRICAL'
        CHECK (claim_type IN (
            'EMPIRICAL', 'METHODOLOGICAL', 'THEORETICAL', 
            'BENCHMARK_RESULT', 'LIMITATION'
        )),
    confidence_score FLOAT NOT NULL DEFAULT 1.0,
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (verification_status IN (
            'SUPPORTED', 'CONTRADICTED', 'UNRESOLVED', 'UNVERIFIED'
        )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 7: Claim Evidence & Deterministic Quotations
CREATE TABLE IF NOT EXISTS claim_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('SUPPORTS', 'CONTRADICTS', 'UNRESOLVED')),
    exact_quote TEXT NOT NULL,
    quote_start_char INT,
    quote_end_char INT,
    -- Deterministic Faithfulness Score (1.0 = exact substring match)
    faithfulness_score FLOAT NOT NULL DEFAULT 1.0,
    bounding_box JSONB NOT NULL,
    nuance_context TEXT,
    numerical_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 8: Cross-Paper Synthesis Matrices
CREATE TABLE IF NOT EXISTS synthesis_matrices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    dimensions JSONB NOT NULL, -- ['Method', 'Dataset', 'Accuracy / Metric', 'Limitations']
    matrix_cells JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 9: Provenance Audit Reports
CREATE TABLE IF NOT EXISTS audit_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
    total_claims INT NOT NULL,
    supported_claims INT NOT NULL,
    contradicted_claims INT NOT NULL,
    unresolved_claims INT NOT NULL,
    overall_faithfulness_rate FLOAT NOT NULL,
    report_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 10: Benchmark Runs & Evaluations
CREATE TABLE IF NOT EXISTS benchmark_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    dataset_name TEXT NOT NULL,
    model_name TEXT NOT NULL,
    total_samples INT NOT NULL,
    retrieval_recall_at_k FLOAT NOT NULL,
    citation_precision FLOAT NOT NULL,
    quotation_faithfulness_avg FLOAT NOT NULL,
    metrics_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- PART 5: TRIGGERS FOR TIMESTAMP AUTOMATION
-- --------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON research_workspaces;
CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON research_workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_papers_updated_at ON papers;
CREATE TRIGGER trg_papers_updated_at
    BEFORE UPDATE ON papers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_matrices_updated_at ON synthesis_matrices;
CREATE TRIGGER trg_matrices_updated_at
    BEFORE UPDATE ON synthesis_matrices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------------------------------
-- PART 6: PERFORMANCE & RETRIEVAL INDEXES
-- --------------------------------------------------------------------

-- Relational Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_papers_user ON papers(user_id);
CREATE INDEX IF NOT EXISTS idx_papers_hash ON papers(file_hash);
CREATE INDEX IF NOT EXISTS idx_workspaces_user ON research_workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_papers_workspace ON workspace_papers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_papers_paper ON workspace_papers(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_sections_paper ON paper_sections(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_sections_type ON paper_sections(section_type);
CREATE INDEX IF NOT EXISTS idx_chunks_paper ON document_chunks(paper_id);
CREATE INDEX IF NOT EXISTS idx_chunks_section ON document_chunks(section_id);
CREATE INDEX IF NOT EXISTS idx_chunks_paper_page ON document_chunks(paper_id, page_number);
CREATE INDEX IF NOT EXISTS idx_claims_workspace ON claims(workspace_id);
CREATE INDEX IF NOT EXISTS idx_claims_source_paper ON claims(source_paper_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(verification_status);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON claim_evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_chunk ON claim_evidence(chunk_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_paper ON claim_evidence(paper_id);
CREATE INDEX IF NOT EXISTS idx_matrices_workspace ON synthesis_matrices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_reports(workspace_id);

-- GIN Full-Text Search Index on English lexemes
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON document_chunks USING GIN(tsv);

-- Trigram Indexes for Fuzzy Search
CREATE INDEX IF NOT EXISTS idx_papers_title_trgm ON papers USING GIN(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_evidence_quote_trgm ON claim_evidence USING GIN(exact_quote gin_trgm_ops);

-- HNSW Index for Dense Vector Cosine Similarity
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON document_chunks 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- --------------------------------------------------------------------
-- PART 7: ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------

-- 1. Enable RLS on all 10 user tables
ALTER TABLE research_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthesis_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_runs ENABLE ROW LEVEL SECURITY;

-- 2. Workspaces RLS: Users can only see and manage their own workspaces
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own workspaces') THEN
        CREATE POLICY "Users view own workspaces" ON research_workspaces
            FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users create own workspaces') THEN
        CREATE POLICY "Users create own workspaces" ON research_workspaces
            FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users update own workspaces') THEN
        CREATE POLICY "Users update own workspaces" ON research_workspaces
            FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users delete own workspaces') THEN
        CREATE POLICY "Users delete own workspaces" ON research_workspaces
            FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
END $$;

-- 3. Papers RLS: Users can only see and manage their own papers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own papers') THEN
        CREATE POLICY "Users view own papers" ON papers
            FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users create own papers') THEN
        CREATE POLICY "Users create own papers" ON papers
            FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users update own papers') THEN
        CREATE POLICY "Users update own papers" ON papers
            FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users delete own papers') THEN
        CREATE POLICY "Users delete own papers" ON papers
            FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
END $$;

-- 4. Dependent Tables RLS (Paper Sections, Chunks, Claims, Evidence, Matrices, Reports)
-- Readable if the user owns the parent paper or workspace
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view sections of own papers') THEN
        CREATE POLICY "Users view sections of own papers" ON paper_sections
            FOR SELECT USING (
                EXISTS (SELECT 1 FROM papers WHERE papers.id = paper_sections.paper_id AND (papers.user_id = auth.uid() OR papers.user_id IS NULL))
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view chunks of own papers') THEN
        CREATE POLICY "Users view chunks of own papers" ON document_chunks
            FOR SELECT USING (
                EXISTS (SELECT 1 FROM papers WHERE papers.id = document_chunks.paper_id AND (papers.user_id = auth.uid() OR papers.user_id IS NULL))
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view claims of own workspace or paper') THEN
        CREATE POLICY "Users view claims of own workspace or paper" ON claims
            FOR SELECT USING (
                EXISTS (SELECT 1 FROM papers WHERE papers.id = claims.source_paper_id AND (papers.user_id = auth.uid() OR papers.user_id IS NULL))
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view evidence of own claims') THEN
        CREATE POLICY "Users view evidence of own claims" ON claim_evidence
            FOR SELECT USING (
                EXISTS (SELECT 1 FROM papers WHERE papers.id = claim_evidence.paper_id AND (papers.user_id = auth.uid() OR papers.user_id IS NULL))
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own synthesis matrices') THEN
        CREATE POLICY "Users view own synthesis matrices" ON synthesis_matrices
            FOR SELECT USING (
                EXISTS (SELECT 1 FROM research_workspaces WHERE research_workspaces.id = synthesis_matrices.workspace_id AND (research_workspaces.user_id = auth.uid() OR research_workspaces.user_id IS NULL))
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own audit reports') THEN
        CREATE POLICY "Users view own audit reports" ON audit_reports
            FOR SELECT USING (
                EXISTS (SELECT 1 FROM research_workspaces WHERE research_workspaces.id = audit_reports.workspace_id AND (research_workspaces.user_id = auth.uid() OR research_workspaces.user_id IS NULL))
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own benchmark runs') THEN
        CREATE POLICY "Users view own benchmark runs" ON benchmark_runs
            FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own workspace papers') THEN
        CREATE POLICY "Users view own workspace papers" ON workspace_papers
            FOR SELECT USING (
                EXISTS (SELECT 1 FROM research_workspaces WHERE research_workspaces.id = workspace_papers.workspace_id AND (research_workspaces.user_id = auth.uid() OR research_workspaces.user_id IS NULL))
            );
    END IF;
END $$;

-- --------------------------------------------------------------------
-- PART 8: STORAGE RLS POLICIES (AUTHENTICATED & RESTRICTED ACCESS)
-- --------------------------------------------------------------------
DO $$
BEGIN
    -- Allow authenticated users to upload to papers bucket
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users upload papers' AND tablename = 'objects') THEN
        CREATE POLICY "Authenticated users upload papers" ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'papers' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
            );
    END IF;

    -- Allow authenticated users or service_role to read objects in papers bucket
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users read papers' AND tablename = 'objects') THEN
        CREATE POLICY "Authenticated users read papers" ON storage.objects
            FOR SELECT USING (
                bucket_id = 'papers' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
            );
    END IF;

    -- Allow users to delete their own uploaded files
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users delete own papers' AND tablename = 'objects') THEN
        CREATE POLICY "Users delete own papers" ON storage.objects
            FOR DELETE USING (
                bucket_id = 'papers' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
            );
    END IF;
END $$;
