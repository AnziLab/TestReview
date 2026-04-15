export function ProgressBar({ value, max, label, showPercent = true }: {
  value: number; max?: number; label?: string; showPercent?: boolean
}) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : value
  return (
    <div>
      {(label || showPercent) && (
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          {label && <span>{label}</span>}
          {showPercent && <span>{pct}%</span>}
        </div>
      )}
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div className="bg-indigo-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
