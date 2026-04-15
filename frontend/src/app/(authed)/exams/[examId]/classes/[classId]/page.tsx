'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import { classesApi, studentsApi, questionsApi, answersApi } from '@/lib/api/exams'
import type { Student, Answer, Question } from '@/lib/types'
import { Button, Card, Spinner, useToast } from '@/components/ui'

export default function ClassDetailPage({
  params,
}: {
  params: Promise<{ examId: string; classId: string }>
}) {
  const { examId, classId } = use(params)
  const { data: cls } = useSWR(`classes/${classId}`, () => classesApi.get(Number(classId)))
  const { data: students, isLoading, error, mutate: mutateStudents } = useSWR(
    `classes/${classId}/students`,
    () => classesApi.getStudents(Number(classId))
  )
  const { data: questions } = useSWR(
    `exams/${examId}/questions`,
    () => questionsApi.list(Number(examId))
  )

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
          학생 목록을 불러오는데 실패했습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* 왼쪽: 학생 목록 */}
      <div className={`flex flex-col overflow-hidden transition-all ${selectedStudent ? 'w-1/2' : 'w-full'}`}>
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <h1 className="text-lg font-bold text-slate-900">{cls?.name ?? '반 상세'}</h1>
          <p className="text-sm text-slate-500">{students?.length ?? 0}명</p>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">학번</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">이름</th>
                {!selectedStudent && questions?.map((q) => (
                  <th key={q.id} className="px-4 py-3 text-left text-xs font-medium text-slate-500 max-w-[120px]">
                    {q.number}번
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students?.map((student) => (
                <StudentRow
                  key={student.id}
                  student={student}
                  questions={questions ?? []}
                  showAnswers={!selectedStudent}
                  isSelected={selectedStudent?.id === student.id}
                  onSelect={() => setSelectedStudent(
                    selectedStudent?.id === student.id ? null : student
                  )}
                  onUpdated={() => mutateStudents()}
                />
              ))}
            </tbody>
          </table>
          {(!students || students.length === 0) && (
            <div className="py-8 text-center text-slate-400 text-sm">학생 데이터가 없습니다.</div>
          )}
        </div>
      </div>

      {/* 오른쪽: 답안 수정 패널 */}
      {selectedStudent && (
        <div className="w-1/2 border-l border-slate-200 flex flex-col overflow-hidden bg-white">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="font-semibold text-slate-900">
                {selectedStudent.name ?? '-'}
                <span className="ml-2 text-sm font-normal text-slate-500">{selectedStudent.student_number}</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">답안 클릭 후 수정, 포커스 이탈 시 자동 저장</p>
            </div>
            <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <AnswerEditor
            studentId={selectedStudent.id}
            questions={questions ?? []}
          />
        </div>
      )}
    </div>
  )
}

function StudentRow({
  student, questions, showAnswers, isSelected, onSelect, onUpdated,
}: {
  student: Student
  questions: Question[]
  showAnswers: boolean
  isSelected: boolean
  onSelect: () => void
  onUpdated: () => void
}) {
  const { data: answers } = useSWR(
    `students/${student.id}/answers`,
    () => studentsApi.getAnswers(student.id)
  )
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [vals, setVals] = useState({ student_number: student.student_number || '', name: student.name || '' })
  const [saving, setSaving] = useState(false)

  const answerMap: Record<number, string> = {}
  answers?.forEach((a: Answer) => { answerMap[a.question_id] = a.answer_text })

  const save = async () => {
    setSaving(true)
    try {
      await studentsApi.update(student.id, {
        student_number: vals.student_number || undefined,
        name: vals.name || undefined,
      })
      onUpdated()
      setEditing(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장 실패', 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr
      className={`cursor-pointer transition-colors ${
        isSelected ? 'bg-indigo-50' : student.needs_review ? 'bg-amber-50/50 hover:bg-amber-100/50' : 'hover:bg-slate-50'
      }`}
      onClick={() => !editing && onSelect()}
    >
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <input
            className="border border-slate-200 rounded-lg px-2 py-1 w-full text-sm"
            value={vals.student_number}
            onChange={(e) => setVals((p) => ({ ...p, student_number: e.target.value }))}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={student.needs_review ? 'text-amber-700 font-medium' : ''}>
            {student.student_number ?? '-'}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              className="border border-slate-200 rounded-lg px-2 py-1 w-full text-sm"
              value={vals.name}
              onChange={(e) => setVals((p) => ({ ...p, name: e.target.value }))}
            />
            <Button size="sm" onClick={save} loading={saving}>저장</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>취소</Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className={student.needs_review ? 'text-amber-700 font-medium' : ''}>
              {student.name ?? '-'}
            </span>
            {student.needs_review && (
              <span className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">검토필요</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setEditing(true) }}
              className="ml-1 text-slate-300 hover:text-indigo-500"
            >
              ✎
            </Button>
          </div>
        )}
      </td>
      {showAnswers && questions.map((q) => (
        <td key={q.id} className="px-4 py-2.5 max-w-[120px]">
          <span className="text-slate-600 text-xs line-clamp-2">{answerMap[q.id] || '-'}</span>
        </td>
      ))}
    </tr>
  )
}

function AnswerEditor({ studentId, questions }: { studentId: number; questions: Question[] }) {
  const { data: answers, mutate } = useSWR(
    `students/${studentId}/answers`,
    () => studentsApi.getAnswers(studentId)
  )
  const toast = useToast()
  const [savingId, setSavingId] = useState<number | null>(null)
  const [localTexts, setLocalTexts] = useState<Record<number, string>>({})

  const answerMap: Record<number, Answer> = {}
  answers?.forEach((a) => { answerMap[a.question_id] = a })

  const handleBlur = async (answerId: number, text: string) => {
    setSavingId(answerId)
    try {
      await answersApi.update(answerId, text)
      mutate()
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장 실패', 'danger')
    } finally {
      setSavingId(null)
    }
  }

  if (!answers) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="md" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {questions.map((q) => {
        const answer = answerMap[q.id]
        if (!answer) return (
          <Card key={q.id} padding="sm">
            <p className="text-sm font-medium text-slate-700 mb-1">{q.number}번 <span className="text-slate-400 font-normal text-xs">/{q.max_score}점</span></p>
            <p className="text-xs text-slate-400 italic">답안 없음</p>
          </Card>
        )

        const currentText = localTexts[answer.id] ?? answer.answer_text
        const isSaving = savingId === answer.id

        return (
          <Card key={q.id} padding="sm">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-slate-700">
                {q.number}번
                <span className="ml-1 text-slate-400 font-normal text-xs">/{q.max_score}점</span>
              </p>
              {isSaving && (
                <span className="text-xs text-indigo-500 flex items-center gap-1">
                  <Spinner size="sm" />
                  저장 중
                </span>
              )}
            </div>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none resize-none"
              rows={2}
              value={currentText}
              onChange={(e) => setLocalTexts((p) => ({ ...p, [answer.id]: e.target.value }))}
              onBlur={(e) => handleBlur(answer.id, e.target.value)}
            />
          </Card>
        )
      })}
    </div>
  )
}
