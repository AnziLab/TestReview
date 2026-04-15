import React from 'react'

export function EmptyState({ icon, title, description, action }: {
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="mb-4 text-slate-300 [&>svg]:w-12 [&>svg]:h-12">{icon}</div>}
      <p className="text-slate-600 font-medium mb-1">{title}</p>
      {description && <p className="text-sm text-slate-400 mb-4">{description}</p>}
      {action}
    </div>
  )
}
