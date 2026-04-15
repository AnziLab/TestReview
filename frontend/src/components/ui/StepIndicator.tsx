export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const done = i < current; const active = i === current
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
              done ? 'bg-emerald-100 text-emerald-600' : active ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'
            }`}>
              {done ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> : i + 1}
            </div>
            <span className={`text-sm ${active ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>{label}</span>
            {i < steps.length - 1 && <div className="w-8 h-px bg-slate-200 mx-1" />}
          </div>
        )
      })}
    </div>
  )
}
