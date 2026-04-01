'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ExamSteps from '@/components/ExamSteps';
import GradingTable from '@/components/GradingTable';
import {
  getExam,
  getRegions,
  getGradingSummary,
  checkGrading,
  getAmbiguous,
} from '@/lib/api';
import { Exam, Region, GradingSummary, StudentAnswer } from '@/lib/types';

export default function GradingPage() {
  const params = useParams();
  const examId = params.id as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [summaries, setSummaries] = useState<GradingSummary[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<StudentAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [examData, regionsData, summaryData] = await Promise.all([
          getExam(examId),
          getRegions(examId),
          getGradingSummary(examId).catch(() => [] as GradingSummary[]),
        ]);
        setExam(examData);
        setRegions(regionsData);
        if (Array.isArray(summaryData)) {
          setSummaries(summaryData);
        } else {
          setSummaries((summaryData as any).questions || []);
        }
        if (regionsData.length > 0) {
          setSelectedRegionId(regionsData[0].id);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '불러오기 실패');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId]);

  useEffect(() => {
    if (!selectedRegionId) return;
    loadAnswersForRegion(selectedRegionId);
  }, [selectedRegionId]);

  async function loadAnswersForRegion(regionId: string) {
    try {
      const ambiguous = await getAmbiguous(examId);
      // For now, we display all ambiguous answers for the selected region
      // In a full implementation, we'd have a dedicated endpoint per region
      setAnswers(ambiguous.filter((a: StudentAnswer) => a.region_id === regionId));
    } catch {
      setAnswers([]);
    }
  }

  async function handleCheckGrading(regionId: string) {
    setCheckingId(regionId);
    setError(null);
    setSuccess(null);
    try {
      const result = await checkGrading(examId, regionId);
      const msg = (result as any).message || 
        `채점 완료: ${(result as any).total_processed || 0}명 처리, ${(result as any).ambiguous_count || 0}명 검토 필요`;
      setSuccess(msg);

      // Reload data
      const summaryData = await getGradingSummary(examId);
      setSummaries(Array.isArray(summaryData) ? summaryData : (summaryData as any).questions || []);
      if (selectedRegionId === regionId) {
        await loadAnswersForRegion(regionId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '채점 실패');
    } finally {
      setCheckingId(null);
    }
  }

  function handleAnswerUpdated(updated: StudentAnswer) {
    setAnswers((prev) =>
      prev.map((a) => (a.id === updated.id ? { ...updated, student_name: a.student_name, student_number: a.student_number } : a))
    );
  }

  const selectedRegion = regions.find((r) => r.id === selectedRegionId);

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
        <span className="text-gray-700">채점</span>
      </div>

      <ExamSteps examId={examId} currentStep={5} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">채점 대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">
          문항별로 채점 기준을 점검하고 모호한 답안을 검토하세요.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
      )}

      {regions.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-3">문항 영역이 없습니다.</p>
          <Link href={`/exams/${examId}/template`} className="btn-secondary">
            영역 설정으로 이동
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {regions.map((region) => {
              const summary = summaries.find((s) => s.region_id === region.id);
              const isSelected = selectedRegionId === region.id;
              const isChecking = checkingId === region.id;

              return (
                <div
                  key={region.id}
                  className={`card cursor-pointer transition-all ${
                    isSelected ? 'ring-2 ring-blue-500 border-blue-200' : 'hover:border-blue-100'
                  }`}
                  onClick={() => setSelectedRegionId(region.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900 text-sm">
                      {region.question_number}번
                    </span>
                    {summary && summary.ambiguous_count > 0 && (
                      <span className="badge bg-amber-100 text-amber-700">
                        {summary.ambiguous_count}
                      </span>
                    )}
                  </div>
                  {summary ? (
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p>채점: {summary.graded_count}/{summary.total_students}</p>
                      {summary.average_score !== null && (
                        <p>평균: {summary.average_score}점</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">미채점</p>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckGrading(region.id);
                    }}
                    disabled={isChecking}
                    className="mt-3 w-full btn-secondary text-xs py-1.5"
                  >
                    {isChecking ? (
                      <span className="flex items-center justify-center gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        점검 중...
                      </span>
                    ) : (
                      '채점 기준 점검'
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Detail table */}
          {selectedRegion && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">
                  문항 {selectedRegion.question_number} - 학생 답안
                </h2>
              </div>
              <GradingTable
                answers={answers}
                maxScore={selectedRegion.max_score}
                onAnswerUpdated={handleAnswerUpdated}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
