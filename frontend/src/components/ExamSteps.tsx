'use client';

import Link from 'next/link';

interface Step {
  label: string;
  href: string;
  stepNum: number;
}

interface ExamStepsProps {
  examId: string;
  currentStep: number;
}

export default function ExamSteps({ examId, currentStep }: ExamStepsProps) {
  const steps: Step[] = [
    { stepNum: 1, label: '답안지 템플릿', href: `/exams/${examId}/template` },
    { stepNum: 2, label: '영역 설정', href: `/exams/${examId}/template` },
    { stepNum: 3, label: '채점 기준', href: `/exams/${examId}/rubric` },
    { stepNum: 4, label: '학생 답안', href: `/exams/${examId}/students` },
    { stepNum: 5, label: '채점', href: `/exams/${examId}/grading` },
  ];

  return (
    <nav className="flex items-center gap-0 mb-8">
      {steps.map((step, idx) => {
        const isCompleted = step.stepNum < currentStep;
        const isCurrent = step.stepNum === currentStep;
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.stepNum} className="flex items-center">
            <Link
              href={step.href}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isCurrent
                  ? 'bg-blue-500 text-white'
                  : isCompleted
                  ? 'text-blue-600 hover:bg-blue-50'
                  : 'text-gray-400 hover:bg-gray-100'
              }`}
            >
              <span
                className={`min-w-[2.5rem] h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 px-1 ${
                  isCurrent
                    ? 'bg-white text-blue-600'
                    : isCompleted
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  `${step.stepNum}단계`
                )}
              </span>
              {step.label}
            </Link>
            {!isLast && (
              <svg
                className="w-4 h-4 text-gray-300 mx-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </div>
        );
      })}
    </nav>
  );
}
