'use client';

import { useState } from 'react';
import { StudentAnswer } from '@/lib/types';
import { updateStudentAnswer, correctOcrText } from '@/lib/api';

interface GradingTableProps {
  answers: StudentAnswer[];
  maxScore: number;
  onAnswerUpdated: (answer: StudentAnswer) => void;
}

export default function GradingTable({ answers, maxScore, onAnswerUpdated }: GradingTableProps) {
  const [filter, setFilter] = useState<'all' | 'ambiguous'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState<string>('');
  const [editingOcrId, setEditingOcrId] = useState<string | null>(null);
  const [editOcrText, setEditOcrText] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const filtered = filter === 'ambiguous'
    ? answers.filter((a) => a.is_ambiguous)
    : answers;

  const ambiguousCount = answers.filter((a) => a.is_ambiguous).length;

  async function handleSaveScore(answerId: string) {
    setSaving(true);
    try {
      const score = editScore === '' ? null : Number(editScore);
      const updated = await updateStudentAnswer(answerId, {
        score: score ?? undefined,
        grading_status: 'graded',
      });
      onAnswerUpdated(updated);
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOcr(answerId: string) {
    setSaving(true);
    try {
      await correctOcrText(answerId, editOcrText);
      // Update local state
      onAnswerUpdated({
        ...answers.find((a) => a.id === answerId)!,
        ocr_text: editOcrText,
      });
      setEditingOcrId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  function statusBadge(answer: StudentAnswer) {
    if (answer.is_ambiguous) {
      return <span className="badge bg-amber-100 text-amber-700">검토 필요</span>;
    }
    if (answer.grading_status === 'graded') {
      return <span className="badge bg-green-100 text-green-700">채점 완료</span>;
    }
    return <span className="badge bg-gray-100 text-gray-600">대기중</span>;
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'all'
              ? 'bg-blue-100 text-blue-700 font-medium'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          전체 ({answers.length})
        </button>
        <button
          onClick={() => setFilter('ambiguous')}
          className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'ambiguous'
              ? 'bg-amber-100 text-amber-700 font-medium'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          검토 필요 ({ambiguousCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          {filter === 'ambiguous' ? '검토가 필요한 답안이 없습니다.' : '답안이 없습니다.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-3 font-medium text-gray-600">학생</th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">학번</th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">OCR 인식 결과</th>
                <th className="text-center py-3 px-3 font-medium text-gray-600">점수</th>
                <th className="text-center py-3 px-3 font-medium text-gray-600">상태</th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">피드백</th>
                <th className="text-center py-3 px-3 font-medium text-gray-600">수정</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((answer) => (
                <tr
                  key={answer.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${
                    answer.is_ambiguous ? 'bg-amber-50/50' : ''
                  }`}
                >
                  <td className="py-3 px-3 font-medium text-gray-900">
                    {answer.student_name || '-'}
                  </td>
                  <td className="py-3 px-3 text-gray-600">
                    {answer.student_number || '-'}
                  </td>
                  <td className="py-3 px-3 text-gray-700 max-w-xs">
                    {editingOcrId === answer.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editOcrText}
                          onChange={(e) => setEditOcrText(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-xs flex-1"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveOcr(answer.id)}
                          disabled={saving}
                          className="text-xs text-green-600 hover:text-green-800 whitespace-nowrap"
                        >
                          확인
                        </button>
                        <button
                          onClick={() => setEditingOcrId(null)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div
                        className="truncate cursor-pointer hover:text-blue-600 group"
                        onClick={() => {
                          setEditingOcrId(answer.id);
                          setEditOcrText(answer.ocr_text || '');
                        }}
                        title="클릭하여 OCR 텍스트 수정 (학습 데이터로 활용됨)"
                      >
                        {answer.ocr_text || '-'}
                        <span className="hidden group-hover:inline text-xs text-blue-400 ml-1">수정</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {editingId === answer.id ? (
                      <div className="flex items-center gap-1 justify-center">
                        <input
                          type="number"
                          value={editScore}
                          onChange={(e) => setEditScore(e.target.value)}
                          className="w-16 border border-gray-300 rounded px-2 py-1 text-center text-xs"
                          min={0}
                          max={maxScore}
                          step={0.5}
                          autoFocus
                        />
                        <span className="text-xs text-gray-400">/{maxScore}</span>
                      </div>
                    ) : (
                      <span className={`font-medium ${answer.score !== null ? 'text-gray-900' : 'text-gray-400'}`}>
                        {answer.score !== null ? `${answer.score}/${maxScore}` : '-'}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">{statusBadge(answer)}</td>
                  <td className="py-3 px-3 text-gray-600 max-w-xs">
                    {answer.is_ambiguous && answer.ambiguity_reason && (
                      <p className="text-amber-600 text-xs mb-1">{answer.ambiguity_reason}</p>
                    )}
                    <p className="text-xs truncate">{answer.grading_feedback || '-'}</p>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {editingId === answer.id ? (
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => handleSaveScore(answer.id)}
                          disabled={saving}
                          className="text-xs text-green-600 hover:text-green-800"
                        >
                          확인
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(answer.id);
                          setEditScore(answer.score?.toString() || '');
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        수정
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
