import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Gender } from '@/types/db'

interface Props {
  name: string
  imageUrl?: string | null
  gender?: Gender | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const FALLBACK_COLORS = [
  'from-pink-400 to-rose-500',
  'from-blue-400 to-cyan-500',
  'from-amber-400 to-orange-500',
  'from-violet-400 to-purple-500',
  'from-emerald-400 to-teal-500',
  'from-fuchsia-400 to-pink-500',
  'from-sky-400 to-indigo-500',
  'from-lime-400 to-green-500',
]

const SIZES = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-lg',
  lg: 'w-20 h-20 text-3xl',
  xl: 'w-32 h-32 text-5xl',
} as const

export default function ChildAvatar({ name, imageUrl, gender, size = 'md', className }: Props) {
  const hash = useMemo(() => {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
    return Math.abs(h) % FALLBACK_COLORS.length
  }, [name])

  // 1) Custom uploaded image takes priority
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={cn(SIZES[size], 'rounded-full object-cover', className)}
      />
    )
  }

  // 2) Gender-based brand avatar (boy/girl SVGs from the Flutter design)
  if (gender === 'male' || gender === 'female') {
    const src = gender === 'male' ? '/assets/boy_avatar.svg' : '/assets/girl_avatar.svg'
    const bg = gender === 'male' ? 'bg-primary-light' : 'bg-secondary/15'
    return (
      <div className={cn(SIZES[size], 'rounded-full flex items-center justify-center overflow-hidden flex-shrink-0', bg, className)}>
        <img src={src} alt={name} className="w-[85%] h-[85%] object-contain" />
      </div>
    )
  }

  // 3) Fallback - colored initial
  return (
    <div
      className={cn(
        SIZES[size],
        'rounded-full bg-gradient-to-br text-white font-bold flex items-center justify-center flex-shrink-0',
        FALLBACK_COLORS[hash],
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
