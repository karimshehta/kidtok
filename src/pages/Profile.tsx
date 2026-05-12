import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff, LogOut, KeyRound, User as UserIcon, Mail, Phone, Video, Upload, ShieldCheck, Crown } from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { translateAuthError } from '@/lib/auth-errors'
import { useUserRole } from '@/hooks/useCreator'
import { useMySubscription } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'

type PassForm = { password: string; confirmPassword: string }

export default function Profile() {
  const { t, i18n } = useTranslation()
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const { data: role } = useUserRole()
  const { data: mySub } = useMySubscription()

  const [showSection, setShowSection] = useState<'none' | 'password'>('none')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<PassForm>()
  const password = watch('password')

  const onSubmitPassword = async (data: PassForm) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password })
      if (error) throw error
      toast.success(t('profile.passwordChanged'))
      reset()
      setShowSection('none')
    } catch (err) {
      toast.error(translateAuthError(err, i18n.language as 'ar' | 'en'))
    } finally {
      setLoading(false)
    }
  }

  const userName = user?.user_metadata.name || user?.user_metadata.full_name || '-'
  const isCreator = role === 'creator' || role === 'admin'
  const isAdmin = role === 'admin'

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-xl">
        <h1 className="text-2xl font-bold mb-4">{t('profile.title')}</h1>

        <div className="card space-y-4 mb-4">
          <Info icon={UserIcon} label={t('profile.nameLabel')} value={userName} />
          <Info icon={Mail} label={t('profile.emailLabel')} value={user?.email || '-'} dir="ltr" />
          <Info icon={Phone} label={t('profile.phoneLabel')} value={user?.user_metadata.phone || '-'} dir="ltr" />
        </div>

        <Link
          to="/subscription"
          className="card mb-4 relative overflow-hidden block group"
          style={{
            background: mySub
              ? 'linear-gradient(135deg, #03BBE5, #F96286)'
              : 'linear-gradient(135deg, #fff, #fafafa)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0',
              mySub ? 'bg-white/20 backdrop-blur' : 'bg-gradient-to-br from-primary to-secondary'
            )}>
              <Crown className={cn('w-6 h-6', mySub ? 'text-amber-200' : 'text-white')} />
            </div>
            <div className="flex-1 min-w-0">
              {mySub ? (
                <>
                  <div className="font-bold text-white">
                    {i18n.language === 'ar' ? mySub.plan_name_ar : mySub.plan_name_en}
                  </div>
                  <div className="text-xs text-white/85">
                    {t('subscription.expiresIn', { days: mySub.days_remaining })}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-bold text-neutral-900">{t('subscription.upgradeTitle')}</div>
                  <div className="text-xs text-neutral-700">{t('subscription.upgradeSubtitle')}</div>
                </>
              )}
            </div>
            <div className={cn('text-xs px-3 py-1 rounded-full font-semibold', mySub ? 'bg-white text-primary' : 'bg-primary text-white')}>
              {mySub ? t('common.edit') : t('subscription.subscribe')}
            </div>
          </div>
        </Link>

        {isCreator && (
          <div className="card mb-4 space-y-2">
            <Link
              to="/creator/upload"
              className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-neutral-200 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t('creator.nav.upload')}</div>
                <div className="text-xs text-neutral-700">{t('creator.upload.subtitle')}</div>
              </div>
            </Link>
            <Link
              to="/creator/videos"
              className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-neutral-200 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                <Video className="w-5 h-5 text-secondary" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t('creator.nav.myVideos')}</div>
                <div className="text-xs text-neutral-700">{t('creator.myVideos.title')}</div>
              </div>
            </Link>
          </div>
        )}

        {isAdmin && (
          <Link
            to="/admin"
            className="card mb-4 flex items-center gap-3 hover:bg-neutral-200/50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-amber-700" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">{t('admin.title')}</div>
              <div className="text-xs text-neutral-700">{t('admin.dashboard.welcome')}</div>
            </div>
          </Link>
        )}

        <div className="card mb-4">
          <button
            onClick={() => setShowSection(showSection === 'password' ? 'none' : 'password')}
            className="w-full flex items-center gap-3 text-start"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">{t('profile.changePassword')}</div>
              <div className="text-xs text-neutral-700">{t('profile.changePasswordHint')}</div>
            </div>
          </button>

          {showSection === 'password' && (
            <form onSubmit={handleSubmit(onSubmitPassword)} className="space-y-3 mt-4 pt-4 border-t border-neutral-300">
              <div>
                <label className="block text-sm font-medium mb-1">{t('auth.fields.newPassword')}</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    {...register('password', {
                      required: t('auth.validation.required'),
                      minLength: { value: 6, message: t('auth.validation.minLength', { count: 6 }) },
                    })}
                    className="input-field pe-12"
                    placeholder={t('auth.fields.passwordPlaceholder')}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-700"
                  >
                    {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('auth.fields.confirmPassword')}</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  {...register('confirmPassword', {
                    required: t('auth.validation.required'),
                    validate: (v) => v === password || t('auth.validation.passwordsMismatch'),
                  })}
                  className="input-field"
                  placeholder={t('auth.fields.passwordPlaceholder')}
                  autoComplete="new-password"
                />
                {errors.confirmPassword && <p className="text-danger text-xs mt-1">{errors.confirmPassword.message}</p>}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('common.saving') : t('common.save')}
              </button>
            </form>
          )}
        </div>

        <button onClick={signOut} className="w-full card flex items-center gap-3 text-danger hover:bg-danger/5">
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
            <LogOut className="w-5 h-5 text-danger" />
          </div>
          <span className="font-semibold">{t('auth.logout')}</span>
        </button>
      </div>
    </AppLayout>
  )
}

function Info({ icon: Icon, label, value, dir }: { icon: typeof UserIcon; label: string; value: string; dir?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center">
        <Icon className="w-5 h-5 text-neutral-700" />
      </div>
      <div className="flex-1">
        <div className="text-xs text-neutral-700">{label}</div>
        <div className="font-medium" dir={dir}>{value}</div>
      </div>
    </div>
  )
}
