import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  name: string
  imageUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const COLORS = [
  'from-pink-400 to-rose-500',
  'from-blue-400 to-cyan-500',
  'from-amber-400 to-orange-500',
  'from-violet-400 to-purple-500',
  'from-emerald-400 to-teal-500',
  'from-fuchsia-400 to-pink-500',
  'from-sky-400 to-indigo-500',
  'from-lime-400 to-green-500',
]

export default function ChildAvatar({ name, imageUrl, size = 'md', className }: Props) {
  const hash = useMemo(() => {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
    return Math.abs(h) % COLORS.length
  }, [name])

  const sizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-lg',
    lg: 'w-20 h-20 text-3xl',
    xl: 'w-32 h-32 text-5xl',
  }

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={cn(sizes[size], 'rounded-full object-cover', className)}
      />
    )
  }

  return (
    <div
      className={cn(
        sizes[size],
        'rounded-full bg-gradient-to-br text-white font-bold flex items-center justify-center flex-shrink-0',
        COLORS[hash],
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
