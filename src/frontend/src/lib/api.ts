import { 
  Project, 
  Paper, 
  UploadResult, 
  Passage, 
  ProcessingStatus, 
  ProjectProcessingStatus,
  PaperIntelligence,
  ProjectIntelligenceSummary,
  SummaryType,
  SummaryResponse,
  ProjectSummariesListResponse,
  ComparisonResponse,
  ProjectComparisonsListResponse,
  AtomicClaim,
  DecomposeClaimsRequest,
  OutputClaimsResponse,
  ClaimVerificationResult,
  VerifyClaimRequest,
  VerifyBatchRequest,
  VerifyBatchResponse,
  ProjectVerificationSummary,
  CitedEvidencePassage,
  ComparisonMatrixResponse,
  GenerateMatrixRequest,
  PassageContextResponse,
  PdfAccessResponse,
  NumericalAuditResult,
  OvergeneralizationAuditResult,
  ResearchGapItem,
  GenerateGapsRequest,
  ProjectGapsResponse,
  ProvenanceLedgerEntry,
  ProjectLedgerResponse,
  EvaluationRun,
  EvaluationRunSummary,
  EvaluationRunResponse,
  ListEvaluationRunsResponse,
  ProjectAuditDossier,
  AuthUser,
  AuthResponse
} from "../types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("veritas_auth_token") || sessionStorage.getItem("veritas_auth_token");
}

export function setAuthToken(token: string | null, remember: boolean = true) {
  if (typeof window === "undefined") return;
  if (!token) {
    localStorage.removeItem("veritas_auth_token");
    sessionStorage.removeItem("veritas_auth_token");
  } else if (remember) {
    localStorage.setItem("veritas_auth_token", token);
  } else {
    sessionStorage.setItem("veritas_auth_token", token);
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE_URL}/api/projects`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch projects: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProject(id: string): Promise<Project & { papers: Paper[] }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch project details: ${res.statusText}`);
  }
  return res.json();
}

export async function createProject(payload: {
  name: string;
  topic?: string;
  research_question?: string;
  description?: string;
}): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to create project");
  }
  return res.json();
}

export async function updateProject(
  id: string,
  payload: {
    name?: string;
    topic?: string;
    research_question?: string;
    description?: string;
  }
): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to update project");
  }
  return res.json();
}

export async function deleteProject(id: string): Promise<{ message: string; id: string }> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to delete project");
  }
  return res.json();
}

export async function fetchProjectPapers(projectId: string): Promise<Paper[]> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/papers`);
  if (!res.ok) {
    throw new Error(`Failed to fetch project papers: ${res.statusText}`);
  }
  const data = await res.json();
  return data.papers || [];
}

export async function uploadPapers(
  files: File[],
  projectId?: string
): Promise<UploadResult[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  if (projectId) {
    formData.append("project_id", projectId);
  }

  const res = await fetch(`${API_BASE_URL}/api/papers/upload`, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to upload papers");
  }
  return res.json();
}

export async function fetchPaper(paperId: string): Promise<Paper> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch paper details: ${res.statusText}`);
  }
  return res.json();
}

export async function deletePaper(paperId: string): Promise<{ message: string; id: string }> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to delete paper");
  }
  return res.json();
}

export async function fetchSignedUrl(paperId: string): Promise<{ signed_url: string; expires_in_seconds: number }> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/pdf-url`);
  if (!res.ok) {
    throw new Error(`Failed to fetch PDF URL: ${res.statusText}`);
  }
  return res.json();
}

// Phase 2: PDF Processing & Passages API
export async function triggerProcessPaper(paperId: string, forceRetry: boolean = false): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/process?force_retry=${forceRetry}`, {
    method: "POST"
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to trigger paper processing");
  }
  return res.json();
}

export async function fetchPaperProcessingStatus(paperId: string): Promise<ProcessingStatus> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/processing-status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch processing status: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPaperPassages(
  paperId: string,
  page?: number,
  limit: number = 50,
  offset: number = 0
): Promise<{ paper_id: string; total_passages: number; limit: number; offset: number; passages: Passage[] }> {
  const url = new URL(`${API_BASE_URL}/api/papers/${paperId}/passages`);
  if (page !== undefined) url.searchParams.append("page", page.toString());
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("offset", offset.toString());

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to fetch paper passages: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectProcessingStatus(projectId: string): Promise<ProjectProcessingStatus> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/processing-status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch project processing status: ${res.statusText}`);
  }
  return res.json();
}

// Phase 3: Paper Intelligence & Structured Extraction API
export async function fetchPaperIntelligence(paperId: string): Promise<PaperIntelligence> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/intelligence`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch paper intelligence: ${res.statusText}`);
  }
  return res.json();
}

export async function generatePaperIntelligence(paperId: string, forceRegenerate: boolean = false): Promise<PaperIntelligence> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/intelligence?force_regenerate=${forceRegenerate}`, {
    method: "POST"
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to generate paper intelligence: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectIntelligence(projectId: string): Promise<ProjectIntelligenceSummary> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/intelligence`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch project intelligence: ${res.statusText}`);
  }
  return res.json();
}

export async function generateProjectIntelligence(projectId: string): Promise<ProjectIntelligenceSummary> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/intelligence/generate`, {
    method: "POST"
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to generate project intelligence: ${res.statusText}`);
  }
  return res.json();
}

// Phase 4: Grounded Research Summaries API
export async function generateSummary(payload: {
  paper_id: string;
  project_id?: string;
  summary_type?: SummaryType;
  custom_focus?: string;
}): Promise<SummaryResponse> {
  const res = await fetch(`${API_BASE_URL}/api/summaries/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to generate summary: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSummary(summaryId: string): Promise<SummaryResponse> {
  const res = await fetch(`${API_BASE_URL}/api/summaries/${summaryId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch summary: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectSummaries(projectId: string): Promise<ProjectSummariesListResponse> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/summaries`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch project summaries: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteSummary(summaryId: string): Promise<{ message: string; id: string }> {
  const res = await fetch(`${API_BASE_URL}/api/summaries/${summaryId}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to delete summary: ${res.statusText}`);
  }
  return res.json();
}

// Phase 5: Cross-Paper Synthesis & Research Comparison API
export async function generateComparison(payload: {
  project_id: string;
  paper_ids: string[];
  research_question?: string;
}): Promise<ComparisonResponse> {
  const res = await fetch(`${API_BASE_URL}/api/comparisons/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to generate cross-paper comparison: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchComparison(comparisonId: string): Promise<ComparisonResponse> {
  const res = await fetch(`${API_BASE_URL}/api/comparisons/${comparisonId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch comparison: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectComparisons(projectId: string): Promise<ProjectComparisonsListResponse> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/comparisons`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch project comparisons: ${res.statusText}`);
  }
  return res.json();
}

// Phase 6: Atomic Claim Decomposition API
export async function decomposeClaims(payload: DecomposeClaimsRequest): Promise<OutputClaimsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/claims/decompose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to decompose claims: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchOutputClaims(outputId: string): Promise<OutputClaimsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/outputs/${outputId}/claims`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch claims for output: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchClaimById(claimId: string): Promise<AtomicClaim> {
  const res = await fetch(`${API_BASE_URL}/api/claims/${claimId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch claim details: ${res.statusText}`);
  }
  return res.json();
}

// Phase 7: Tri-State Verification & Evidence Retrieval API
export async function verifyClaim(payload: VerifyClaimRequest): Promise<ClaimVerificationResult> {
  const res = await fetch(`${API_BASE_URL}/api/claims/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Claim verification failed: ${res.statusText}`);
  }
  return res.json();
}

export async function verifyBatchClaims(payload: VerifyBatchRequest): Promise<VerifyBatchResponse> {
  const res = await fetch(`${API_BASE_URL}/api/claims/verify-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Batch verification failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchClaimVerification(claimId: string): Promise<ClaimVerificationResult> {
  const res = await fetch(`${API_BASE_URL}/api/claims/${claimId}/verification`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch claim verification: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchClaimEvidence(claimId: string): Promise<CitedEvidencePassage[]> {
  const res = await fetch(`${API_BASE_URL}/api/claims/${claimId}/evidence`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch claim evidence: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectVerificationSummary(projectId: string): Promise<ProjectVerificationSummary> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/verification-summary`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch project verification summary: ${res.statusText}`);
  }
  return res.json();
}

// Phase 8: Evidence Comparison Matrix & Context API
export async function generateMatrix(payload: GenerateMatrixRequest): Promise<ComparisonMatrixResponse> {
  const res = await fetch(`${API_BASE_URL}/api/matrices/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to generate comparison matrix: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchMatrix(matrixId: string): Promise<ComparisonMatrixResponse> {
  const res = await fetch(`${API_BASE_URL}/api/matrices/${matrixId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch comparison matrix: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectMatrices(projectId: string): Promise<ComparisonMatrixResponse[]> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/matrices`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch project matrices: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPassageContext(passageId: string): Promise<PassageContextResponse> {
  const res = await fetch(`${API_BASE_URL}/api/evidence/${passageId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch passage context: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPdfAccess(paperId: string, projectId?: string): Promise<PdfAccessResponse> {
  let url = `${API_BASE_URL}/api/papers/${paperId}/pdf-access`;
  if (projectId) {
    url += `?project_id=${encodeURIComponent(projectId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to get PDF access: ${res.statusText}`);
  }
  return res.json();
}

// =============================================================================
// PHASE 9: ADVANCED RESEARCH AUDIT API CLIENTS
// =============================================================================

export async function auditNumericalClaim(claimId: string, projectId: string): Promise<NumericalAuditResult> {
  const url = `${API_BASE_URL}/api/audit/numerical?claim_id=${encodeURIComponent(claimId)}&project_id=${encodeURIComponent(projectId)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to audit numerical claim: ${res.statusText}`);
  }
  return res.json();
}

export async function auditOvergeneralization(claimId: string, projectId: string): Promise<OvergeneralizationAuditResult> {
  const url = `${API_BASE_URL}/api/audit/overgeneralization?claim_id=${encodeURIComponent(claimId)}&project_id=${encodeURIComponent(projectId)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to audit overgeneralization: ${res.statusText}`);
  }
  return res.json();
}

export async function generateResearchGaps(payload: GenerateGapsRequest): Promise<ProjectGapsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/gaps/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to generate research gaps: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectGaps(projectId: string): Promise<ProjectGapsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/gaps`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch project gaps: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectLedger(projectId: string, limit: number = 50): Promise<ProjectLedgerResponse> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/ledger?limit=${limit}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch provenance ledger: ${res.statusText}`);
  }
  return res.json();
}

// =============================================================================
// PHASE 10: EVALUATION & REPORT EXPORT API CLIENTS
// =============================================================================

export async function runEvaluationBenchmark(
  file?: File,
  datasetName?: string,
  targetProjectId?: string,
  rawContent?: string
): Promise<EvaluationRunResponse> {
  if (file) {
    const formData = new FormData();
    formData.append("file", file);
    if (datasetName) formData.append("dataset_name", datasetName);
    if (targetProjectId) formData.append("target_project_id", targetProjectId);

    const res = await fetch(`${API_BASE_URL}/api/evaluation/run`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Benchmark run failed: ${res.statusText}`);
    }
    return res.json();
  }

  const res = await fetch(`${API_BASE_URL}/api/evaluation/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataset_name: datasetName || "Custom Benchmark",
      dataset_content: rawContent || "",
      target_project_id: targetProjectId
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Benchmark run failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchEvaluationRuns(): Promise<ListEvaluationRunsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/evaluation/runs`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch evaluation runs: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchEvaluationRun(runId: string): Promise<EvaluationRunResponse> {
  const res = await fetch(`${API_BASE_URL}/api/evaluation/runs/${runId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch evaluation run: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchBenchmarkTemplate(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/evaluation/template`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch benchmark template: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectAuditDossier(projectId: string): Promise<ProjectAuditDossier> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/export/dossier`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch project audit dossier: ${res.statusText}`);
  }
  return res.json();
}

export function getExportDownloadUrl(projectId: string, format: "pdf" | "json" | "csv" | "markdown"): string {
  return `${API_BASE_URL}/api/projects/${projectId}/export/${format}`;
}

// ============================================================================
// Phase 11: Authentication & User Workspace Scoping APIs
// ============================================================================

export async function signupApi(payload: {
  full_name: string;
  email: string;
  password: string;
  confirm_password?: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Sign up failed: ${res.statusText}`);
  }
  return res.json();
}

export async function loginApi(payload: {
  email: string;
  password: string;
  remember_me?: boolean;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Login failed: ${res.statusText}`);
  }
  return res.json();
}

export async function forgotPasswordApi(email: string): Promise<{ status: string; message: string; reset_token?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Password recovery request failed: ${res.statusText}`);
  }
  return res.json();
}

export async function resetPasswordApi(payload: {
  access_token: string;
  new_password: string;
}): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Password reset failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchCurrentUserApi(): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Session expired or invalid.");
  }
  return res.json();
}

export async function updateProfileApi(payload: {
  full_name?: string;
  institution?: string;
}): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to update profile: ${res.statusText}`);
  }
  return res.json();
}

export async function logoutApi(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: getAuthHeaders()
    });
  } finally {
    setAuthToken(null);
  }
}







