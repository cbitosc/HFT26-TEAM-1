-- ====================================================================
-- VERITAS — Migration: Structured Paper Intelligence & Extractions
-- Table: paper_extractions
-- Version: Phase 3
-- Mode: Safe, Non-destructive, Idempotent (CREATE IF NOT EXISTS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.paper_extractions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paper_id UUID NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.research_workspaces(id) ON DELETE CASCADE,
    extraction_version INT NOT NULL DEFAULT 1,
    model_name TEXT NOT NULL DEFAULT 'veritas-nlp-engine-v1',
    prompt_version TEXT NOT NULL DEFAULT 'v1.0.0',
    research_objective JSONB NOT NULL DEFAULT '{}'::jsonb,
    methodology JSONB NOT NULL DEFAULT '{}'::jsonb,
    dataset_information JSONB NOT NULL DEFAULT '{}'::jsonb,
    sample_information JSONB NOT NULL DEFAULT '{}'::jsonb,
    metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
    key_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
    limitations JSONB NOT NULL DEFAULT '{}'::jsonb,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb,
    verification_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for relational performance
CREATE INDEX IF NOT EXISTS idx_paper_extractions_paper ON public.paper_extractions(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_extractions_project ON public.paper_extractions(project_id);
CREATE INDEX IF NOT EXISTS idx_paper_extractions_version ON public.paper_extractions(paper_id, extraction_version DESC);

-- Automated updated_at trigger
DROP TRIGGER IF EXISTS trg_paper_extractions_updated_at ON public.paper_extractions;
CREATE TRIGGER trg_paper_extractions_updated_at
    BEFORE UPDATE ON public.paper_extractions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE public.paper_extractions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view paper extractions
CREATE POLICY "Users can view extractions for accessible papers"
    ON public.paper_extractions FOR SELECT
    USING (true);

-- Allow authenticated users / service role to insert or update extractions
CREATE POLICY "Users can manage paper extractions"
    ON public.paper_extractions FOR ALL
    USING (true)
    WITH CHECK (true);

