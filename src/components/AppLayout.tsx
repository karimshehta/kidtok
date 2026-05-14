import { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Users, User, Bell, Globe, Upload, Sparkles, Search } from 'lucide-react'
import { useAuth } from '@/stores/auth'
import { useUserRole } from '@/hooks/useCreator'
import { useAds, useAdSenseScript } from '@/hooks/useAds'
import { BannerAd } from '@/components/AdSlot'
import { cn } from '@/lib/utils'
import KidTokLogo from '@/components/KidTokLogo'

interface Props {
  children: ReactNode
}

export default function AppLayout({ children }: Props) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const { data: role } = useUserRole()
  const { showAds, publisherId, bannerUnitId } = useAds()
  useAdSenseScript(publisherId, showAds)

  const toggleLang = () => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')

  const navItems = [
    { to: '/feed', label: t('nav.feed'), icon: Sparkles, match: (p: string) => p === '/feed' || p === '/home' },
    { to: '/children', label: t('nav.children'), icon: Users, match: (p: string) => p.startsWith('/children') },
    { to: '/search', label: t('nav.search'), icon: Search, match: (p: string) => p === '/search' },
    { to: '/profile', label: t('nav.profile'), icon: User, match: (p: string) => p === '/profile' || p.startsWith('/admin') || p.startsWith('/creator') },
  ]

  const userName = user?.user_metadata.name || user?.user_metadata.full_name
  const isCreator = role === 'creator' || role === 'admin'

  return (
    <div className="min-h-screen bg-neutral-200/70 pb-24">
      <header className="kidtok-soft-surface sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate('/feed')} className="flex items-center gap-2">
            <KidTokLogo textClassName="text-xl" markClassName="h-10 w-10" />
          </button>

          <div className="flex items-center gap-1 sm:gap-3">
            {isCreator && (
              <Link
                to="/creator/upload"
                className="p-2 hover:bg-primary/10 rounded-full text-primary transition-colors"
                aria-label="upload"
                title={t('creator.nav.upload')}
              >
                <Upload className="w-5 h-5" />
              </Link>
            )}
            <button onClick={toggleLang} className="p-2 hover:bg-neutral-200 rounded-full" aria-label="lang">
              <Globe className="w-5 h-5 text-neutral-700" />
            </button>
            <button className="p-2 hover:bg-neutral-200 rounded-full relative" aria-label="notifications">
              <Bell className="w-5 h-5 text-neutral-700" />
            </button>
            {userName && (
              <div className="hidden sm:block text-sm text-neutral-700 ms-1">
                {t('profile.welcomeUser', { name: userName })}
              </div>
            )}
          </div>
        </div>
      </header>

      <main>
        {showAds && bannerUnitId && (
          <BannerAd unitId={bannerUnitId} publisherId={publisherId} />
        )}
        {children}
      </main>

      <nav className="fixed bottom-0 inset-x-0 kidtok-soft-surface z-40">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-4 py-2">
            {navItems.map((item) => {
              const active = item.match(location.pathname)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl py-2 transition-colors',
                    active ? 'text-secondary bg-secondary/10' : 'text-neutral-700'
                  )}
                >
                  <item.icon className="w-6 h-6" />
                  <span className="text-xs font-medium">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>
    </div>
  )
}
