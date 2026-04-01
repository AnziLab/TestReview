'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ExamSteps from '@/components/ExamSteps';
import {
  getExam,
  getStudents,
  uploadStudent,
  uploadStudentsBatch,
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
  const [batchUploading, setBatchUploading] = useState(false);
  const [runningOcr, setRunningOcr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Single upload form state
  const [name, setName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Batch upload state
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [pagesPerStudent, setPagesPerStudent] = useState<1 | 2>(1);
  const [batchDragOver, setBatchDragOver] = useState(false);

  // Inline edit state for student names/numbers after batch upload
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editStudentNumber, setEditStudentNumber] = useState('');

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

  async function handleBatchUpload() {
    if (batchFiles.length === 0) {
      setError('파일을 선택해주세요.');
      return;
    }
    setBatchUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await uploadStudentsBatch(examId, batchFiles, pagesPerStudent);
      const refreshed = await getStudents(examId);
      setStudents(refreshed);
      setBatchFiles([]);
      setSuccess(`학생 ${result.students_created}명의 답안이 업로드되었습니다.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '일괄 업로드 실패');
    } finally {
      setBatchUploading(false);
    }
  }

  function handleBatchFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setBatchDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) setBatchFiles(files);
  }

  function handleBatchFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) setBatchFiles(Array.from(files));
  }

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
            학생 답안지를 업로드하고 OCR을 실행하세요.
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

      {/* ── Batch Upload Section (Primary) ── */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-1">학생 답안지 일괄 업로드</h2>
        <p className="text-sm text-gray-500 mb-4">여러 이미지 또는 PDF를 한 번에 업로드합니다.</p>

        {/* Drag & drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setBatchDragOver(true); }}
          onDragLeave={() => setBatchDragOver(false)}
          onDrop={handleBatchFileDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-4 ${
            batchDragOver
              ? 'border-blue-400 bg-blue-50'
              : batchFiles.length > 0
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
          }`}
        >
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {batchFiles.length > 0 ? (
            <div>
              <p className="text-sm font-medium text-green-700">{batchFiles.length}개 파일 선택됨</p>
              <p className="text-xs text-gray-500 mt-1">
                {batchFiles.map((f) => f.name).join(', ')}
              </p>
              <button
                type="button"
                onClick={() => setBatchFiles([])}
                className="text-xs text-red-500 hover:text-red-700 mt-2"
              >
                초기화
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-1">파일을 여기에 드래그하거나</p>
              <label className="inline-block cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-medium">
                파일 선택
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  onChange={handleBatchFileChange}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-400 mt-2">이미지 여러 장 또는 PDF 파일</p>
            </>
          )}
        </div>

        {/* Pages per student */}
        <div className="mb-4">
          <label className="label">페이지 구성</label>
          <div className="flex gap-4">
            {[
              { value: 1, label: '단면 (1페이지/학생)' },
              { value: 2, label: '양면 (2페이지/학생)' },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pagesPerStudent"
                  value={opt.value}
                  checked={pagesPerStudent === opt.value}
                  onChange={() => setPagesPerStudent(opt.value as 1 | 2)}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleBatchUpload}
          disabled={batchUploading || batchFiles.length === 0}
          className="btn-primary inline-flex items-center gap-2"
        >
          {batchUploading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              업로드 중...
            </>
          ) : (
            '일괄 업로드'
          )}
        </button>
      </div>

      {/* ── Single Upload Section (Secondary) ── */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">개별 학생 업로드</h2>
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

      {/* ── Student list ── */}
      {students.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">등록된 학생이 없습니다.</p>
        </div>
      ) : (
        <div>
          <h2 className="font-semibold text-gray-900 mb-4">등록된 학생 ({students.length}명)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.map((student) => {
              const isEditing = editingStudentId === student.id;
              const pageCount = student.pages?.length ?? (student.scan_image_path ? 1 : 0);
              return (
                <div key={student.id} className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 mr-2">
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="input text-sm py-1"
                            placeholder="이름"
                          />
                          <input
                            type="text"
                            value={editStudentNumber}
                            onChange={(e) => setEditStudentNumber(e.target.value)}
                            className="input text-sm py-1"
                            placeholder="학번"
                          />
                          <div className="flex gap-2">
                            <button
                              className="text-xs text-blue-600 hover:text-blue-800"
                              onClick={() => setEditingStudentId(null)}
                            >
                              완료
                            </button>
                            <button
                              className="text-xs text-gray-500 hover:text-gray-700"
                              onClick={() => setEditingStudentId(null)}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-semibold text-gray-900">{student.name}</h3>
                          <p className="text-sm text-gray-500">{student.student_number}</p>
                          {pageCount > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5">{pageCount}페이지</p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingStudentId(student.id);
                            setEditName(student.name);
                            setEditStudentNumber(student.student_number);
                          }}
                          className="text-gray-400 hover:text-blue-500 p-1"
                          title="수정"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(student.id)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Show pages or single scan image */}
                  {student.pages && student.pages.length > 0 ? (
                    <div className="flex gap-1 overflow-x-auto">
                      {student.pages.map((page) => (
                        <div key={page.id} className="flex-shrink-0 rounded overflow-hidden border border-gray-200">
                          <img
                            src={getImageUrl(page.image_path)}
                            alt={`${student.name} ${page.page_number}페이지`}
                            className="w-20 h-28 object-cover"
                          />
                          <p className="text-center text-xs text-gray-400 py-0.5">{page.page_number}p</p>
                        </div>
                      ))}
                    </div>
                  ) : student.scan_image_path ? (
                    <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                      <img
                        src={getImageUrl(student.scan_image_path)}
                        alt={`${student.name} 답안지`}
                        className="w-full h-40 object-cover"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
