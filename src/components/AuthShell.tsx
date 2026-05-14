import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import KidTokLogo from '@/components/KidTokLogo'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

export default function AuthShell({ title, subtitle, children, footer }: Props) {
  const { t, i18n } = useTranslation()
  const toggleLang = () => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-light via-neutral-200 to-white flex items-center justify-center p-4 py-8 relative">
      <button
        onClick={toggleLang}
        className="absolute top-4 end-4 p-2 hover:bg-white/60 rounded-full"
        aria-label="lang"
      >
        <Globe className="w-5 h-5 text-neutral-700" />
      </button>

      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6">
          <KidTokLogo textClassName="text-3xl" markClassName="h-14 w-14" />
        </Link>

        <div className="card">
          <h1 className="text-2xl font-bold mb-2">{title}</h1>
          {subtitle && <p className="text-neutral-700 mb-6 text-sm">{subtitle}</p>}
          {children}
        </div>

        {footer && <div className="text-center text-sm text-neutral-700 mt-6">{footer}</div>}
      </div>
    </div>
  )
}
