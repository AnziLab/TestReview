'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ExamSteps from '@/components/ExamSteps';
import RegionEditor from '@/components/RegionEditor';
import {
  getExam,
  getTemplate,
  uploadTemplate,
  detectRegions,
  getRegions,
  saveRegions,
  getImageUrl,
} from '@/lib/api';
import { Exam, AnswerSheet, Region, DraftRegion } from '@/lib/types';

export default function TemplatePage() {
  const params = useParams();
  const examId = params.id as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [template, setTemplate] = useState<AnswerSheet | null>(null);
  const [regions, setRegions] = useState<DraftRegion[]>([]);
  const [suggestedRegions, setSuggestedRegions] = useState<
    Array<{ x: number; y: number; width: number; height: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const examData = await getExam(examId);
        setExam(examData);

        try {
          const tmpl = await getTemplate(examId);
          setTemplate(tmpl);

          const savedRegions = await getRegions(examId);
          if (savedRegions.length > 0) {
            setRegions(
              savedRegions.map((r: Region) => ({
                id: r.id,
                question_number: r.question_number,
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                saved: true,
              }))
            );
          }
        } catch {
          // No template yet
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '불러오기 실패');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const tmpl = await uploadTemplate(examId, file);
      setTemplate(tmpl);
      setRegions([]);
      setSuggestedRegions([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
    }
  }

  async function handleDetect() {
    setDetecting(true);
    setError(null);
    try {
      const detected = await detectRegions(examId);
      setSuggestedRegions(detected);
      if (regions.length === 0 && detected.length > 0) {
        setRegions(
          detected.map((d, i) => ({
            id: `detected-${Date.now()}-${i}`,
            question_number: String(i + 1),
            x: d.x,
            y: d.y,
            width: d.width,
            height: d.height,
          }))
        );
      }
      setSuccess(`${detected.length}개 영역이 감지되었습니다.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '영역 감지 실패');
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave() {
    if (regions.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const payload = regions.map((r) => ({
        question_number: r.question_number,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      }));
      const saved = await saveRegions(examId, payload);
      setRegions(
        saved.map((r: Region) => ({
          id: r.id,
          question_number: r.question_number,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          saved: true,
        }))
      );
      setSuccess('영역이 저장되었습니다.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  const handleRegionsChange = useCallback((newRegions: DraftRegion[]) => {
    setRegions(newRegions);
  }, []);

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
        <span className="text-gray-700">답안지 템플릿 & 영역 설정</span>
      </div>

      <ExamSteps examId={examId} currentStep={template ? 2 : 1} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">답안지 템플릿 & 영역 설정</h1>
        <p className="text-sm text-gray-500 mt-1">
          빈 답안지를 업로드하고 각 문항 영역을 지정하세요.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Upload area */}
      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {uploading ? '업로드 중...' : template ? '템플릿 교체' : '답안지 업로드'}
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>

          {template && (
            <>
              <button
                onClick={handleDetect}
                disabled={detecting}
                className="btn-secondary inline-flex items-center gap-2"
              >
                {detecting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    감지 중...
                  </>
                ) : (
                  '자동 영역 감지'
                )}
              </button>

              <button
                onClick={handleSave}
                disabled={saving || regions.length === 0}
                className="btn-primary inline-flex items-center gap-2"
              >
                {saving ? '저장 중...' : '영역 저장'}
              </button>

              <Link
                href={`/exams/${examId}/rubric`}
                className="btn-secondary inline-flex items-center gap-2 ml-auto"
              >
                다음: 채점 기준
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Region editor */}
      {template && (
        <RegionEditor
          imageSrc={getImageUrl(template.image_path)}
          regions={regions}
          onRegionsChange={handleRegionsChange}
          suggestedRegions={suggestedRegions}
        />
      )}

      {!template && (
        <div className="card text-center py-16">
          <div className="text-gray-300 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-700">답안지를 업로드하세요</h2>
          <p className="text-sm text-gray-500 mt-2">
            빈 답안지 스캔본 이미지를 업로드하면<br />
            자동으로 영역을 감지하거나 직접 그릴 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
