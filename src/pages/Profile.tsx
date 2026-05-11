import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff, LogOut, KeyRound, User as UserIcon, Mail, Phone } from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { translateAuthError } from '@/lib/auth-errors'

type PassForm = { password: string; confirmPassword: string }

export default function Profile() {
  const { i18n } = useTranslation()
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

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
      toast.success('تم تغيير كلمة المرور بنجاح')
      reset()
      setShowSection('none')
    } catch (err) {
      toast.error(translateAuthError(err, i18n.language as 'ar' | 'en'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-xl">
        <h1 className="text-2xl font-bold mb-4">الملف الشخصي</h1>

        {/* Account info */}
        <div className="card space-y-4 mb-4">
          <Info icon={UserIcon} label="الاسم" value={user?.user_metadata.name || '-'} />
          <Info icon={Mail} label="البريد الإلكتروني" value={user?.email || '-'} dir="ltr" />
          <Info icon={Phone} label="رقم الهاتف" value={user?.user_metadata.phone || '-'} dir="ltr" />
        </div>

        {/* Change password */}
        <div className="card mb-4">
          <button
            onClick={() => setShowSection(showSection === 'password' ? 'none' : 'password')}
            className="w-full flex items-center gap-3 text-start"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">تغيير كلمة المرور</div>
              <div className="text-xs text-neutral-700">حدّث كلمة المرور لحماية حسابك</div>
            </div>
          </button>

          {showSection === 'password' && (
            <form onSubmit={handleSubmit(onSubmitPassword)} className="space-y-3 mt-4 pt-4 border-t border-neutral-300">
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

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور'}
              </button>
            </form>
          )}
        </div>

        {/* Sign out */}
        <button onClick={signOut} className="w-full card flex items-center gap-3 text-danger hover:bg-danger/5">
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
            <LogOut className="w-5 h-5 text-danger" />
          </div>
          <span className="font-semibold">تسجيل الخروج</span>
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
