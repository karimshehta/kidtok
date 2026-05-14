import { ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Sparkles,
  ShieldCheck,
  Users as UsersIcon,
  CreditCard,
  Tags,
  Flag,
  ArrowLeft,
  Menu,
  X,
  Globe,
  LogOut,
  Megaphone,
  Smartphone,
} from 'lucide-react'
import { useUserRole } from '@/hooks/useCreator'
import { useAuth } from '@/stores/auth'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
}

export default function AdminLayout({ children }: Props) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: role, isLoading } = useUserRole()
  const signOut = useAuth((s) => s.signOut)
  const [open, setOpen] = useState(false)

  const toggleLang = () => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')

  // Guard: only admins
  if (!isLoading && role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-200 p-4">
        <div className="card max-w-sm text-center">
          <ShieldCheck className="w-14 h-14 mx-auto text-neutral-700 mb-3" />
          <h1 className="text-lg font-bold mb-1">403</h1>
          <p className="text-sm text-neutral-700 mb-4">Admin access only</p>
          <button onClick={() => navigate('/feed')} className="btn-primary">
            {t('admin.nav.backToApp')}
          </button>
        </div>
      </div>
    )
  }

  const navItems = [
    { to: '/admin', label: t('admin.nav.dashboard'), icon: LayoutDashboard, end: true },
    { to: '/admin/content', label: t('admin.nav.content'), icon: Sparkles },
    { to: '/admin/moderation', label: t('admin.nav.moderation'), icon: ShieldCheck },
    { to: '/admin/users', label: t('admin.nav.users'), icon: UsersIcon },
    { to: '/admin/plans', label: t('admin.nav.plans'), icon: CreditCard },
    { to: '/admin/ads', label: t('admin.nav.ads'), icon: Megaphone },
    { to: '/admin/app-version', label: t('admin.nav.appVersion'), icon: Smartphone },
    { to: '/admin/reference', label: t('admin.nav.reference'), icon: Tags },
    { to: '/admin/reports', label: t('admin.nav.reports'), icon: Flag },
  ]

  const isActive = (to: string, end?: boolean) =>
    end ? location.pathname === to : location.pathname.startsWith(to)

  return (
    <div className="min-h-screen bg-neutral-200/40 flex">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed md:sticky top-0 md:top-0 h-[100dvh] md:h-screen bg-white border-e border-neutral-300 w-64 z-50',
          'transition-transform md:translate-x-0',
          'flex flex-col',
          // RTL: slide in from right; LTR: slide in from left
          open
            ? 'translate-x-0'
            : i18n.language === 'ar'
              ? 'translate-x-full md:translate-x-0'
              : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="p-4 border-b border-neutral-300 flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">K</div>
            <div className="leading-tight">
              <div className="font-bold text-sm">{t('common.appName')}</div>
              <div className="text-[10px] text-neutral-700">{t('admin.title')}</div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden p-1 hover:bg-neutral-200 rounded-full"
            aria-label="close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive(item.to, item.end)
                  ? 'bg-primary text-white'
                  : 'text-neutral-900 hover:bg-neutral-200'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-neutral-300 space-y-1">
          <button
            onClick={toggleLang}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-neutral-200 text-neutral-700"
          >
            <Globe className="w-5 h-5" />
            <span>{i18n.language === 'ar' ? 'English' : 'العربية'}</span>
          </button>
          <Link
            to="/feed"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-neutral-200 text-neutral-700"
            onClick={() => setOpen(false)}
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
            <span>{t('admin.nav.backToApp')}</span>
          </Link>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-danger/10 text-danger"
          >
            <LogOut className="w-5 h-5" />
            <span>{t('auth.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar (mobile only) */}
        <header className="md:hidden bg-white border-b border-neutral-300 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <button
            onClick={() => setOpen(true)}
            className="p-1 hover:bg-neutral-200 rounded"
            aria-label="menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold">{t('admin.title')}</span>
          <div className="w-8" />
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}
