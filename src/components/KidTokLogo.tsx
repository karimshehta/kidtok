import { cn } from '@/lib/utils'

interface KidTokLogoProps {
  showText?: boolean
  textClassName?: string
  markClassName?: string
  className?: string
  inverted?: boolean
}

export default function KidTokLogo({
  showText = true,
  textClassName,
  markClassName,
  className,
  inverted = false,
}: KidTokLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-primary/10',
          markClassName || 'h-10 w-10'
        )}
      >
        <img src="/assets/kidtok-logo.svg" alt="" className="h-[78%] w-[78%] object-contain" aria-hidden="true" />
      </span>
      {showText && (
        <span
          className={cn(
            'font-extrabold leading-none',
            inverted ? 'text-white' : 'text-primary-dark',
            textClassName
          )}
        >
          KidTok
        </span>
      )}
    </span>
  )
}
