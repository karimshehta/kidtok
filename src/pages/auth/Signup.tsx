import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type FormData = { name: string; email: string; phone: string; password: string }

export default function Signup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>()

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            phone: data.phone,
          },
        },
      })
      if (error) throw error
      toast.success('تم إنشاء الحساب! تحقق من بريدك للتفعيل')
      navigate('/login')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-light via-white to-white flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-xl">
            K
          </div>
          <span className="text-3xl font-bold text-primary-dark">{t('appName')}</span>
        </Link>

        <div className="card">
          <h1 className="text-2xl font-bold mb-2">{t('signup')}</h1>
          <p className="text-neutral-700 mb-6 text-sm">ابدأ رحلة آمنة لطفلك مع KidTok</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('name')}</label>
              <input {...register('name', { required: 'مطلوب' })} className="input-field" placeholder="اسمك الكامل" />
              {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                {...register('email', { required: 'مطلوب' })}
                className="input-field"
                placeholder="email@example.com"
                dir="ltr"
              />
              {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('phone')}</label>
              <input
                {...register('phone', { required: 'مطلوب' })}
                className="input-field"
                placeholder="01XXXXXXXXX"
                dir="ltr"
              />
              {errors.phone && <p className="text-danger text-xs mt-1">{errors.phone.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('password')}</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  {...register('password', { required: 'مطلوب', minLength: { value: 6, message: '6 أحرف على الأقل' } })}
                  className="input-field pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-700"
                >
                  {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t('loading') : t('signup')}
            </button>
          </form>

          <p className="text-center text-sm text-neutral-700 mt-6">
            لديك حساب بالفعل؟{' '}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              {t('login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
