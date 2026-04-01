'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ExamSteps from '@/components/ExamSteps';
import {
  getExam,
  getStudents,
  uploadStudent,
  deleteStudent,
  runOCR,
  getImageUrl,
} from '@/lib/api';
import { Exam, Student } from '@/lib/types';

export default function StudentsPage() {
  const params = useParams();
  const examId = params.id as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [runningOcr, setRunningOcr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Upload form state
  const [name, setName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [examData, studentsData] = await Promise.all([
          getExam(examId),
          getStudents(examId),
        ]);
        setExam(examData);
        setStudents(studentsData);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '불러오기 실패');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim() || !studentNumber.trim()) {
      setError('모든 필드를 입력해주세요.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const student = await uploadStudent(examId, file, name.trim(), studentNumber.trim());
      setStudents((prev) => [...prev, student]);
      setName('');
      setStudentNumber('');
      setFile(null);
      // Reset file input
      const input = document.getElementById('student-file') as HTMLInputElement;
      if (input) input.value = '';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(studentId: string) {
    if (!confirm('이 학생의 답안을 삭제하시겠습니까?')) return;
    try {
      await deleteStudent(examId, studentId);
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '삭제 실패');
    }
  }

  async function handleRunOcr() {
    setRunningOcr(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await runOCR(examId);
      setSuccess(result.message || 'OCR이 완료되었습니다.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OCR 실행 실패');
    } finally {
      setRunningOcr(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-blue-600">대시보드</Link>
        <span>/</span>
        <Link href={`/exams/${examId}`} className="hover:text-blue-600">{exam?.name}</Link>
        <span>/</span>
        <span className="text-gray-700">학생 답안</span>
      </div>

      <ExamSteps examId={examId} currentStep={4} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">학생 답안 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            학생별 답안지를 업로드하고 OCR을 실행하세요.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunOcr}
            disabled={runningOcr || students.length === 0}
            className="btn-primary inline-flex items-center gap-2"
          >
            {runningOcr ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                OCR 실행 중...
              </>
            ) : (
              'OCR 실행'
            )}
          </button>
          <Link
            href={`/exams/${examId}/grading`}
            className="btn-secondary inline-flex items-center gap-2"
          >
            다음: 채점
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
      )}

      {/* Upload form */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">학생 답안 업로드</h2>
        <form onSubmit={handleUpload} className="flex items-end gap-4">
          <div className="flex-1">
            <label className="label">학생 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              className="input"
              disabled={uploading}
            />
          </div>
          <div className="flex-1">
            <label className="label">학번</label>
            <input
              type="text"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              placeholder="20240001"
              className="input"
              disabled={uploading}
            />
          </div>
          <div className="flex-1">
            <label className="label">답안지 이미지</label>
            <input
              id="student-file"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="input text-sm"
              disabled={uploading}
            />
          </div>
          <button
            type="submit"
            disabled={uploading || !file || !name.trim() || !studentNumber.trim()}
            className="btn-primary whitespace-nowrap"
          >
            {uploading ? '업로드 중...' : '업로드'}
          </button>
        </form>
      </div>

      {/* Student list */}
      {students.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">등록된 학생이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((student) => (
            <div key={student.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{student.name}</h3>
                  <p className="text-sm text-gray-500">{student.student_number}</p>
                </div>
                <button
                  onClick={() => handleDelete(student.id)}
                  className="text-gray-400 hover:text-red-500 p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              {student.scan_image_path && (
                <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                  <img
                    src={getImageUrl(student.scan_image_path)}
                    alt={`${student.name} 답안지`}
                    className="w-full h-40 object-cover"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
