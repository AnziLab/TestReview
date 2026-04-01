export interface Exam {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface AnswerSheet {
  id: string;
  exam_id: string;
  image_path: string;
  created_at: string;
}

export interface Region {
  id: string;
  answer_sheet_id: string;
  question_number: string;
  x: number;
  y: number;
  width: number;
  height: number;
  model_answer: string | null;
  rubric: string | null;
  max_score: number;
  created_at: string;
}

export interface Student {
  id: string;
  exam_id: string;
  name: string;
  student_number: string;
  scan_image_path: string;
  created_at: string;
}

export interface StudentAnswer {
  id: string;
  student_id: string;
  region_id: string;
  ocr_text: string | null;
  score: number | null;
  is_ambiguous: boolean;
  ambiguity_reason: string | null;
  grading_status: string;
  grading_feedback: string | null;
  student_name?: string;
  student_number?: string;
}

export interface GradingSummary {
  region_id: string;
  question_number: string;
  total_students: number;
  graded_count: number;
  ambiguous_count: number;
  average_score: number | null;
}

export interface Settings {
  llm_provider: string;
  llm_api_key_masked: string;
  llm_model: string;
}

// For region drawing in the UI (before saving)
export interface DraftRegion {
  id: string; // temporary local id
  question_number: string;
  x: number;
  y: number;
  width: number;
  height: number;
  saved?: boolean;
}
