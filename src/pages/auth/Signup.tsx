import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { translateAuthError } from '@/lib/auth-errors'
import { useAuth } from '@/stores/auth'
import AuthShell from '@/components/AuthShell'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import Divider from '@/components/Divider'

type FormData = { name: string; email: string; phone: string; password: string }

export default function Signup() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const setSession = useAuth((s) => s.setSession)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>()

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const { data: result, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { name: data.name, phone: data.phone },
          emailRedirectTo: `${window.location.origin}/login?confirmed=true`,
        },
      })
      if (error) throw error

      if (result.session) {
        setSession(result.session)
        toast.success(t('auth.welcomeNew'))
        navigate('/home', { replace: true })
      } else {
        setSentEmail(data.email)
      }
    } catch (err) {
      toast.error(translateAuthError(err, i18n.language as 'ar' | 'en'))
    } finally {
      setLoading(false)
    }
  }

  if (sentEmail) {
    return (
      <AuthShell title={t('auth.confirmEmailTitle')} subtitle="">
        <div className="text-center py-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <p className="text-neutral-900 mb-2 font-medium">{t('auth.confirmEmailBody')}</p>
          <p className="text-primary font-semibold mb-4" dir="ltr">{sentEmail}</p>
          <p className="text-sm text-neutral-700 mb-6">{t('auth.confirmEmailHint')}</p>
          <Link to="/login" className="btn-outline w-full block text-center">{t('auth.backToLogin')}</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('auth.signup')}
      subtitle={t('auth.signupSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="text-primary font-semibold hover:underline">{t('auth.login')}</Link>
        </>
      }
    >
      <GoogleSignInButton mode="signup" />
      <Divider />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('auth.fields.name')}</label>
          <input
            {...register('name', { required: t('auth.validation.required') })}
            className="input-field"
            placeholder={t('auth.fields.namePlaceholder')}
            autoComplete="name"
          />
          {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t('auth.fields.email')}</label>
          <input
            type="email"
            {...register('email', {
              required: t('auth.validation.required'),
              pattern: { value: /^\S+@\S+\.\S+$/, message: t('auth.validation.emailFormat') },
            })}
            className="input-field"
            placeholder={t('auth.fields.emailPlaceholder')}
            dir="ltr"
            autoComplete="email"
          />
          {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t('auth.fields.phone')}</label>
          <input
            {...register('phone', { required: t('auth.validation.required') })}
            className="input-field"
            placeholder={t('auth.fields.phonePlaceholder')}
            dir="ltr"
            autoComplete="tel"
          />
          {errors.phone && <p className="text-danger text-xs mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t('auth.fields.password')}</label>
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

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t('common.loading') : t('auth.signup')}
        </button>
      </form>
    </AuthShell>
  )
}
