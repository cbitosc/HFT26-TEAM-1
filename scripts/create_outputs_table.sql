-- ====================================================================
-- VERITAS — Migration: Saved Outputs & Grounded Summaries
-- Table: outputs
-- Version: Phase 4
-- Mode: Safe, Non-destructive, Idempotent (CREATE IF NOT EXISTS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.outputs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.research_workspaces(id) ON DELETE CASCADE,
    paper_id UUID REFERENCES public.papers(id) ON DELETE CASCADE,
    output_type TEXT NOT NULL DEFAULT 'SUMMARY_DETAILED'
        CHECK (output_type IN (
            'SUMMARY_SHORT', 'SUMMARY_DETAILED', 'SUMMARY_STRUCTURED_ACADEMIC',
            'SYNTHESIS_MATRIX', 'CLAIM_VERIFICATION_REPORT', 'AUDIT_EXPORT'
        )),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    statements JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_name TEXT NOT NULL DEFAULT 'veritas-grounded-summary-v1',
    prompt_version TEXT NOT NULL DEFAULT 'v1.0.0',
    source_references JSONB NOT NULL DEFAULT '[]'::jsonb,
    verification_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for fast relational queries
CREATE INDEX IF NOT EXISTS idx_outputs_project ON public.outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_outputs_paper ON public.outputs(paper_id);
CREATE INDEX IF NOT EXISTS idx_outputs_type ON public.outputs(output_type);

-- Automated updated_at trigger
DROP TRIGGER IF EXISTS trg_outputs_updated_at ON public.outputs;
CREATE TRIGGER trg_outputs_updated_at
    BEFORE UPDATE ON public.outputs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view outputs
CREATE POLICY "Users can view outputs for accessible projects"
    ON public.outputs FOR SELECT
    USING (true);

-- Allow authenticated users / service role to manage outputs
CREATE POLICY "Users can manage outputs"
    ON public.outputs FOR ALL
    USING (true)
    WITH CHECK (true);

