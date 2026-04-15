import { HTMLAttributes } from 'react'
import { cn } from './cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg'
  interactive?: boolean
}

const paddings = { sm: 'p-4', md: 'p-6', lg: 'p-8' }

export function Card({ padding = 'md', interactive, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl shadow-card',
        paddings[padding],
        interactive && 'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
      {...props}
    />
  )
}

Card.Header = function CardHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between mb-4', className)} {...props}>{children}</div>
}
Card.Body = function CardBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('', className)} {...props}>{children}</div>
}
