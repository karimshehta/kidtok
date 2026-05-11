import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { translateAuthError } from '@/lib/auth-errors'
import AuthShell from '@/components/AuthShell'

type FormData = { password: string; confirmPassword: string }

export default function ResetPassword() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [errorState, setErrorState] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>()
  const password = watch('password')

  // Listen for the PASSWORD_RECOVERY event from the URL hash
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryReady(true)
      }
    })

    // Also handle the case where the page is opened with an active recovery session already
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setRecoveryReady(true)
      } else {
        // Give Supabase a moment to process the URL hash, then check
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getSession()
          if (d2.session) {
            setRecoveryReady(true)
          } else {
            setErrorState('الرابط منتهي الصلاحية أو تم استخدامه. اطلب رابطًا جديدًا.')
          }
        }, 1500)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password })
      if (error) throw error
      await supabase.auth.signOut()
      navigate('/login?reset=success')
    } catch (err) {
      toast.error(translateAuthError(err, i18n.language as 'ar' | 'en'))
    } finally {
      setLoading(false)
    }
  }

  if (errorState) {
    return (
      <AuthShell title="رابط غير صالح" subtitle="">
        <p className="text-neutral-700 mb-6 text-center">{errorState}</p>
        <button onClick={() => navigate('/forgot-password')} className="btn-primary w-full">
          طلب رابط جديد
        </button>
      </AuthShell>
    )
  }

  if (!recoveryReady) {
    return (
      <AuthShell title="جارٍ التحقق..." subtitle="">
        <div className="flex justify-center py-8">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="كلمة مرور جديدة"
      subtitle="اختر كلمة مرور قوية لحسابك"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">كلمة المرور الجديدة</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              {...register('password', {
                required: 'مطلوب',
                minLength: { value: 6, message: '6 أحرف على الأقل' },
              })}
              className="input-field pe-12"
              placeholder="••••••••"
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
          <label className="block text-sm font-medium mb-1">تأكيد كلمة المرور</label>
          <input
            type={showPass ? 'text' : 'password'}
            {...register('confirmPassword', {
              required: 'مطلوب',
              validate: (v) => v === password || 'كلمات المرور غير متطابقة',
            })}
            className="input-field"
            placeholder="••••••••"
            autoComplete="new-password"
          />
          {errors.confirmPassword && (
            <p className="text-danger text-xs mt-1">{errors.confirmPassword.message}</p>
          )}
        </div>

        <div className="bg-primary/5 rounded-xl p-3 text-xs text-neutral-700 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <span>استخدم 8 أحرف على الأقل تتضمن حرفًا كبيرًا ورقمًا للأمان الأفضل</span>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'جارٍ الحفظ...' : 'تغيير كلمة المرور'}
        </button>
      </form>
    </AuthShell>
  )
}
