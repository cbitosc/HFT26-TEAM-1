-- ====================================================================
-- VERITAS — Phase 2: Dedicated Passages Table & Search Configuration
-- Safe, Non-destructive, Idempotent DDL
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS passages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    project_id UUID REFERENCES research_workspaces(id) ON DELETE CASCADE,
    page_start INT NOT NULL,
    page_end INT NOT NULL,
    section_title TEXT,
    text TEXT NOT NULL,
    sequence_index INT NOT NULL,
    extraction_method TEXT NOT NULL DEFAULT 'text', -- 'text' | 'ocr' | 'ocr_unavailable'
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Retrieval Indexes
CREATE INDEX IF NOT EXISTS idx_passages_paper ON passages(paper_id);
CREATE INDEX IF NOT EXISTS idx_passages_project ON passages(project_id);
CREATE INDEX IF NOT EXISTS idx_passages_page ON passages(paper_id, page_start);
CREATE INDEX IF NOT EXISTS idx_passages_tsv ON passages USING GIN(tsv);

-- Row Level Security
ALTER TABLE passages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on passages') THEN
        CREATE POLICY "Allow public read on passages" ON passages FOR SELECT USING (true);
    END IF;
END $$;

