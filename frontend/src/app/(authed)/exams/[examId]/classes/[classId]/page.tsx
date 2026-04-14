'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import { classesApi, studentsApi, questionsApi } from '@/lib/api/exams'
import type { Student, Answer, Question } from '@/lib/types'

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

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<{ student_number: string; name: string }>({ student_number: '', name: '' })
  const [saving, setSaving] = useState(false)

  const startEdit = (student: Student) => {
    setEditingId(student.id)
    setEditValues({
      student_number: student.student_number || '',
      name: student.name || '',
    })
  }

  const saveEdit = async (id: number) => {
    setSaving(true)
    try {
      await studentsApi.update(id, {
        student_number: editValues.student_number || undefined,
        name: editValues.name || undefined,
      })
      mutateStudents()
      setEditingId(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          학생 목록을 불러오는데 실패했습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">{cls?.name ?? '반 상세'}</h1>
        <p className="text-sm text-gray-500">{students?.length ?? 0}명</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-24">학번</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-24">이름</th>
              {questions?.map((q) => (
                <th key={q.id} className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                  문항 {q.number}
                </th>
              ))}
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students?.map((student) => (
              <StudentRow
                key={student.id}
                student={student}
                questions={questions ?? []}
                isEditing={editingId === student.id}
                editValues={editValues}
                saving={saving}
                onStartEdit={() => startEdit(student)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => saveEdit(student.id)}
                onChangeEditValue={(field, val) =>
                  setEditValues((prev) => ({ ...prev, [field]: val }))
                }
              />
            ))}
          </tbody>
        </table>
        {(!students || students.length === 0) && (
          <div className="py-8 text-center text-gray-400 text-sm">학생 데이터가 없습니다.</div>
        )}
      </div>
    </div>
  )
}

function StudentRow({
  student,
  questions,
  isEditing,
  editValues,
  saving,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeEditValue,
}: {
  student: Student
  questions: Question[]
  isEditing: boolean
  editValues: { student_number: string; name: string }
  saving: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onChangeEditValue: (field: 'student_number' | 'name', val: string) => void
}) {
  const { data: answers } = useSWR(
    `students/${student.id}/answers`,
    () => studentsApi.getAnswers(student.id)
  )

  const answerMap: Record<number, string> = {}
  answers?.forEach((a: Answer) => {
    answerMap[a.question_id] = a.answer_text
  })

  return (
    <tr className={student.needs_review ? 'bg-yellow-50' : ''}>
      <td className="px-4 py-2">
        {isEditing ? (
          <input
            className="border border-gray-300 rounded px-2 py-1 w-full text-sm focus:ring-1 focus:ring-blue-500"
            value={editValues.student_number}
            onChange={(e) => onChangeEditValue('student_number', e.target.value)}
          />
        ) : (
          <span className={student.needs_review ? 'font-medium text-yellow-700' : ''}>
            {student.student_number ?? '-'}
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        {isEditing ? (
          <input
            className="border border-gray-300 rounded px-2 py-1 w-full text-sm focus:ring-1 focus:ring-blue-500"
            value={editValues.name}
            onChange={(e) => onChangeEditValue('name', e.target.value)}
          />
        ) : (
          <span className={student.needs_review ? 'font-medium text-yellow-700' : ''}>
            {student.name ?? '-'}
            {student.needs_review && (
              <span className="ml-1 bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded-full">검토 필요</span>
            )}
          </span>
        )}
      </td>
      {questions.map((q) => (
        <td key={q.id} className="px-4 py-2 max-w-xs">
          <span className="text-gray-600 text-xs line-clamp-2">
            {answerMap[q.id] ?? '-'}
          </span>
        </td>
      ))}
      <td className="px-4 py-2">
        {isEditing ? (
          <div className="flex gap-1">
            <button
              onClick={onSaveEdit}
              disabled={saving}
              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              저장
            </button>
            <button
              onClick={onCancelEdit}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={onStartEdit}
            className="text-xs text-gray-400 hover:text-blue-600"
          >
            수정
          </button>
        )}
      </td>
    </tr>
  )
}
