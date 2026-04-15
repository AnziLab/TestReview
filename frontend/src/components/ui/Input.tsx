'use client'
import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from './cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label, error, hint, className, id, ...props
}, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-')
  return (
    <div className="w-full">
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400',
          'focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none transition-shadow',
          error && 'border-rose-300 focus:border-rose-300 focus:ring-rose-100',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
})
Input.displayName = 'Input'
