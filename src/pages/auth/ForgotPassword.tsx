import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Mail, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { translateAuthError } from '@/lib/auth-errors'
import AuthShell from '@/components/AuthShell'

type FormData = { email: string }

export default function ForgotPassword() {
  const { i18n } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [sentEmail, setSentEmail] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>()

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setSentEmail(data.email)
    } catch (err) {
      toast.error(translateAuthError(err, i18n.language as 'ar' | 'en'))
    } finally {
      setLoading(false)
    }
  }

  if (sentEmail) {
    return (
      <AuthShell title="تم إرسال الرابط" subtitle="">
        <div className="text-center py-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <p className="text-neutral-900 mb-2 font-medium">
            لو الحساب موجود، هتلاقي رسالة على:
          </p>
          <p className="text-primary font-semibold mb-4" dir="ltr">{sentEmail}</p>
          <p className="text-sm text-neutral-700 mb-6">
            افتح الرابط في الإيميل عشان تعيد تعيين كلمة المرور
          </p>
          <Link to="/login" className="btn-outline w-full block text-center">
            العودة لتسجيل الدخول
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="نسيت كلمة المرور؟"
      subtitle="ادخل بريدك الإلكتروني، هنبعتلك رابط لإعادة التعيين"
      footer={
        <Link to="/login" className="inline-flex items-center gap-1 text-primary hover:underline">
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          العودة لتسجيل الدخول
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">البريد الإلكتروني</label>
          <input
            type="email"
            {...register('email', {
              required: 'مطلوب',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'صيغة البريد غير صحيحة' },
            })}
            className="input-field"
            placeholder="email@example.com"
            dir="ltr"
            autoComplete="email"
          />
          {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'جارٍ الإرسال...' : 'إرسال رابط إعادة التعيين'}
        </button>
      </form>
    </AuthShell>
  )
}
