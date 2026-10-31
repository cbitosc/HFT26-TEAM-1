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

