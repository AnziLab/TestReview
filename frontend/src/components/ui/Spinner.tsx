import { cn } from './cn'

type Size = 'sm' | 'md' | 'lg'
type Tone = 'primary' | 'white'
const sizes = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-7 w-7' }
const tones = {
  primary: 'border-indigo-100 border-t-indigo-500',
  white: 'border-white/30 border-t-white',
}
export function Spinner({ size = 'md', tone = 'primary', className }: { size?: Size; tone?: Tone; className?: string }) {
  return <div className={cn('rounded-full border-2 animate-spin', sizes[size], tones[tone], className)} />
}
