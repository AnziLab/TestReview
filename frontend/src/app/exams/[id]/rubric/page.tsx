'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ExamSteps from '@/components/ExamSteps';
import RubricForm from '@/components/RubricForm';
import { getExam, getRegions } from '@/lib/api';
import { Exam, Region } from '@/lib/types';

export default function RubricPage() {
  const params = useParams();
  const examId = params.id as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [examData, regionsData] = await Promise.all([
          getExam(examId),
          getRegions(examId),
        ]);
        setExam(examData);
        setRegions(regionsData);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '불러오기 실패');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId]);

  function handleRegionUpdated(updated: Region) {
    setRegions((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    );
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
        <span className="text-gray-700">채점 기준</span>
      </div>

      <ExamSteps examId={examId} currentStep={3} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">채점 기준 입력</h1>
          <p className="text-sm text-gray-500 mt-1">
            각 문항에 대한 모범 답안과 채점 기준을 입력하세요.
          </p>
        </div>
        <Link
          href={`/exams/${examId}/students`}
          className="btn-primary inline-flex items-center gap-2"
        >
          다음: 학생 답안
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {regions.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-3">문항 영역이 없습니다.</p>
          <Link href={`/exams/${examId}/template`} className="btn-secondary">
            영역 설정으로 이동
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {regions.map((region) => (
            <RubricForm
              key={region.id}
              examId={examId}
              region={region}
              onUpdated={handleRegionUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
