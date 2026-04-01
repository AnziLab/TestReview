import {
  Exam,
  AnswerSheet,
  Region,
  Student,
  StudentAnswer,
  GradingSummary,
  Settings,
} from './types';

const BASE_URL = 'http://localhost:8000/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.detail || data.message || message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ---- Settings ----

export async function getSettings(): Promise<Settings> {
  const res = await fetch(`${BASE_URL}/settings`);
  return handleResponse<Settings>(res);
}

export async function updateSettings(payload: {
  llm_provider: string;
  llm_api_key: string;
  llm_model: string;
}): Promise<Settings> {
  const res = await fetch(`${BASE_URL}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<Settings>(res);
}

// ---- Exams ----

export async function getExams(): Promise<Exam[]> {
  const res = await fetch(`${BASE_URL}/exams`);
  return handleResponse<Exam[]>(res);
}

export async function getExam(id: string): Promise<Exam> {
  const res = await fetch(`${BASE_URL}/exams/${id}`);
  return handleResponse<Exam>(res);
}

export async function createExam(name: string): Promise<Exam> {
  const res = await fetch(`${BASE_URL}/exams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return handleResponse<Exam>(res);
}

export async function deleteExam(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
}

// ---- Template ----

export async function uploadTemplate(
  examId: string,
  file: File
): Promise<AnswerSheet> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE_URL}/exams/${examId}/template`, {
    method: 'POST',
    body: form,
  });
  return handleResponse<AnswerSheet>(res);
}

export async function getTemplate(examId: string): Promise<AnswerSheet> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/template`);
  return handleResponse<AnswerSheet>(res);
}

export async function detectRegions(
  examId: string
): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/detect-regions`, {
    method: 'POST',
  });
  return handleResponse<
    Array<{ x: number; y: number; width: number; height: number }>
  >(res);
}

// ---- Regions ----

export async function getRegions(examId: string): Promise<Region[]> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/regions`);
  return handleResponse<Region[]>(res);
}

export async function saveRegions(
  examId: string,
  regions: Array<{
    question_number: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>
): Promise<Region[]> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/regions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(regions),
  });
  return handleResponse<Region[]>(res);
}

export async function updateRegion(
  examId: string,
  regionId: string,
  payload: Partial<{
    question_number: string;
    x: number;
    y: number;
    width: number;
    height: number;
    model_answer: string;
    rubric: string;
    max_score: number;
  }>
): Promise<Region> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/regions/${regionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<Region>(res);
}

export async function deleteRegion(
  examId: string,
  regionId: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/regions/${regionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
}

// ---- Students ----

export async function getStudents(examId: string): Promise<Student[]> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/students`);
  return handleResponse<Student[]>(res);
}

export async function uploadStudent(
  examId: string,
  file: File,
  name: string,
  studentNumber: string
): Promise<Student> {
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  form.append('student_number', studentNumber);
  const res = await fetch(`${BASE_URL}/exams/${examId}/students`, {
    method: 'POST',
    body: form,
  });
  return handleResponse<Student>(res);
}

export async function deleteStudent(
  examId: string,
  studentId: string
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/exams/${examId}/students/${studentId}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
}

// ---- Grading ----

export async function runOCR(examId: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/ocr`, {
    method: 'POST',
  });
  return handleResponse<{ message: string }>(res);
}

export async function checkGrading(
  examId: string,
  regionId: string
): Promise<{ message: string }> {
  const res = await fetch(
    `${BASE_URL}/exams/${examId}/regions/${regionId}/check-grading`,
    { method: 'POST' }
  );
  return handleResponse<{ message: string }>(res);
}

export async function getGradingSummary(
  examId: string
): Promise<GradingSummary[]> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/grading-summary`);
  return handleResponse<GradingSummary[]>(res);
}

export async function getAmbiguous(examId: string): Promise<StudentAnswer[]> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/ambiguous`);
  return handleResponse<StudentAnswer[]>(res);
}

export async function updateStudentAnswer(
  answerId: string,
  payload: {
    score?: number | null;
    grading_status?: string;
    grading_feedback?: string | null;
  }
): Promise<StudentAnswer> {
  const res = await fetch(`${BASE_URL}/student-answers/${answerId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<StudentAnswer>(res);
}

export async function correctOcrText(
  answerId: string,
  correctedText: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/student-answers/${answerId}/correct-ocr`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ corrected_text: correctedText }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
}

export function getImageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `http://localhost:8000/${path.replace(/^\//, '')}`;
}
