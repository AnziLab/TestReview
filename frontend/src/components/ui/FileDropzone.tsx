'use client'
import { useRef } from 'react'

export function FileDropzone({ accept, value, onChange, hint }: {
  accept?: string; value: File | null; onChange: (f: File | null) => void; hint?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div onClick={() => ref.current?.click()}
      className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors group">
      <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
        <svg className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      {value
        ? <p className="text-sm font-medium text-indigo-600">{value.name}</p>
        : <><p className="text-sm text-slate-600 font-medium">클릭하여 파일 선택</p>{hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}</>
      }
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </div>
  )
}
