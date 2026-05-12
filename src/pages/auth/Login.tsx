import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { translateAuthError } from '@/lib/auth-errors'
import { useAuth } from '@/stores/auth'
import AuthShell from '@/components/AuthShell'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import Divider from '@/components/Divider'

type FormData = { email: string; password: string }

export default function Login() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const setSession = useAuth((s) => s.setSession)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>()

  useEffect(() => {
    if (params.get('confirmed') === 'true') toast.success(t('auth.emailConfirmed'))
    if (params.get('reset') === 'success') toast.success(t('auth.resetSuccess'))
  }, [params, t])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const { data: result, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      if (error) throw error
      setSession(result.session)
      toast.success(t('auth.welcomeBack'))
      navigate('/home', { replace: true })
    } catch (err) {
      toast.error(translateAuthError(err, i18n.language as 'ar' | 'en'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.login')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="text-primary font-semibold hover:underline">{t('auth.signup')}</Link>
        </>
      }
    >
      <GoogleSignInButton mode="login" />
      <Divider />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('auth.fields.email')}</label>
          <input
            type="email"
            {...register('email', { required: t('auth.validation.required') })}
            className="input-field"
            placeholder={t('auth.fields.emailPlaceholder')}
            dir="ltr"
            autoComplete="email"
          />
          {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
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
              autoComplete="current-password"
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

        <div className="text-start">
          <Link to="/forgot-password" className="text-primary text-sm hover:underline">
            {t('auth.forgotPasswordLink')}
          </Link>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t('common.loading') : t('auth.login')}
        </button>
      </form>
    </AuthShell>
  )
}
