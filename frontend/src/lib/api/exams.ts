import { apiFetch } from './client'
import type { Exam, Question, RubricJson, Class, Student, Answer, RefinementSession, AnswerCluster, GradingResult } from '../types'

export const examsApi = {
  list: () => apiFetch<Exam[]>('/exams'),

  get: (id: number) => apiFetch<Exam>(`/exams/${id}`),

  create: (data: { title: string; subject?: string; grade?: number; school_level?: string }) =>
    apiFetch<Exam>('/exams', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: Partial<Exam>) =>
    apiFetch<Exam>(`/exams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    apiFetch<void>(`/exams/${id}`, { method: 'DELETE' }),

  uploadRubricFile: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiFetch<{ task_id: string }>(`/exams/${id}/rubric-file`, {
      method: 'POST',
      body: form,
      skipContentType: true,
    })
  },

  getExtractionStatus: (id: number) =>
    apiFetch<{ status: 'pending' | 'processing' | 'done' | 'failed'; questions?: Question[] }>(`/exams/${id}/rubric-extraction`),

  grade: (id: number) =>
    apiFetch<{ task_id: string }>(`/exams/${id}/grade`, { method: 'POST' }),

  getGradingResults: (id: number) =>
    apiFetch<GradingResult[]>(`/exams/${id}/gradings`),

  downloadGradingExcel: (id: number) =>
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/exams/${id}/gradings.xlsx`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
      },
      credentials: 'include',
    }),
}

export const questionsApi = {
  list: (examId: number) => apiFetch<Question[]>(`/exams/${examId}/questions`),

  get: (id: number) => apiFetch<Question>(`/questions/${id}`),

  update: (id: number, data: Partial<Question>) =>
    apiFetch<Question>(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  saveRubricDraft: (id: number, rubric: RubricJson) =>
    apiFetch<Question>(`/questions/${id}/rubric-draft`, {
      method: 'PUT',
      body: JSON.stringify({ rubric_draft_json: rubric }),
    }),

  commitRubricDraft: (id: number) =>
    apiFetch<Question>(`/questions/${id}/rubric-draft/commit`, { method: 'POST' }),

  refine: (id: number) =>
    apiFetch<RefinementSession>(`/questions/${id}/refine`, { method: 'POST' }),

  getRefinementSessions: (id: number) =>
    apiFetch<RefinementSession[]>(`/questions/${id}/refinement-sessions`),

  getSession: (sessionId: number) =>
    apiFetch<RefinementSession>(`/refinement-sessions/${sessionId}`),

  getClusters: (sessionId: number) =>
    apiFetch<AnswerCluster[]>(`/refinement-sessions/${sessionId}/clusters`),
}

export const classesApi = {
  list: (examId: number) => apiFetch<Class[]>(`/exams/${examId}/classes`),

  get: (id: number) => apiFetch<Class>(`/classes/${id}`),

  create: (examId: number, data: { name: string; scan_mode: 'single' | 'double' }, file: File) => {
    const form = new FormData()
    form.append('name', data.name)
    form.append('scan_mode', data.scan_mode)
    form.append('file', file)
    return apiFetch<Class>(`/exams/${examId}/classes`, {
      method: 'POST',
      body: form,
      skipContentType: true,
    })
  },

  getOcrStatus: (id: number) =>
    apiFetch<{ ocr_status: Class['ocr_status']; students_count?: number; error?: string }>(`/classes/${id}/ocr-status`),

  getStudents: (id: number) => apiFetch<Student[]>(`/classes/${id}/students`),
}

export const studentsApi = {
  update: (id: number, data: { student_number?: string; name?: string }) =>
    apiFetch<Student>(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getAnswers: (id: number) => apiFetch<Answer[]>(`/students/${id}/answers`),
}

export const meApi = {
  getApiKey: () => apiFetch<{ has_api_key: boolean; masked_key?: string }>('/me/api-key'),

  setApiKey: (api_key: string) =>
    apiFetch<{ success: boolean }>('/me/api-key', {
      method: 'PUT',
      body: JSON.stringify({ api_key }),
    }),

  deleteApiKey: () => apiFetch<void>('/me/api-key', { method: 'DELETE' }),

  testApiKey: () =>
    apiFetch<{ success: boolean; message?: string }>('/me/api-key/test', { method: 'POST' }),

  updateProfile: (data: { full_name?: string; email?: string; school?: string }) =>
    apiFetch<{ success: boolean }>('/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  changePassword: (data: { current_password: string; new_password: string }) =>
    apiFetch<{ success: boolean }>('/me/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}

export const adminApi = {
  getUsers: (status?: string) =>
    apiFetch<import('../types').User[]>(`/admin/users${status ? `?status=${status}` : ''}`),

  approveUser: (id: number) =>
    apiFetch<{ success: boolean }>(`/admin/users/${id}/approve`, { method: 'POST' }),

  rejectUser: (id: number) =>
    apiFetch<{ success: boolean }>(`/admin/users/${id}/reject`, { method: 'POST' }),
}
