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

export type SummaryType = 'short' | 'detailed' | 'structured_academic';
export type StatementRelationship = 'direct_support' | 'cautious_inference' | 'unresolved';

export interface SummaryStatement {
  id: string;
  statement_text: string;
  source_paper_id: string;
  supporting_passage_id?: string | null;
  exact_quote?: string | null;
  page_number?: number | null;
  relationship: StatementRelationship;
  is_verified: boolean;
  match_score: number;
}

export interface SummarySection {
  heading: string;
  content: string;
  statements: SummaryStatement[];
}

export interface SummaryResponse {
  id: string;
  paper_id: string;
  project_id?: string | null;
  title: string;
  summary_type: SummaryType;
  content: string;
  sections: SummarySection[];
  statements: SummaryStatement[];
  model_name: string;
  prompt_version: string;
  source_references: Array<{
    statement_id: string;
    passage_id?: string;
    page_number?: number;
    exact_quote?: string;
    relationship?: string;
    is_verified?: boolean;
  }>;
  total_statements: number;
  verified_statements: number;
  faithfulness_rate: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummariesListResponse {
  project_id: string;
  total_summaries: number;
  summaries: SummaryResponse[];
}

export type DisagreementClassification =
  | 'DIRECT_CONTRADICTION'
  | 'CONTEXTUAL_DISAGREEMENT'
  | 'NON_COMPARABLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONSENSUS';

export interface PaperEvidence {
  paper_id: string;
  paper_title: string;
  passage_id?: string | null;
  exact_quote?: string | null;
  page_number?: number | null;
  claim_summary: string;
  is_verified: boolean;
  match_score: number;
}

export interface ComparisonDimensionItem {
  dimension_name: string;
  paper_values: Record<string, string>;
  evidence: PaperEvidence[];
  synthesis_notes: string;
}

export interface DisagreementItem {
  id: string;
  topic: string;
  classification: DisagreementClassification;
  description: string;
  paper_a_claim: PaperEvidence;
  paper_b_claim: PaperEvidence;
  contextual_factors: string[];
  explanation: string;
  uncertainty_notes?: string | null;
}

export interface ConsensusItem {
  id: string;
  topic: string;
  consensus_statement: string;
  supporting_papers: PaperEvidence[];
  strength: 'STRONG' | 'MODERATE' | 'PRELIMINARY';
}

export interface SideBySidePaperProfile {
  paper_id: string;
  title: string;
  authors: string[];
  year?: number | null;
  objective: string;
  methodology: string;
  models: string[];
  datasets: string[];
  metrics: string[];
  limitations: string[];
}

export interface ComparisonResponse {
  id: string;
  project_id: string;
  paper_ids: string[];
  topic: string;
  paper_profiles: SideBySidePaperProfile[];
  dimension_matrix: ComparisonDimensionItem[];
  disagreements: DisagreementItem[];
  consensus_points: ConsensusItem[];
  all_evidence: PaperEvidence[];
  total_citations: number;
  verified_citations: number;
  faithfulness_rate: number;
  model_name: string;
  prompt_version: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectComparisonsListResponse {
  project_id: string;
  total_comparisons: number;
  comparisons: ComparisonResponse[];
}

// Phase 6: Atomic Claim Decomposition Types
export type ClaimCategory =
  | 'numerical'
  | 'comparative'
  | 'methodological'
  | 'dataset'
  | 'result'
  | 'generalization'
  | 'limitation'
  | 'descriptive_factual'
  | 'mixed';

export type ClaimVerificationStatus =
  | 'UNVERIFIED'
  | 'SUPPORTED'
  | 'CONTRADICTED'
  | 'UNRESOLVED';

export interface AtomicClaim {
  id: string;
  output_id: string;
  project_id: string;
  source_paper_id?: string | null;
  original_text: string;
  normalized_text: string;
  paragraph_index: number;
  sentence_index: number;
  claim_index: number;
  original_position: {
    paragraph_index?: number;
    sentence_index?: number;
    claim_index?: number;
    start_char?: number;
    end_char?: number;
    [key: string]: any;
  };
  is_atomic: boolean;
  category: ClaimCategory;
  decomposition_notes: string;
  verification_status: ClaimVerificationStatus;
  confidence_score: number;
  created_at: string;
}

export interface SentenceDecomposition {
  sentence_index: number;
  original_sentence: string;
  start_char: number;
  end_char: number;
  claims: AtomicClaim[];
}

export interface ParagraphDecomposition {
  paragraph_index: number;
  original_paragraph: string;
  sentences: SentenceDecomposition[];
}

export interface DecomposeClaimsRequest {
  output_id: string;
  project_id: string;
  original_text?: string;
  paper_ids?: string[];
  force_regenerate?: boolean;
}

export interface OutputClaimsResponse {
  output_id: string;
  project_id: string;
  original_text: string;
  paragraphs: ParagraphDecomposition[];
  claims: AtomicClaim[];
  total_paragraphs: number;
  total_sentences: number;
  total_claims: number;
  atomic_claims_count: number;
  compound_claims_count: number;
  categories_breakdown: Record<string, number>;
  created_at: string;
}

// Phase 7: Tri-State Claim Verification & Hybrid Retrieval Types
export type EvidenceVerdict = 'Supported' | 'Contradicted' | 'Unresolved';

export type EvidenceStrength =
  | 'Direct evidence'
  | 'Partial evidence'
  | 'Conflicting evidence'
  | 'Insufficient evidence';

export interface CitedEvidencePassage {
  passage_id: string;
  paper_id: string;
  paper_title?: string | null;
  page_number: number;
  section_title: string;
  exact_quote: string;
  relationship: string;
  evidence_type: string;
  is_quote_valid: boolean;
  quote_match_score: number;
  semantic_entailment: boolean;
  explanation: string;
}

export interface ClaimVerificationResult {
  id: string;
  claim_id: string;
  project_id: string;
  claim_text: string;
  verdict: EvidenceVerdict;
  reasoning: string;
  evidence_strength: EvidenceStrength;
  cited_evidence: CitedEvidencePassage[];
  limitations: string[];
  retrieved_passages_count: number;
  numerical_check_passed?: boolean | null;
  validation_passed: boolean;
  downgraded: boolean;
  downgrade_reason?: string | null;
  model_name: string;
  prompt_version: string;
  retrieval_version: string;
  created_at: string;
}

export interface VerifyClaimRequest {
  claim_id: string;
  project_id: string;
  paper_ids?: string[];
  force_regenerate?: boolean;
}

export interface VerifyBatchRequest {
  claim_ids: string[];
  project_id: string;
  paper_ids?: string[];
}

export interface VerifyBatchResponse {
  total_claims: number;
  successful: number;
  failed: number;
  results: ClaimVerificationResult[];
}

export interface ProjectVerificationSummary {
  project_id: string;
  total_claims: number;
  verified_claims: number;
  supported_count: number;
  contradicted_count: number;
  unresolved_count: number;
  unverified_count: number;
  faithfulness_rate: number;
}


