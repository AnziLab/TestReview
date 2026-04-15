export interface User {
  id: number
  username: string
  email: string
  full_name: string
  school?: string
  role: 'teacher' | 'admin'
  status: 'pending' | 'approved' | 'rejected'
  has_api_key: boolean
  grading_extra_instructions?: string | null
  clustering_extra_instructions?: string | null
}

export interface Exam {
  id: number
  title: string
  subject?: string
  grade?: number
  school_level?: 'elementary' | 'middle' | 'high'
  status: 'draft' | 'rubric_ready' | 'answers_uploaded' | 'rubric_refined' | 'graded'
  question_count?: number
  created_at: string
  updated_at: string
}

export interface Question {
  id: number
  exam_id: number
  number: string
  order_index: number
  question_text?: string
  max_score: number
  model_answer?: string
  rubric_json: RubricJson
  rubric_draft_json?: RubricJson
  rubric_version: number
}

export interface RubricJson {
  criteria: Array<{ id?: string; description: string; points: number }>
  notes: string
}

export interface Class {
  id: number
  exam_id: number
  name: string
  scan_mode: 'single' | 'double'
  ocr_status: 'pending' | 'processing' | 'done' | 'failed'
  ocr_error?: string
  student_count?: number
  source_pdf_filename?: string
}

export interface Student {
  id: number
  class_id: number
  student_number?: string
  name?: string
  needs_review: boolean
}

export interface Answer {
  id: number
  student_id: number
  question_id: number
  answer_text: string
}

export interface RefinementSession {
  id: number
  question_id: number
  status: 'running' | 'done' | 'failed'
  created_at: string
  completed_at?: string
  cluster_count?: number
  unjudgable_count?: number
}

export interface AnswerCluster {
  id: number
  session_id: number
  label: string
  representative_text: string
  size: number
  judgable: boolean
  suggested_score?: number
  reason?: string
}

export interface GradingResult {
  student_id: number
  student_number?: string
  name?: string
  scores: Record<number, number | null>
  class_id?: number
  class_name?: string
  total: number
}
