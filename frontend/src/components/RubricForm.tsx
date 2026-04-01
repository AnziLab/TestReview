'use client';

import { useState } from 'react';
import { Region } from '@/lib/types';
import { updateRegion } from '@/lib/api';

interface RubricFormProps {
  examId: string;
  region: Region;
  onUpdated: (region: Region) => void;
}

export default function RubricForm({ examId, region, onUpdated }: RubricFormProps) {
  const [modelAnswer, setModelAnswer] = useState(region.model_answer || '');
  const [rubric, setRubric] = useState(region.rubric || '');
  const [maxScore, setMaxScore] = useState(region.max_score);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateRegion(examId, region.id, {
        model_answer: modelAnswer,
        rubric: rubric,
        max_score: maxScore,
      });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          문항 {region.question_number}
        </h3>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              저장됨
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm px-3 py-1.5"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="label">모범 답안</label>
          <textarea
            value={modelAnswer}
            onChange={(e) => setModelAnswer(e.target.value)}
            className="input min-h-[80px] resize-y"
            placeholder="정답 내용을 입력하세요"
          />
        </div>

        <div>
          <label className="label">채점 기준 (루브릭)</label>
          <textarea
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
            className="input min-h-[100px] resize-y"
            placeholder="채점 기준을 상세히 입력하세요. 예:&#10;- 핵심 키워드 포함 시 3점&#10;- 논리적 설명 포함 시 2점&#10;- 부분 정답 시 감점 기준"
          />
        </div>

        <div>
          <label className="label">배점</label>
          <input
            type="number"
            value={maxScore}
            onChange={(e) => setMaxScore(Number(e.target.value))}
            className="input w-32"
            min={0}
            step={0.5}
          />
        </div>
      </div>
    </div>
  );
}
