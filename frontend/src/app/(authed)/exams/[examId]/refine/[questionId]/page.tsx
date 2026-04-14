'use client'

import { use, useState, useCallback } from 'react'
import useSWR from 'swr'
import { questionsApi } from '@/lib/api/exams'
import { apiFetch } from '@/lib/api/client'
import { RubricEditor } from '@/components/RubricEditor'
import { usePolling } from '@/lib/hooks/usePolling'
import type { AnswerCluster, RefinementSession, Question, Answer } from '@/lib/types'

const emptyRubric = { criteria: [], notes: '' }

function ClusterCard({ cluster, expanded, members, onToggle }: {
  cluster: AnswerCluster
  expanded: boolean
  members?: Answer[]
  onToggle: () => void
}) {
  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer transition-colors ${
        cluster.judgable
          ? 'border-green-200 bg-green-50/40 hover:bg-green-50'
          : 'border-red-200 bg-red-50/40 hover:bg-red-50'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{cluster.label}</span>
            <span className="text-xs text-gray-500">{cluster.size}명</span>
            {cluster.judgable ? (
              <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">판단 가능</span>
            ) : (
              <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">기준 미충족</span>
            )}
            {cluster.suggested_score != null && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                제안 점수: {cluster.suggested_score}점
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 line-clamp-2">{cluster.representative_text}</p>
          {!cluster.judgable && cluster.reason && (
            <p className="text-xs text-red-600 mt-1 italic">{cluster.reason}</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform mt-0.5 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && members && members.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
          {members.map((ans) => (
            <div key={ans.id} className="text-sm text-gray-700 bg-white rounded p-2 border border-gray-100">
              {ans.answer_text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RefineDetailPage({
  params,
}: {
  params: Promise<{ examId: string; questionId: string }>
}) {
  const { examId, questionId } = use(params)
  const [showAll, setShowAll] = useState(false)
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null)
  const [clusterMembers, setClusterMembers] = useState<Record<number, Answer[]>>({})
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)
  const [refining, setRefining] = useState(false)
  const [pollingSessionId, setPollingSessionId] = useState<number | null>(null)

  const { data: question } = useSWR<Question>(
    `questions/${questionId}`,
    () => questionsApi.get(Number(questionId))
  )

  const { data: sessions, mutate: mutateSessions } = useSWR(
    `questions/${questionId}/sessions`,
    () => questionsApi.getRefinementSessions(Number(questionId))
  )

  const activeSession: RefinementSession | undefined = selectedSessionId
    ? sessions?.find((s) => s.id === selectedSessionId)
    : sessions?.[0]

  const { data: pollingData } = usePolling<RefinementSession>(
    pollingSessionId ? `/refinement-sessions/${pollingSessionId}` : null,
    2000,
    (d) => {
      if (d.status === 'done' || d.status === 'failed') {
        mutateSessions()
        setPollingSessionId(null)
        return true
      }
      return false
    }
  )

  const { data: clusters, isLoading: clustersLoading } = useSWR(
    activeSession?.id && activeSession.status === 'done'
      ? `sessions/${activeSession.id}/clusters`
      : null,
    () => questionsApi.getClusters(activeSession!.id)
  )

  const displayClusters = showAll
    ? clusters
    : clusters?.filter((c) => !c.judgable)

  const handleRefine = async () => {
    setRefining(true)
    try {
      const res = await questionsApi.refine(Number(questionId))
      setPollingSessionId(res.id)
      mutateSessions()
    } catch (e) {
      alert(e instanceof Error ? e.message : '정제 시작 실패')
    } finally {
      setRefining(false)
    }
  }

  const handleToggleCluster = useCallback(async (clusterId: number) => {
    setExpandedCluster((prev) => {
      const next = prev === clusterId ? null : clusterId
      if (next !== null && !clusterMembers[next]) {
        apiFetch<Answer[]>(`/clusters/${next}/members`).then((members) => {
          setClusterMembers((m) => ({ ...m, [next]: members }))
        }).catch(() => {})
      }
      return next
    })
  }, [clusterMembers])

  const isRunning =
    (pollingSessionId !== null) ||
    (pollingData && pollingData.status === 'running') ||
    (activeSession?.status === 'running')

  return (
    <div className="flex h-full">
      {/* Left: Cluster list */}
      <div className="w-1/2 border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-900">
              문항 {question?.number} — 클러스터 목록
            </h2>
            {sessions && sessions.length > 1 && (
              <select
                className="text-xs border border-gray-300 rounded px-2 py-1"
                value={selectedSessionId ?? ''}
                onChange={(e) => setSelectedSessionId(e.target.value ? Number(e.target.value) : null)}
              >
                {sessions.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    세션 {sessions.length - i} ({s.status === 'done' ? '완료' : s.status === 'running' ? '실행 중' : '실패'})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="rounded accent-blue-600"
              />
              <span className="text-sm text-gray-600">전체 보기</span>
            </label>
            {activeSession && (
              <span className="text-xs text-gray-400">
                {clusters?.length ?? 0}개 클러스터
                {activeSession.unjudgable_count != null && ` · 판단불가 ${activeSession.unjudgable_count}개`}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isRunning && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-2" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-gray-600">Gemini가 답안을 분석하고 있습니다...</p>
              </div>
            </div>
          )}

          {!isRunning && clustersLoading && (
            <div className="flex justify-center py-8">
              <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {!isRunning && !clustersLoading && activeSession?.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              정제 실패. 재시도하세요.
            </div>
          )}

          {!isRunning && !clustersLoading && (!clusters || clusters.length === 0) && activeSession?.status === 'done' && (
            <div className="text-center text-gray-400 text-sm py-8">클러스터 데이터가 없습니다.</div>
          )}

          {!isRunning && displayClusters?.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              expanded={expandedCluster === cluster.id}
              members={clusterMembers[cluster.id]}
              onToggle={() => handleToggleCluster(cluster.id)}
            />
          ))}

          {!isRunning && clusters && displayClusters?.length === 0 && !showAll && (
            <div className="text-center text-green-600 text-sm py-8">
              모든 클러스터가 판단 가능합니다.
            </div>
          )}
        </div>
      </div>

      {/* Right: Rubric editor */}
      <div className="w-1/2 overflow-y-auto">
        <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">채점기준 편집</h2>
          <button
            onClick={handleRefine}
            disabled={refining || !!isRunning}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            {refining || isRunning ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                정제 중...
              </>
            ) : '재정제'}
          </button>
        </div>
        <div className="p-4">
          {question && (
            <RubricEditor
              key={question.id}
              questionId={questionId}
              initialRubric={question.rubric_draft_json ?? question.rubric_json ?? emptyRubric}
            />
          )}
        </div>
      </div>
    </div>
  )
}
