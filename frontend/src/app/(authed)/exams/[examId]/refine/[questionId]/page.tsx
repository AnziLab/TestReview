'use client'

import { use, useState, useCallback } from 'react'
import useSWR from 'swr'
import { questionsApi } from '@/lib/api/exams'
import { apiFetch } from '@/lib/api/client'
import { RubricEditor } from '@/components/RubricEditor'
import { usePolling } from '@/lib/hooks/usePolling'
import type { AnswerCluster, RefinementSession, Question, Answer } from '@/lib/types'
import { Badge, Button, Select, Spinner, useToast } from '@/components/ui'

const emptyRubric = { criteria: [], notes: '' }

function ClusterCard({ cluster, expanded, members, onToggle }: {
  cluster: AnswerCluster
  expanded: boolean
  members?: Answer[]
  onToggle: () => void
}) {
  return (
    <div
      className={`border rounded-xl p-4 cursor-pointer transition-colors ${
        cluster.judgable
          ? 'border-emerald-100 bg-emerald-50/60 hover:bg-emerald-50'
          : 'border-rose-100 bg-rose-50/60 hover:bg-rose-50'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium text-slate-900 text-sm">{cluster.label}</span>
            <span className="text-xs text-slate-500">{cluster.size}명</span>
            {cluster.judgable ? (
              <Badge tone="success">판단 가능</Badge>
            ) : (
              <Badge tone="danger">기준 미충족</Badge>
            )}
            {cluster.suggested_score != null && (
              <Badge tone="primary">제안 점수: {cluster.suggested_score}점</Badge>
            )}
          </div>
          <p className="text-sm text-slate-600 line-clamp-2">{cluster.representative_text}</p>
          {!cluster.judgable && cluster.reason && (
            <p className="text-xs text-rose-600 mt-1 italic">{cluster.reason}</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform mt-0.5 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && members && members.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {members.map((ans) => (
            <div key={ans.id} className="text-sm text-slate-700 bg-white rounded-lg p-2 border border-slate-100">
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
  const toast = useToast()
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
      toast(e instanceof Error ? e.message : '정제 시작 실패', 'danger')
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
      <div className="w-1/2 border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-slate-900">
              문항 {question?.number} — 클러스터 목록
            </h2>
            {sessions && sessions.length > 1 && (
              <Select
                className="text-xs w-auto"
                value={selectedSessionId ?? ''}
                onChange={(e) => setSelectedSessionId(e.target.value ? Number(e.target.value) : null)}
              >
                {sessions.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    세션 {sessions.length - i} ({s.status === 'done' ? '완료' : s.status === 'running' ? '실행 중' : '실패'})
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="rounded accent-indigo-500"
              />
              <span className="text-sm text-slate-600">전체 보기</span>
            </label>
            {activeSession && (
              <span className="text-xs text-slate-400">
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
                <Spinner size="lg" className="mx-auto mb-2" />
                <p className="text-sm text-slate-600">Gemini가 답안을 분석하고 있습니다...</p>
              </div>
            </div>
          )}

          {!isRunning && clustersLoading && (
            <div className="flex justify-center py-8">
              <Spinner size="md" />
            </div>
          )}

          {!isRunning && !clustersLoading && activeSession?.status === 'failed' && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">
              정제 실패. 재시도하세요.
            </div>
          )}

          {!isRunning && !clustersLoading && (!clusters || clusters.length === 0) && activeSession?.status === 'done' && (
            <div className="text-center text-slate-400 text-sm py-8">클러스터 데이터가 없습니다.</div>
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
            <div className="text-center text-emerald-600 text-sm py-8">
              모든 클러스터가 판단 가능합니다.
            </div>
          )}
        </div>
      </div>

      {/* Right: Rubric editor */}
      <div className="w-1/2 overflow-y-auto">
        <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">채점기준 편집</h2>
          <Button
            loading={refining || !!isRunning}
            disabled={refining || !!isRunning}
            onClick={handleRefine}
          >
            재정제
          </Button>
        </div>
        <div className="p-4">
          {question && (
            <>
              {question.model_answer && (
                <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <p className="text-xs font-medium text-indigo-700 mb-1">모범답안</p>
                  <p className="text-sm text-indigo-900 whitespace-pre-wrap">{question.model_answer}</p>
                </div>
              )}
              <RubricEditor
                key={question.id}
                questionId={questionId}
                initialRubric={question.rubric_draft_json ?? question.rubric_json ?? emptyRubric}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
