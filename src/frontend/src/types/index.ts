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
