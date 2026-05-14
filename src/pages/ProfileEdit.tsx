import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Camera,
  Save,
  Loader2,
  User as UserIcon,
  Phone,
  FileText,
  Check,
} from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import { useUpdateProfile, useUploadAvatar } from '@/hooks/useProfile'
import { useUserProfile } from '@/hooks/useProfile'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { cn } from '@/lib/utils'

interface FormFields { name: string; phone: string; bio: string }

export default function ProfileEdit() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const userId = useAuth((s) => s.user?.id)

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const updateMut = useUpdateProfile()
  const uploadMut = useUploadAvatar()

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormFields>()

  // Load current profile
  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('name, phone, bio, avatar_url')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          reset({ name: data.name || '', phone: data.phone || '', bio: data.bio || '' })
          setAvatarUrl(data.avatar_url || null)
        }
      })
  }, [userId, reset])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error(t('profile.edit.avatarTooLarge')); return }
    setAvatarLoading(true)
    try {
      const url = await uploadMut.mutateAsync(file)
      setAvatarUrl(url)
      toast.success(t('profile.edit.avatarUpdated'))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setAvatarLoading(false)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateMut.mutateAsync({
        name: values.name.trim() || undefined,
        phone: values.phone.trim() || undefined,
        bio: values.bio.trim() || undefined,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      toast.success(t('profile.edit.saved'))
    } catch (err) {
      toast.error((err as Error).message)
    }
  })

  const initials = (register('name') as any)?.name?.charAt(0)?.toUpperCase() || '?'

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-lg">
        {/* Back */}
        <button
          onClick={() => navigate('/profile')}
          className="inline-flex items-center gap-2 text-primary mb-6 hover:underline"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          {t('common.back')}
        </button>

        <h1 className="text-2xl font-bold mb-6">{t('profile.edit.title')}</h1>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-primary to-secondary">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-3xl font-bold">
                  {initials}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarLoading}
              className="absolute bottom-0 end-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white shadow-lg hover:bg-primary/90"
            >
              {avatarLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Camera className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-neutral-700 mt-2">{t('profile.edit.avatarHint')}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-neutral-700" />
              {t('profile.nameLabel')}
            </label>
            <input
              {...register('name')}
              className="input-field"
              placeholder={t('profile.edit.namePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-2">
              <Phone className="w-4 h-4 text-neutral-700" />
              {t('profile.phoneLabel')}
            </label>
            <input
              {...register('phone')}
              className="input-field"
              type="tel"
              dir="ltr"
              placeholder="+201XXXXXXXXX"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-2">
              <FileText className="w-4 h-4 text-neutral-700" />
              {t('profile.edit.bio')}
              <span className="text-xs text-neutral-700 font-normal">({t('profile.edit.bioCreatorOnly')})</span>
            </label>
            <textarea
              {...register('bio')}
              rows={3}
              maxLength={200}
              className="input-field resize-none"
              placeholder={t('profile.edit.bioPlaceholder')}
            />
          </div>

          <button
            type="submit"
            disabled={updateMut.isPending || !isDirty}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all',
              saved ? 'bg-green-500 text-white' :
              isDirty ? 'btn-primary' : 'bg-neutral-200 text-neutral-700 cursor-not-allowed'
            )}
          >
            {updateMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> :
             saved ? <><Check className="w-5 h-5" /> {t('profile.edit.saved')}</> :
             <><Save className="w-5 h-5" /> {t('profile.edit.save')}</>}
          </button>
        </form>
      </div>
    </AppLayout>
  )
}

// Export a re-export of useUserProfile from here too
export { useUserProfile } from '@/hooks/useProfile'
