export interface Project {
  id: string;
  user_id?: string | null;
  name: string;
  topic?: string | null;
  research_question?: string | null;
  description?: string | null;
  paper_count: number;
  created_at: string;
  updated_at: string;
}

export interface Paper {
  id: string;
  project_id?: string | null;
  title: string;
  original_filename: string;
  storage_path?: string;
  file_size?: number;
  mime_type: string;
  status: 'uploaded' | 'processing' | 'EMBEDDED' | 'failed' | string;
  page_count?: number;
  authors?: string[];
  publication_year?: number | null;
  abstract?: string | null;
  metadata_json?: {
    doi?: string;
    processing_duration_seconds?: number;
    has_scanned_pages?: boolean;
    processing_warnings?: string[];
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export interface UploadResult {
  paper_id: string;
  title: string;
  original_filename: string;
  file_hash: string;
  total_pages: number;
  total_chunks: number;
  processing_status: string;
  status: string;
  is_duplicate: boolean;
  message: string;
}

export interface Passage {
  id: string;
  paper_id: string;
  project_id?: string | null;
  page_start: number;
  page_end: number;
  section_title?: string | null;
  text: string;
  sequence_index: number;
  extraction_method: 'text' | 'ocr' | 'ocr_unavailable';
  created_at?: string;
}

export interface ProcessingStatus {
  paper_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress_pct: number;
  phase: string;
  total_pages: number;
  pages_processed: number;
  total_passages: number;
  duration_seconds?: number | null;
  extraction_method?: string | null;
  error?: string | null;
  is_scanned: boolean;
}

export interface ProjectProcessingStatus {
  project_id: string;
  total_papers: number;
  completed: number;
  processing: number;
  pending: number;
  failed: number;
  papers: ProcessingStatus[];
}

export interface EvidenceReference {
  id?: string;
  paper_id: string;
  passage_id: string;
  supporting_quote: string;
  page_number: number;
  extraction_category: 'OBJECTIVE' | 'METHODOLOGY' | 'DATASET' | 'METRIC' | 'KEY_FINDING' | 'LIMITATION' | 'GENERAL';
  is_verified: boolean;
  match_score: number;
  rejection_reason?: string | null;
}

export interface ResearchObjective {
  problem_statement: string;
  research_question: string;
  hypothesis?: string;
  evidence: EvidenceReference[];
}

export interface Methodology {
  research_design: string;
  experimental_approach: string;
  models_and_techniques: string[];
  baselines_and_comparisons: string[];
  procedural_details: string;
  evidence: EvidenceReference[];
}

export interface DatasetInformation {
  dataset_name: string;
  dataset_source?: string;
  sample_size?: string;
  population_or_domain: string;
  collection_conditions?: string;
  train_val_test_split?: string;
  evidence: EvidenceReference[];
}

export interface MetricItem {
  metric_name: string;
  reported_value: string;
  unit?: string | null;
  baseline_comparison?: string;
  experimental_condition?: string | null;
  evidence: EvidenceReference[];
}

export interface KeyFindingItem {
  finding: string;
  finding_type: 'quantitative' | 'qualitative';
  answers_research_question: boolean;
  evidence: EvidenceReference[];
}

export interface Limitations {
  author_reported_limitations: string[];
  methodological_limitations: string[];
  dataset_limitations: string[];
  generalizability_constraints: string[];
  future_work: string[];
  evidence: EvidenceReference[];
}

export interface AdditionalContext {
  abstract_summary: string;
  keywords: string[];
  domain: string;
  important_terminology: string[];
}

export interface VerificationSummary {
  total_cited: number;
  total_verified: number;
  total_rejected: number;
  faithfulness_rate: number;
}

export interface PaperIntelligence {
  id: string;
  paper_id: string;
  project_id?: string | null;
  extraction_version: number;
  model_name: string;
  prompt_version: string;
  research_objective: ResearchObjective;
  methodology: Methodology;
  dataset_information: DatasetInformation;
  metrics: MetricItem[];
  key_findings: KeyFindingItem[];
  limitations: Limitations;
  additional_context: AdditionalContext;
  evidence_references: EvidenceReference[];
  verification_summary: VerificationSummary;
  created_at: string;
  updated_at: string;
}

export interface ProjectIntelligenceSummary {
  project_id: string;
  total_papers: number;
  extracted_papers: number;
  papers: PaperIntelligence[];
}
