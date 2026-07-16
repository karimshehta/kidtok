import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bot, Coins, Eye, EyeOff, Gift, Loader2, Save } from 'lucide-react'

import AdminLayout from '@/components/AdminLayout'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type AvatarAccess = 'free' | 'reward' | 'coins'

interface AdminAvatar {
  id: string
  name_ar: string
  name_en: string
  access_type: AvatarAccess
  coin_cost: number
  sound_key: string
  sort_order: number
  is_active: boolean
}

export default function AdminAvatars() {
  const queryClient = useQueryClient()
  const { data: avatars = [], isLoading } = useQuery({
    queryKey: ['admin', 'avatar-catalog'],
    queryFn: async (): Promise<AdminAvatar[]> => {
      const { data, error } = await supabase
        .from('kid_avatar_catalog')
        .select('id, name_ar, name_en, access_type, coin_cost, sound_key, sort_order, is_active')
        .order('sort_order')
      if (error) throw error
      return (data || []) as AdminAvatar[]
    },
  })

  const updateAvatar = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AdminAvatar> }) => {
      const { error } = await supabase
        .from('kid_avatar_catalog')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'avatar-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['kid-avatar-catalog'] }),
      ])
    },
  })

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-7 h-7 text-primary" />
            إدارة أفاتارات الفيديو
          </h1>
          <p className="text-neutral-700 text-sm mt-1">
            حدّد السعر والمجانية والإتاحة. كل أفاتار مدفوع يمكن شراؤه نهائيًا أو استخدامه مرة بعد Rewarded Ad.
          </p>
        </header>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-5 flex gap-3 text-sm text-amber-950">
          <Gift className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>
            إيقاف الأفاتار يخفيه فورًا من شاشة الاختيار الجديدة، لكنه لا يغيّر الفيديوهات المنشورة به ولا يؤثر على التطبيق الحالي.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {avatars.map((avatar) => (
              <AvatarCard
                key={avatar.id}
                avatar={avatar}
                saving={updateAvatar.isPending && updateAvatar.variables?.id === avatar.id}
                onSave={async (patch) => {
                  try {
                    await updateAvatar.mutateAsync({ id: avatar.id, patch })
                    toast.success(`تم حفظ ${avatar.name_ar}`)
                  } catch (error) {
                    toast.error((error as Error).message)
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

function AvatarCard({
  avatar,
  saving,
  onSave,
}: {
  avatar: AdminAvatar
  saving: boolean
  onSave: (patch: Partial<AdminAvatar>) => Promise<void>
}) {
  const [isFree, setIsFree] = useState(avatar.access_type === 'free')
  const [isActive, setIsActive] = useState(avatar.is_active)
  const [coinCost, setCoinCost] = useState(Number(avatar.coin_cost || 0))

  useEffect(() => {
    setIsFree(avatar.access_type === 'free')
    setIsActive(avatar.is_active)
    setCoinCost(Number(avatar.coin_cost || 0))
  }, [avatar])

  const save = async () => {
    if (!isFree && coinCost < 1) {
      toast.error('حدد سعرًا لا يقل عن 1 كوين للأفاتار المدفوع')
      return
    }
    await onSave({
      access_type: isFree ? 'free' : 'coins',
      coin_cost: Math.max(0, Math.floor(coinCost)),
      is_active: isActive,
    })
  }

  return (
    <article className={cn('card transition-opacity', !isActive && 'opacity-65')}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Bot className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-extrabold text-lg">{avatar.name_ar}</h2>
            <p className="text-xs text-neutral-600">{avatar.name_en} · {avatar.id}</p>
          </div>
        </div>
        <span className={cn(
          'rounded-full px-2.5 py-1 text-xs font-bold',
          isActive ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700'
        )}>
          {isActive ? 'متاح' : 'موقوف'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          type="button"
          onClick={() => setIsFree((value) => !value)}
          className={cn(
            'rounded-xl border p-3 text-start transition-colors',
            isFree ? 'border-green-300 bg-green-50 text-green-900' : 'border-violet-300 bg-violet-50 text-violet-900'
          )}
        >
          <span className="block text-xs opacity-75 mb-1">نوع الوصول</span>
          <span className="font-extrabold">{isFree ? 'مجاني' : 'مدفوع أو إعلان'}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsActive((value) => !value)}
          className={cn(
            'rounded-xl border p-3 text-start transition-colors',
            isActive ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-neutral-300 bg-neutral-100 text-neutral-700'
          )}
        >
          <span className="block text-xs opacity-75 mb-1">الظهور في التطبيق</span>
          <span className="font-extrabold flex items-center gap-1.5">
            {isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {isActive ? 'متاح' : 'موقوف'}
          </span>
        </button>
      </div>

      <label className="block mb-4">
        <span className="text-sm font-bold text-neutral-800 flex items-center gap-1.5 mb-1.5">
          <Coins className="w-4 h-4 text-amber-500" />
          سعر الشراء الدائم بالكوينز
        </span>
        <input
          type="number"
          min={isFree ? 0 : 1}
          step="1"
          value={coinCost}
          onChange={(event) => setCoinCost(Number(event.target.value || 0))}
          className="input-field"
        />
        <span className="text-[11px] text-neutral-600 mt-1 block">
          السعر لا يُخصم إلا عند أول استخدام بطريقة الشراء؛ الاستخدام بالإعلان يظل لمرة واحدة.
        </span>
      </label>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-xs text-neutral-600 font-mono">sound: {avatar.sound_key}</span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ
        </button>
      </div>
    </article>
  )
}
