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
  total_pages?: number;
  venue?: string | null;
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
  numerical_audit?: NumericalAuditResult | null;
  overgeneralization_audit?: OvergeneralizationAuditResult | null;
  warnings?: string[];
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

// Phase 8: Evidence Explorer & Comparison Matrix Types
export type CellStatus =
  | 'evidence_present'
  | 'evidence_conflicting'
  | 'evidence_unavailable'
  | 'not_reported';

export interface MatrixCell {
  paper_id: string;
  paper_title: string;
  content: string;
  passage_id?: string | null;
  page_number?: number | null;
  section_title?: string | null;
  exact_quote?: string | null;
  status: CellStatus;
  relationship?: string | null;
}

export interface MatrixRow {
  dimension: string;
  claim_label: string;
  cells: Record<string, MatrixCell>;
}

export interface ComparisonMatrixResponse {
  id: string;
  project_id: string;
  title: string;
  paper_ids: string[];
  paper_meta: Array<{
    id: string;
    title: string;
    authors?: string[];
    year?: number | null;
    venue?: string | null;
  }>;
  dimensions: string[];
  rows: MatrixRow[];
  total_cells: number;
  evidence_present_count: number;
  not_reported_count: number;
  created_at: string;
}

export interface GenerateMatrixRequest {
  project_id: string;
  paper_ids: string[];
  dimensions?: string[];
  title?: string;
}

export interface PassageContextResponse {
  passage_id: string;
  paper_id: string;
  paper_title: string;
  page_number: number;
  section_title: string;
  text: string;
  previous_context?: string | null;
  next_context?: string | null;
  bounding_box: Record<string, any>;
  sequence_index: number;
  created_at: string;
}

export interface PdfAccessResponse {
  paper_id: string;
  signed_url: string;
  expires_in_seconds: number;
  file_name: string;
  total_pages: number;
  file_size_bytes: number;
}

// =============================================================================
// PHASE 9: ADVANCED RESEARCH AUDIT TYPES
// =============================================================================

export type NumericalVerdict =
  | 'Numerically consistent'
  | 'Numerical discrepancy'
  | 'Context mismatch'
  | 'Insufficient numerical evidence';

export interface NumericalExpression {
  value: number;
  raw_str: string;
  unit?: string | null;
  metric?: string | null;
  dataset?: string | null;
  baseline_value?: number | null;
  direction?: string | null;
  is_percentage: boolean;
  is_percentage_points: boolean;
}

export interface NumericalAuditResult {
  claim_id: string;
  claim_text: string;
  verdict: NumericalVerdict;
  claimed_expression?: NumericalExpression | null;
  source_reported_expression?: NumericalExpression | null;
  calculation_explanation: string;
  relative_change_calc?: string | null;
  percentage_point_calc?: string | null;
  unit_match: boolean;
  metric_match: boolean;
  dataset_match: boolean;
  direction_match: boolean;
  passage_id?: string | null;
  exact_quote?: string | null;
}

export type OvergeneralizationType =
  | 'Dataset overreach (single benchmark generalized to all datasets)'
  | 'Sample size overreach (small sample generalized to large population)'
  | 'Correlation presented as definitive causation'
  | 'Conditional/synthetic finding presented as universal fact'
  | 'Benchmark metric proxy treated as real-world proof'
  | 'Narrow finding stated without author\'s explicit limitations'
  | 'Appropriately scoped (no overgeneralization detected)';

export interface OvergeneralizationAuditResult {
  claim_id: string;
  claim_text: string;
  is_overgeneralized: boolean;
  flagged_type: OvergeneralizationType;
  evidence_supported_scope: string;
  explanation: string;
  suggested_narrower_wording: string;
  requires_human_review: boolean;
  passage_id?: string | null;
  exact_quote?: string | null;
}

export type GapOriginType =
  | 'Author-identified future work'
  | 'VERITAS-synthesized research direction';

export interface ResearchGapItem {
  id: string;
  project_id: string;
  suggested_research_question: string;
  supporting_limitations: string[];
  source_paper_ids: string[];
  source_paper_titles: string[];
  source_passage_ids: string[];
  explanation: string;
  origin_type: GapOriginType;
  important_uncertainties: string[];
  feasibility_notes: string;
  created_at: string;
}

export interface GenerateGapsRequest {
  project_id: string;
  paper_ids?: string[];
  focus_area?: string;
}

export interface ProjectGapsResponse {
  project_id: string;
  total_gaps: number;
  author_identified_count: number;
  veritas_synthesized_count: number;
  gaps: ResearchGapItem[];
}

export type LedgerEventType =
  | 'PAPER_UPLOAD'
  | 'PAPER_PROCESSING'
  | 'INTELLIGENCE_EXTRACTION'
  | 'SUMMARY_GENERATION'
  | 'SYNTHESIS_GENERATION'
  | 'CLAIM_DECOMPOSITION'
  | 'EVIDENCE_RETRIEVAL'
  | 'CLAIM_VERIFICATION'
  | 'NUMERICAL_AUDIT'
  | 'OVERGENERALIZATION_AUDIT'
  | 'RESEARCH_GAP_GENERATION'
  | 'USER_REGENERATION';

export interface ProvenanceLedgerEntry {
  id: string;
  project_id: string;
  event_type: LedgerEventType;
  entity_id: string;
  title: string;
  description: string;
  actor: string;
  model_name?: string | null;
  prompt_version?: string | null;
  retrieval_version?: string | null;
  validation_outcome: string;
  metadata_json: Record<string, any>;
  created_at: string;
}

export interface ProjectLedgerResponse {
  project_id: string;
  total_events: number;
  events: ProvenanceLedgerEntry[];
}

// =============================================================================
// PHASE 10: EVALUATION & REPORT EXPORT TYPES
// =============================================================================

export type EvaluationExpectedVerdict = 'Supported' | 'Contradicted' | 'Unresolved';

export type FailureCategory =
  | 'Retrieval failure (evidence passage not in top-K)'
  | 'Missing evidence (source paper lacks necessary details)'
  | 'Incorrect entailment (false positive support)'
  | 'Incorrect contradiction (false positive contradiction)'
  | 'Context mismatch (conflicting metric or dataset)'
  | 'Numerical reasoning failure (calculation or scale error)'
  | 'Invalid source reference (hallucinated or invalid citation)'
  | 'Compound claim (multiple propositions mixed)'
  | 'Ambiguous claim (unresolvable without additional context)'
  | 'Provider or processing error';

export interface BenchmarkSample {
  sample_id: string;
  claim_text: string;
  expected_verdict: EvaluationExpectedVerdict;
  source_paper_title?: string | null;
  source_paper_id?: string | null;
  gold_evidence_quotes?: string[];
  domain?: string;
  metadata?: Record<string, any>;
}

export interface ClassMetrics {
  support: number;
  precision: number;
  recall: number;
  f1_score: number;
}

export interface EvaluationMetrics {
  total_samples: number;
  accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  weighted_precision: number;
  weighted_recall: number;
  weighted_f1: number;
  per_class_metrics: Record<string, ClassMetrics>;
  confusion_matrix: Record<string, Record<string, number>>;
  source_link_validity_rate: number;
  invalid_citation_rate: number;
  unresolved_rate: number;
  evidence_sufficiency_rate: number;
}

export interface EvaluationSampleResult {
  sample_id: string;
  claim_text: string;
  expected_verdict: string;
  predicted_verdict: string;
  is_correct: boolean;
  confidence_score: number;
  retrieved_passages_count: number;
  cited_evidence_count: number;
  has_valid_citation: boolean;
  failure_category?: FailureCategory | null;
  failure_explanation?: string | null;
  is_abstention: boolean;
  is_justified_abstention: boolean;
  retrieved_top_passages?: Array<{ passage_id: string; text: string }>;
}

export interface EvaluationRun {
  id: string;
  dataset_name: string;
  dataset_version: string;
  created_at: string;
  duration_seconds: number;
  model_name: string;
  prompt_version: string;
  retrieval_strategy: string;
  total_samples: number;
  metrics: EvaluationMetrics;
  sample_results: EvaluationSampleResult[];
  failure_summary: Record<string, number>;
  is_official_run: boolean;
  notes: string;
}

export interface EvaluationRunSummary {
  id: string;
  dataset_name: string;
  created_at: string;
  duration_seconds: number;
  total_samples: number;
  accuracy: number;
  macro_f1: number;
  weighted_f1: number;
  source_link_validity_rate: number;
  is_official_run: boolean;
}

export interface EvaluationRunResponse {
  run: EvaluationRun;
}

export interface ListEvaluationRunsResponse {
  total_runs: number;
  runs: EvaluationRunSummary[];
}

export interface ProjectAuditDossier {
  meta: {
    platform: string;
    report_version: string;
    generated_at: string;
    project_id: string;
    project_name: string;
    research_question: string;
    project_created_at: string;
  };
  statistics: {
    total_papers: number;
    total_claims: number;
    supported_claims: number;
    contradicted_claims: number;
    unresolved_claims: number;
    faithfulness_rate: number;
    total_gaps: number;
    total_ledger_events: number;
  };
  papers: Array<{
    id: string;
    title: string;
    authors: string[];
    publication_year?: number | null;
    venue: string;
    total_pages: number;
    abstract: string;
  }>;
  claims: Array<{
    claim_id: string;
    category: string;
    text: string;
    is_atomic: boolean;
    verdict: string;
    confidence_score: number;
    reasoning: string;
    cited_evidence: Array<{
      passage_id: string;
      paper_id: string;
      page_number: number;
      section_title: string;
      exact_quote: string;
      is_quote_valid: boolean;
      match_score: number;
      explanation: string;
    }>;
    limitations: string[];
    numerical_audit?: any;
    overgeneralization_audit?: any;
  }>;
  research_gaps: any[];
  provenance_ledger: any[];
}

// Phase 11: Authentication & User Workspace Scoping
export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  institution?: string | null;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
  message?: string | null;
}






