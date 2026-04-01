'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createExam } from '@/lib/api';

export default function NewExamPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('시험 이름을 입력해주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const exam = await createExam(name.trim());
      router.push(`/exams/${exam.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '시험 생성에 실패했습니다.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-blue-600 transition-colors">
          대시보드
        </Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-700">새 시험 만들기</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">새 시험 만들기</h1>
        <p className="text-sm text-gray-500 mt-1">
          시험 이름을 입력하고 시험을 생성하세요.
        </p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="exam-name" className="label">
              시험 이름 <span className="text-red-500">*</span>
            </label>
            <input
              id="exam-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2024년 1학기 중간고사"
              className="input"
              autoFocus
              disabled={loading}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              학생들이 식별할 수 있는 명확한 이름을 입력하세요.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Link href="/" className="btn-secondary flex-1 text-center">
              취소
            </Link>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  생성 중...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  시험 생성
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
