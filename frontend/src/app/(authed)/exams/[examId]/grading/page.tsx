'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import { examsApi, questionsApi } from '@/lib/api/exams'
import type { GradingResult } from '@/lib/types'

export default function GradingPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  const { data: questions } = useSWR(
    `exams/${examId}/questions`,
    () => questionsApi.list(Number(examId))
  )
  const { data: results, isLoading, error, mutate } = useSWR<GradingResult[]>(
    `exams/${examId}/grading-results`,
    () => examsApi.getGradingResults(Number(examId))
  )
  const [grading, setGrading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handleGrade = async () => {
    if (!confirm('일괄 채점을 실행하시겠습니까?')) return
    setGrading(true)
    try {
      await examsApi.grade(Number(examId))
      // Poll until done
      let attempts = 0
      const poll = async () => {
        attempts++
        const data = await examsApi.getGradingResults(Number(examId))
        if (data && data.length > 0) {
          mutate(data)
          setGrading(false)
        } else if (attempts < 30) {
          setTimeout(poll, 2000)
        } else {
          setGrading(false)
        }
      }
      setTimeout(poll, 2000)
    } catch (e) {
      alert(e instanceof Error ? e.message : '채점 실패')
      setGrading(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await examsApi.downloadGradingExcel(Number(examId))
      if (!res.ok) throw new Error('다운로드 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `채점결과_${examId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(e instanceof Error ? e.message : '다운로드 실패')
    } finally {
      setDownloading(false)
    }
  }

  const questionProgress: Record<number, { total: number; scored: number }> = {}
  if (results && questions) {
    for (const q of questions) {
      questionProgress[q.id] = { total: results.length, scored: 0 }
    }
    for (const r of results) {
      for (const qId of Object.keys(r.scores)) {
        const id = Number(qId)
        if (questionProgress[id]) {
          if (r.scores[id] != null) questionProgress[id].scored++
        }
      }
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">채점</h1>
        <div className="flex gap-2">
          <button
            onClick={handleGrade}
            disabled={grading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {grading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {grading ? '채점 중...' : '일괄 채점 실행'}
          </button>
          {results && results.length > 0 && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel 다운로드
            </button>
          )}
        </div>
      </div>

      {/* Question progress */}
      {questions && questions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <h2 className="font-medium text-gray-800 mb-3">문항별 채점 진행률</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {questions.map((q) => {
              const prog = questionProgress[q.id]
              const pct = prog && prog.total > 0 ? Math.round((prog.scored / prog.total) * 100) : 0
              return (
                <div key={q.id} className="border border-gray-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-700 mb-1">문항 {q.number}</p>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {prog ? `${prog.scored}/${prog.total}` : '0/0'} ({pct}%)
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          채점 결과를 불러오는데 실패했습니다.
        </div>
      )}

      {results && results.length > 0 && questions && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 sticky left-0 bg-gray-50">학번</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">이름</th>
                {questions.map((q) => (
                  <th key={q.id} className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                    문항 {q.number}<br />
                    <span className="text-gray-400 font-normal">/{q.max_score}</span>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((r) => (
                <tr key={r.student_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 sticky left-0 bg-white font-mono text-xs">
                    {r.student_number ?? '-'}
                  </td>
                  <td className="px-4 py-2.5">{r.name ?? '-'}</td>
                  {questions.map((q) => (
                    <td key={q.id} className="px-4 py-2.5 text-right">
                      {r.scores[q.id] != null ? (
                        <span className="font-medium">{r.scores[q.id]}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-bold text-blue-700">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && (!results || results.length === 0) && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center text-gray-500">
          채점 결과가 없습니다. 일괄 채점을 실행하세요.
        </div>
      )}
    </div>
  )
}
