import { useEffect, useState, type ComponentType } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Camera, ChevronDown, ChevronRight, Coins, Eye, EyeOff, Frame, Gift, Loader2, Mic2, Palette, Save, SlidersHorizontal, Sparkles, Trash2, Volume2 } from 'lucide-react'

import AdminLayout from '@/components/AdminLayout'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type CatalogAccess = 'free' | 'reward' | 'coins'
type CatalogTab = 'voices' | 'frames' | 'themes' | 'snap'

interface CatalogItem {
  id: string
  name_ar: string
  name_en: string
  access_type: CatalogAccess
  coin_cost: number
  sort_order: number
  is_active: boolean
}

interface AdminVoice extends CatalogItem {}

interface AdminSnapLens extends CatalogItem {
  lens_id: string | null
  lens_group_id: string | null
  name_match: string
  icon_url: string | null
  is_blocked: boolean
  notes: string | null
}

interface AdminProfileFrame {
  id: string
  name_ar: string
  name_en: string
  coin_cost: number
  is_free: boolean
  required_level: number
  tier_order: number
  is_active: boolean
  gradient: string[]
  icon: string
}

type ThemeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'

interface AdminProfileTheme {
  id: string
  name_ar: string
  name_en: string
  description_ar: string
  description_en: string
  emoji: string
  coin_cost: number
  is_free: boolean
  is_active: boolean
  rarity: ThemeRarity
  sort_order: number
  gradient: string[]
  accent_color: string
}

const ACCESS_OPTIONS: Array<{
  value: CatalogAccess
  label: string
  hint: string
}> = [
  { value: 'free', label: 'مجاني', hint: 'متاح دائمًا لكل الأطفال' },
  { value: 'reward', label: 'إعلان Reward فقط', hint: 'استخدام واحد بعد مشاهدة الإعلان' },
  { value: 'coins', label: 'كوينز + إعلان Reward', hint: 'شراء دائم أو استخدام واحد بعد الإعلان' },
]

const SNAP_LENS_ACCESS_OPTIONS: Array<{
  value: Extract<CatalogAccess, 'free' | 'coins'>
  label: string
  hint: string
}> = [
  { value: 'free', label: 'Free preview + free record', hint: 'The lens appears in camera and records without charging coins.' },
  { value: 'coins', label: 'Coins per video', hint: 'Kids can preview it for free, then pay this price only when they press Record.' },
]

const RARITY_OPTIONS: ThemeRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic']

function slugifyLensId(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `snap-${slug}` : `snap-lens-${Date.now()}`
}

export default function AdminAvatars() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<CatalogTab>('frames')

  const voicesQuery = useQuery({
    queryKey: ['admin', 'voice-catalog'],
    queryFn: async (): Promise<AdminVoice[]> => {
      const { data, error } = await supabase
        .from('kid_voice_catalog')
        .select('id, name_ar, name_en, access_type, coin_cost, sort_order, is_active')
        .order('sort_order')
      if (error) throw error
      return (data || []) as AdminVoice[]
    },
  })

  const framesQuery = useQuery({
    queryKey: ['admin', 'profile-frame-catalog'],
    queryFn: async (): Promise<AdminProfileFrame[]> => {
      const { data, error } = await supabase
        .from('profile_frame_catalog')
        .select('id, name_ar, name_en, coin_cost, is_free, required_level, tier_order, is_active, gradient, icon')
        .order('tier_order')
      if (error) throw error
      return (data || []) as AdminProfileFrame[]
    },
  })

  const themesQuery = useQuery({
    queryKey: ['admin', 'profile-theme-catalog'],
    queryFn: async (): Promise<AdminProfileTheme[]> => {
      const { data, error } = await supabase
        .from('profile_theme_catalog')
        .select('id, name_ar, name_en, description_ar, description_en, emoji, coin_cost, is_free, is_active, rarity, sort_order, gradient, accent_color')
        .order('sort_order')
      if (error) throw error
      return (data || []) as AdminProfileTheme[]
    },
  })

  const snapLensesQuery = useQuery({
    queryKey: ['admin', 'snap-lens-catalog'],
    queryFn: async (): Promise<AdminSnapLens[]> => {
      const { data, error } = await supabase
        .from('snap_lens_catalog')
        .select('id, lens_id, lens_group_id, name_match, name_ar, name_en, icon_url, access_type, coin_cost, sort_order, is_active, is_blocked, notes')
        .order('sort_order')
      if (error) throw error
      return (data || []) as AdminSnapLens[]
    },
  })

  const updateVoice = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AdminVoice> }) => {
      const { error } = await supabase
        .from('kid_voice_catalog')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'voice-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['kid-voice-catalog'] }),
      ])
    },
  })

  const updateFrame = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AdminProfileFrame> }) => {
      const { error } = await supabase
        .from('profile_frame_catalog')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'profile-frame-catalog'] })
    },
  })

  const updateTheme = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AdminProfileTheme> }) => {
      const { error } = await supabase
        .from('profile_theme_catalog')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'profile-theme-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['kidtok-collection'] }),
      ])
    },
  })

  const updateSnapLens = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AdminSnapLens> }) => {
      const { error } = await supabase
        .from('snap_lens_catalog')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'snap-lens-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['snap-lens-catalog'] }),
      ])
    },
  })

  const createSnapLens = useMutation({
    mutationFn: async (payload: Pick<AdminSnapLens, 'id' | 'lens_id' | 'name_match' | 'name_ar' | 'name_en' | 'icon_url' | 'access_type' | 'coin_cost' | 'sort_order' | 'is_active' | 'is_blocked'>) => {
      const { error } = await supabase
        .from('snap_lens_catalog')
        .insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'snap-lens-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['snap-lens-catalog'] }),
      ])
    },
  })

  const deleteSnapLens = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('snap_lens_catalog')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'snap-lens-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['snap-lens-catalog'] }),
      ])
    },
  })

  const activeQuery = tab === 'voices' ? voicesQuery : tab === 'themes' ? themesQuery : tab === 'snap' ? snapLensesQuery : framesQuery
  const activeItems =
    tab === 'voices'
      ? voicesQuery.data || []
      : tab === 'themes'
        ? themesQuery.data || []
        : tab === 'snap'
          ? snapLensesQuery.data || []
          : framesQuery.data || []

  return (
    <AdminLayout>
      <div className="max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SlidersHorizontal className="w-7 h-7 text-primary" />
            إدارة الأصوات وإطارات البروفايل
          </h1>
          <p className="text-neutral-700 text-sm mt-1">
            تحكم في ظهور الأصوات وإطارات البروفايل وطريقة فتحها وأسعارها بالكوينز.
          </p>
        </header>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-5 flex gap-3 text-sm text-amber-950">
          <Gift className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>
            <strong>موقوف</strong> يخفي العنصر فورًا من الاختيارات الجديدة بدون التأثير على مشتريات الأطفال السابقة.
          </p>
        </div>

        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Voice and profile frame catalog">
          <CatalogTabButton
            active={tab === 'frames'}
            icon={Frame}
            label="إطارات البروفايل"
            onClick={() => setTab('frames')}
          />
          <CatalogTabButton
            active={tab === 'voices'}
            icon={Volume2}
            label="الأصوات"
            onClick={() => setTab('voices')}
          />
          <CatalogTabButton
            active={tab === 'themes'}
            icon={Palette}
            label="Profile Themes"
            onClick={() => setTab('themes')}
          />
          <CatalogTabButton
            active={tab === 'snap'}
            icon={Sparkles}
            label="Snap AR Lenses"
            onClick={() => setTab('snap')}
          />
        </div>

        {tab === 'snap' && (
          <CreateSnapLensCard
            saving={createSnapLens.isPending}
            nextOrder={(snapLensesQuery.data || []).length * 10 + 10}
            onCreate={async (payload) => {
              try {
                await createSnapLens.mutateAsync(payload)
                toast.success(`Added ${payload.name_en || payload.id}`)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not add Snap lens')
              }
            }}
          />
        )}

        {activeQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : activeQuery.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            تعذر تحميل الكتالوج. تأكد من تطبيق migration الخاص به ثم أعد المحاولة.
          </div>
        ) : activeItems.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-600">
            لا توجد عناصر في هذا الكتالوج حاليًا.
          </div>
        ) : (
          <div className={tab === 'snap' ? 'space-y-2' : 'grid gap-4 md:grid-cols-2'}>
            {tab === 'voices'
                ? (activeItems as AdminVoice[]).map((voice) => (
                  <CatalogCard
                    key={voice.id}
                    item={voice}
                    icon={Mic2}
                    footer={`voice id: ${voice.id}`}
                    saving={updateVoice.isPending && updateVoice.variables?.id === voice.id}
                    onSave={async (patch) => {
                      try {
                        await updateVoice.mutateAsync({ id: voice.id, patch })
                        toast.success(`تم حفظ ${voice.name_ar}`)
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'تعذر حفظ التعديل')
                      }
                    }}
                  />
                ))
                : tab === 'themes'
                  ? (activeItems as AdminProfileTheme[]).map((theme) => (
                    <ProfileThemeCard
                      key={theme.id}
                      item={theme}
                      saving={updateTheme.isPending && updateTheme.variables?.id === theme.id}
                      onSave={async (patch) => {
                        try {
                          await updateTheme.mutateAsync({ id: theme.id, patch })
                          toast.success(`Saved ${theme.name_en || theme.id}`)
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Could not save theme')
                        }
                      }}
                    />
                  ))
                  : tab === 'snap'
                    ? (activeItems as AdminSnapLens[]).map((lens) => (
                      <SnapLensCard
                        key={lens.id}
                        item={lens}
                        saving={updateSnapLens.isPending && updateSnapLens.variables?.id === lens.id}
                        onSave={async (patch) => {
                          try {
                            await updateSnapLens.mutateAsync({ id: lens.id, patch })
                            toast.success(`Saved ${lens.name_en || lens.id}`)
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Could not save Snap lens')
                          }
                        }}
                        deleting={deleteSnapLens.isPending && deleteSnapLens.variables === lens.id}
                        onDelete={async () => {
                          const ok = window.confirm(`Delete "${lens.name_en || lens.id}" from Snap lens rules? If kids already bought it, hiding/blocking is safer than deleting.`)
                          if (!ok) return
                          try {
                            await deleteSnapLens.mutateAsync(lens.id)
                            toast.success(`Deleted ${lens.name_en || lens.id}`)
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Could not delete Snap lens')
                          }
                        }}
                      />
                    ))
                : (activeItems as AdminProfileFrame[]).map((frame) => (
                    <ProfileFrameCard
                      key={frame.id}
                      item={frame}
                      saving={updateFrame.isPending && updateFrame.variables?.id === frame.id}
                      onSave={async (patch) => {
                        try {
                          await updateFrame.mutateAsync({ id: frame.id, patch })
                          toast.success(`تم حفظ ${frame.name_ar}`)
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'تعذر حفظ الإطار')
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

function CatalogTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors',
        active
          ? 'border-primary bg-primary text-white shadow-sm'
          : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50',
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function CatalogCard({
  item,
  icon: Icon,
  footer,
  saving,
  onSave,
}: {
  item: CatalogItem
  icon: ComponentType<{ className?: string }>
  footer: string
  saving: boolean
  onSave: (patch: Pick<CatalogItem, 'access_type' | 'coin_cost' | 'sort_order' | 'is_active'>) => Promise<void>
}) {
  const [accessType, setAccessType] = useState<CatalogAccess>(item.access_type)
  const [isActive, setIsActive] = useState(item.is_active)
  const [coinCost, setCoinCost] = useState(Number(item.coin_cost || 0))
  const [sortOrder, setSortOrder] = useState(Number(item.sort_order || 0))

  useEffect(() => {
    setAccessType(item.access_type)
    setIsActive(item.is_active)
    setCoinCost(Number(item.coin_cost || 0))
    setSortOrder(Number(item.sort_order || 0))
  }, [item])

  const save = async () => {
    if (accessType === 'coins' && coinCost < 1) {
      toast.error('حدد سعرًا لا يقل عن 1 كوين للتأثير المدفوع')
      return
    }

    await onSave({
      access_type: accessType,
      coin_cost: accessType === 'coins' ? Math.max(1, Math.floor(coinCost)) : 0,
      sort_order: Math.max(0, Math.floor(sortOrder)),
      is_active: isActive,
    })
  }

  const selectedAccess = ACCESS_OPTIONS.find((option) => option.value === accessType)

  return (
    <article className={cn('card transition-opacity', !isActive && 'opacity-65')}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 flex-shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <h2 className="font-extrabold text-lg truncate">{item.name_ar}</h2>
            <p className="text-xs text-neutral-600 truncate">{item.name_en} · {item.id}</p>
          </div>
        </div>
        <span className={cn(
          'flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
          isActive ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700',
        )}>
          {isActive ? 'متاح' : 'موقوف'}
        </span>
      </div>

      <div className="grid gap-3 mb-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="block">
          <span className="block text-xs font-bold text-neutral-700 mb-1.5">طريقة الفتح</span>
          <select
            value={accessType}
            onChange={(event) => setAccessType(event.target.value as CatalogAccess)}
            className="input-field w-full"
          >
            {ACCESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-neutral-600 mt-1 block">{selectedAccess?.hint}</span>
        </label>

        <button
          type="button"
          onClick={() => setIsActive((value) => !value)}
          className={cn(
            'rounded-xl border px-3 py-2 text-start transition-colors min-w-[120px]',
            isActive ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-neutral-300 bg-neutral-100 text-neutral-700',
          )}
        >
          <span className="block text-xs opacity-75 mb-1">الظهور في التطبيق</span>
          <span className="font-extrabold flex items-center gap-1.5">
            {isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {isActive ? 'متاح' : 'موقوف'}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="block">
          <span className="text-sm font-bold text-neutral-800 flex items-center gap-1.5 mb-1.5">
            <Coins className="w-4 h-4 text-amber-500" />
            السعر بالكوينز
          </span>
          <input
            type="number"
            min={accessType === 'coins' ? 1 : 0}
            step="1"
            disabled={accessType !== 'coins'}
            value={accessType === 'coins' ? coinCost : 0}
            onChange={(event) => setCoinCost(Number(event.target.value || 0))}
            className="input-field w-full disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-neutral-800 flex items-center gap-1.5 mb-1.5">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            الترتيب
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value || 0))}
            className="input-field w-full"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-xs text-neutral-600 font-mono truncate" title={footer}>{footer}</span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary inline-flex flex-shrink-0 items-center gap-2 px-4 py-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ
        </button>
      </div>
    </article>
  )
}

function CreateSnapLensCard({
  saving,
  nextOrder,
  onCreate,
}: {
  saving: boolean
  nextOrder: number
  onCreate: (payload: Pick<AdminSnapLens, 'id' | 'lens_id' | 'name_match' | 'name_ar' | 'name_en' | 'icon_url' | 'access_type' | 'coin_cost' | 'sort_order' | 'is_active' | 'is_blocked'>) => Promise<void>
}) {
  const [nameMatch, setNameMatch] = useState('')
  const [lensId, setLensId] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [iconUrl, setIconUrl] = useState('')

  const create = async () => {
    const match = nameMatch.trim()
    if (!match) {
      toast.error('Add a lens name match, for example: CamKit Distort')
      return
    }
    const id = slugifyLensId(nameEn || match)
    await onCreate({
      id,
      lens_id: lensId.trim() || null,
      name_match: match.toLowerCase(),
      name_ar: nameAr.trim() || nameEn.trim() || match,
      name_en: nameEn.trim() || match,
      icon_url: iconUrl.trim() || null,
      access_type: 'free',
      coin_cost: 0,
      sort_order: Math.max(0, nextOrder),
      is_active: true,
      is_blocked: false,
    })
    setNameMatch('')
    setLensId('')
    setNameEn('')
    setNameAr('')
    setIconUrl('')
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 mb-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-extrabold text-sky-950 flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Add Snap lens rule
          </h2>
          <p className="text-xs text-sky-900 mt-1">
            Add any new Lens Studio/Snap lens by its name match. If you know the exact Snap lens ID, add it too.
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="block md:col-span-2">
          <span className="block text-xs font-bold text-neutral-700 mb-1.5">Lens name contains *</span>
          <input
            value={nameMatch}
            onChange={(event) => setNameMatch(event.target.value)}
            placeholder="CamKit Distort"
            className="input-field w-full"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-neutral-700 mb-1.5">English label</span>
          <input
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
            placeholder="Cartoon Eyes"
            className="input-field w-full"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-neutral-700 mb-1.5">Arabic label</span>
          <input
            value={nameAr}
            onChange={(event) => setNameAr(event.target.value)}
            placeholder="عيون كرتون"
            className="input-field w-full"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="block text-xs font-bold text-neutral-700 mb-1.5">Exact Snap lens ID (optional)</span>
          <input
            value={lensId}
            onChange={(event) => setLensId(event.target.value)}
            placeholder="Paste lens id if Snap shows it"
            className="input-field w-full"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-neutral-700 mb-1.5">Icon URL (optional)</span>
          <input
            value={iconUrl}
            onChange={(event) => setIconUrl(event.target.value)}
            placeholder="https://..."
            className="input-field w-full"
          />
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={saving}
          className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 self-end"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Add lens
        </button>
      </div>
    </section>
  )
}

function SnapLensCard({
  item,
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  item: AdminSnapLens
  saving: boolean
  deleting: boolean
  onSave: (patch: Pick<AdminSnapLens, 'access_type' | 'coin_cost' | 'sort_order' | 'is_active' | 'is_blocked' | 'icon_url'>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [accessType, setAccessType] = useState<Extract<CatalogAccess, 'free' | 'coins'>>(item.access_type === 'coins' ? 'coins' : 'free')
  const [isActive, setIsActive] = useState(item.is_active)
  const [isBlocked, setIsBlocked] = useState(item.is_blocked)
  const [coinCost, setCoinCost] = useState(Number(item.coin_cost || 0))
  const [sortOrder, setSortOrder] = useState(Number(item.sort_order || 0))
  const [iconUrl, setIconUrl] = useState(item.icon_url || '')

  useEffect(() => {
    setAccessType(item.access_type === 'coins' ? 'coins' : 'free')
    setIsActive(item.is_active)
    setIsBlocked(item.is_blocked)
    setCoinCost(Number(item.coin_cost || 0))
    setSortOrder(Number(item.sort_order || 0))
    setIconUrl(item.icon_url || '')
  }, [item])

  const save = async () => {
    if (accessType === 'coins' && coinCost < 1) {
      toast.error('Set a coin price of at least 1, or make the lens free.')
      return
    }

    await onSave({
      access_type: accessType,
      coin_cost: accessType === 'coins' ? Math.max(1, Math.floor(coinCost)) : 0,
      sort_order: Math.max(0, Math.floor(sortOrder)),
      is_active: isActive,
      is_blocked: isBlocked,
      icon_url: iconUrl.trim() || null,
    })
  }

  const selectedAccess = SNAP_LENS_ACCESS_OPTIONS.find((option) => option.value === accessType)
  const visible = isActive && !isBlocked
  const previewIconUrl = iconUrl.trim() || item.icon_url

  return (
    <article className={cn('rounded-2xl border border-neutral-200 bg-white shadow-sm transition-opacity', !visible && 'opacity-65')}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sky-50 text-sky-600">
          {previewIconUrl ? (
            <img src={previewIconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold text-neutral-950">
            {item.name_en || item.name_ar || item.name_match || item.id}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-neutral-500">
            {item.lens_id || `match: ${item.name_match}`}
          </span>
        </span>
        <span className={cn(
          'hidden rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-flex',
          accessType === 'coins' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800',
        )}>
          {accessType === 'coins' ? `${coinCost} coins/video` : selectedAccess?.label}
        </span>
        <span className={cn(
          'hidden rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-flex',
          visible ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700',
        )}>
          {visible ? 'Shown' : 'Hidden'}
        </span>
        {expanded ? <ChevronDown className="h-5 w-5 flex-shrink-0 text-neutral-400" /> : <ChevronRight className="h-5 w-5 flex-shrink-0 text-neutral-400" />}
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 px-4 pb-4 pt-3">
          {item.notes && (
            <p className="mb-4 rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-950">
              {item.notes}
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-neutral-700">Unlock mode</span>
              <select
                value={accessType}
                onChange={(event) => setAccessType(event.target.value as Extract<CatalogAccess, 'free' | 'coins'>)}
                className="input-field w-full"
              >
                {SNAP_LENS_ACCESS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-neutral-600">{selectedAccess?.hint}</span>
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1 text-xs font-bold text-neutral-800">
                <Coins className="h-4 w-4 text-amber-500" /> Price per video
              </span>
              <input
                type="number"
                min={accessType === 'coins' ? 1 : 0}
                step="1"
                disabled={accessType !== 'coins'}
                value={accessType === 'coins' ? coinCost : 0}
                onChange={(event) => setCoinCost(Number(event.target.value || 0))}
                className="input-field w-full disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1 text-xs font-bold text-neutral-800">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Order
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value || 0))}
                className="input-field w-full"
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-bold text-neutral-700">Card icon URL</span>
            <input
              value={iconUrl}
              onChange={(event) => setIconUrl(event.target.value)}
              placeholder="https://..."
              className="input-field w-full"
            />
            <span className="mt-1 block text-[11px] text-neutral-500">
              Optional: use a Lens Studio thumbnail/exported image so the admin card and app list look polished.
            </span>
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setIsActive((value) => !value)}
              className={cn(
                'rounded-xl border px-3 py-2 text-start transition-colors',
                isActive ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-neutral-300 bg-neutral-100 text-neutral-700',
              )}
            >
              <span className="mb-1 block text-xs opacity-75">Visibility</span>
              <span className="flex items-center gap-1.5 font-extrabold">
                {isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsBlocked((value) => !value)}
              className={cn(
                'rounded-xl border px-3 py-2 text-start transition-colors',
                isBlocked ? 'border-red-300 bg-red-50 text-red-800' : 'border-green-300 bg-green-50 text-green-900',
              )}
            >
              <span className="mb-1 block text-xs opacity-75">Safety</span>
              <span className="font-extrabold">{isBlocked ? 'Blocked' : 'Allowed'}</span>
            </button>

            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={saving || deleting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 font-extrabold text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>

            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || deleting}
              className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>
      )}
    </article>
  )

  return (
    <article className={cn('card transition-opacity', !visible && 'opacity-65')}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-14 h-14 flex-shrink-0 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center overflow-hidden">
            {item.icon_url ? (
              <img src={item.icon_url ?? undefined} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="w-7 h-7" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-extrabold text-lg truncate">{item.name_en || item.name_ar || item.id}</h2>
            <p className="text-xs text-neutral-600 truncate">{item.name_ar} · match: {item.name_match}</p>
          </div>
        </div>
        <span className={cn(
          'flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
          visible ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700',
        )}>
          {visible ? 'Shown' : 'Hidden'}
        </span>
      </div>

      {item.notes && (
        <p className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-950 mb-4">
          {item.notes}
        </p>
      )}

      <div className="grid gap-3 mb-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="block text-xs font-bold text-neutral-700 mb-1.5">Unlock mode</span>
          <select
            value={accessType}
            onChange={(event) => setAccessType(event.target.value as Extract<CatalogAccess, 'free' | 'coins'>)}
            className="input-field w-full"
          >
            {SNAP_LENS_ACCESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-neutral-600 mt-1 block">{selectedAccess?.hint}</span>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-neutral-800 flex items-center gap-1 mb-1.5">
            <Coins className="w-4 h-4 text-amber-500" /> Price
          </span>
          <input
            type="number"
            min={accessType === 'coins' ? 1 : 0}
            step="1"
            disabled={accessType !== 'coins'}
            value={accessType === 'coins' ? coinCost : 0}
            onChange={(event) => setCoinCost(Number(event.target.value || 0))}
            className="input-field w-full disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
          />
        </label>
      </div>

      <div className="grid gap-3 mb-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setIsActive((value) => !value)}
          className={cn(
            'rounded-xl border px-3 py-2 text-start transition-colors',
            isActive ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-neutral-300 bg-neutral-100 text-neutral-700',
          )}
        >
          <span className="block text-xs opacity-75 mb-1">Visibility</span>
          <span className="font-extrabold flex items-center gap-1.5">
            {isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsBlocked((value) => !value)}
          className={cn(
            'rounded-xl border px-3 py-2 text-start transition-colors',
            isBlocked ? 'border-red-300 bg-red-50 text-red-800' : 'border-green-300 bg-green-50 text-green-900',
          )}
        >
          <span className="block text-xs opacity-75 mb-1">Safety</span>
          <span className="font-extrabold">{isBlocked ? 'Blocked' : 'Allowed'}</span>
        </button>

        <label className="block">
          <span className="text-xs font-bold text-neutral-800 flex items-center gap-1 mb-1.5">
            <SlidersHorizontal className="w-4 h-4 text-primary" /> Order
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value || 0))}
            className="input-field w-full"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-xs text-neutral-600 font-mono truncate" title={item.lens_id || item.id}>
          lens id: {item.lens_id || 'matched by name'}
        </span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary inline-flex flex-shrink-0 items-center gap-2 px-4 py-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </article>
  )
}

function ProfileFrameCard({
  item,
  saving,
  onSave,
}: {
  item: AdminProfileFrame
  saving: boolean
  onSave: (patch: Pick<AdminProfileFrame, 'coin_cost' | 'is_free' | 'required_level' | 'tier_order' | 'is_active'>) => Promise<void>
}) {
  const [isFree, setIsFree] = useState(item.is_free)
  const [isActive, setIsActive] = useState(item.is_active)
  const [coinCost, setCoinCost] = useState(Number(item.coin_cost || 0))
  const [requiredLevel, setRequiredLevel] = useState(Number(item.required_level || 1))
  const [tierOrder, setTierOrder] = useState(Number(item.tier_order || 0))

  useEffect(() => {
    setIsFree(item.is_free)
    setIsActive(item.is_active)
    setCoinCost(Number(item.coin_cost || 0))
    setRequiredLevel(Number(item.required_level || 1))
    setTierOrder(Number(item.tier_order || 0))
  }, [item])

  const save = async () => {
    if (!isFree && coinCost < 1) {
      toast.error('حدد سعرًا لا يقل عن 1 كوين، أو فعّل خيار مجاني')
      return
    }

    await onSave({
      is_free: isFree,
      coin_cost: isFree ? 0 : Math.max(1, Math.floor(coinCost)),
      required_level: Math.max(1, Math.min(7, Math.floor(requiredLevel))),
      tier_order: Math.max(0, Math.floor(tierOrder)),
      is_active: isActive,
    })
  }

  return (
    <article className={cn('card transition-opacity', !isActive && 'opacity-65')}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-14 h-14 flex-shrink-0 rounded-full p-1 flex items-center justify-center shadow-sm"
            style={{ background: `linear-gradient(135deg, ${(item.gradient || ['#38BDF8', '#A855F7']).join(', ')})` }}
          >
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-2xl">
              {item.icon || '🖼️'}
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="font-extrabold text-lg truncate">{item.name_ar}</h2>
            <p className="text-xs text-neutral-600 truncate">{item.name_en} · {item.id}</p>
          </div>
        </div>
        <span className={cn(
          'flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
          isActive ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700',
        )}>
          {isActive ? 'متاح' : 'موقوف'}
        </span>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 mb-4 text-xs text-violet-950">
        يصل الطفل للإطار مجانًا عند المستوى المحدد، أو يشتريه مبكرًا بالسعر أدناه. تفعيل «مجاني» يفتحه للجميع فورًا.
      </div>

      <div className="grid gap-3 mb-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setIsFree((value) => !value)}
          className={cn(
            'rounded-xl border px-3 py-2 text-start transition-colors',
            isFree ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-neutral-300 bg-white text-neutral-700',
          )}
        >
          <span className="block text-xs opacity-75 mb-1">طريقة الحصول</span>
          <span className="font-extrabold flex items-center gap-1.5">
            {isFree ? <Gift className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
            {isFree ? 'مجاني للجميع' : 'كوينز أو مكافأة المستوى'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsActive((value) => !value)}
          className={cn(
            'rounded-xl border px-3 py-2 text-start transition-colors',
            isActive ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-neutral-300 bg-neutral-100 text-neutral-700',
          )}
        >
          <span className="block text-xs opacity-75 mb-1">الظهور في التطبيق</span>
          <span className="font-extrabold flex items-center gap-1.5">
            {isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {isActive ? 'متاح' : 'موقوف'}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <label className="block">
          <span className="text-xs font-bold text-neutral-800 flex items-center gap-1 mb-1.5">
            <Coins className="w-4 h-4 text-amber-500" /> السعر
          </span>
          <input
            type="number"
            min={isFree ? 0 : 1}
            step="1"
            disabled={isFree}
            value={isFree ? 0 : coinCost}
            onChange={(event) => setCoinCost(Number(event.target.value || 0))}
            className="input-field w-full disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-neutral-800 block mb-1.5">المستوى</span>
          <input
            type="number"
            min="1"
            max="7"
            step="1"
            value={requiredLevel}
            onChange={(event) => setRequiredLevel(Number(event.target.value || 1))}
            className="input-field w-full"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-neutral-800 block mb-1.5">الترتيب</span>
          <input
            type="number"
            min="0"
            step="1"
            value={tierOrder}
            onChange={(event) => setTierOrder(Number(event.target.value || 0))}
            className="input-field w-full"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-xs text-neutral-600 font-mono truncate">frame id: {item.id}</span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary inline-flex flex-shrink-0 items-center gap-2 px-4 py-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ
        </button>
      </div>
    </article>
  )
}

function ProfileThemeCard({
  item,
  saving,
  onSave,
}: {
  item: AdminProfileTheme
  saving: boolean
  onSave: (patch: Pick<AdminProfileTheme, 'coin_cost' | 'is_free' | 'is_active' | 'rarity' | 'sort_order'>) => Promise<void>
}) {
  const [isFree, setIsFree] = useState(item.is_free)
  const [isActive, setIsActive] = useState(item.is_active)
  const [coinCost, setCoinCost] = useState(Number(item.coin_cost || 0))
  const [sortOrder, setSortOrder] = useState(Number(item.sort_order || 0))
  const [rarity, setRarity] = useState<ThemeRarity>(item.rarity || 'common')

  useEffect(() => {
    setIsFree(item.is_free)
    setIsActive(item.is_active)
    setCoinCost(Number(item.coin_cost || 0))
    setSortOrder(Number(item.sort_order || 0))
    setRarity(item.rarity || 'common')
  }, [item])

  const save = async () => {
    if (!isFree && coinCost < 1) {
      toast.error('Set a coin price of at least 1, or mark the theme as free.')
      return
    }

    await onSave({
      is_free: isFree,
      coin_cost: isFree ? 0 : Math.max(1, Math.floor(coinCost)),
      is_active: isActive,
      rarity,
      sort_order: Math.max(0, Math.floor(sortOrder)),
    })
  }

  return (
    <article className={cn('card transition-opacity', !isActive && 'opacity-65')}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-14 h-14 flex-shrink-0 rounded-2xl text-2xl flex items-center justify-center shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${(item.gradient || ['#38BDF8', '#A855F7']).join(', ')})`,
              color: item.accent_color || '#fff',
            }}
          >
            {item.emoji || '🎨'}
          </div>
          <div className="min-w-0">
            <h2 className="font-extrabold text-lg truncate">{item.name_en || item.name_ar}</h2>
            <p className="text-xs text-neutral-600 truncate">{item.name_ar} · {item.id}</p>
          </div>
        </div>
        <span className={cn(
          'flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
          isActive ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700',
        )}>
          {isActive ? 'Active' : 'Hidden'}
        </span>
      </div>

      <p className="text-xs text-neutral-600 mb-4 line-clamp-2">
        {item.description_en || item.description_ar || 'Profile theme shown in the KidTok collection.'}
      </p>

      <div className="grid gap-3 mb-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setIsFree((value) => !value)}
          className={cn(
            'rounded-xl border px-3 py-2 text-start transition-colors',
            isFree ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-neutral-300 bg-white text-neutral-700',
          )}
        >
          <span className="block text-xs opacity-75 mb-1">Unlock mode</span>
          <span className="font-extrabold flex items-center gap-1.5">
            {isFree ? <Gift className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
            {isFree ? 'Free for everyone' : 'Coins purchase'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsActive((value) => !value)}
          className={cn(
            'rounded-xl border px-3 py-2 text-start transition-colors',
            isActive ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-neutral-300 bg-neutral-100 text-neutral-700',
          )}
        >
          <span className="block text-xs opacity-75 mb-1">Visibility</span>
          <span className="font-extrabold flex items-center gap-1.5">
            {isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {isActive ? 'Shown in app' : 'Hidden from app'}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <label className="block">
          <span className="text-xs font-bold text-neutral-800 flex items-center gap-1 mb-1.5">
            <Coins className="w-4 h-4 text-amber-500" /> Price
          </span>
          <input
            type="number"
            min={isFree ? 0 : 1}
            step="1"
            disabled={isFree}
            value={isFree ? 0 : coinCost}
            onChange={(event) => setCoinCost(Number(event.target.value || 0))}
            className="input-field w-full disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-neutral-800 block mb-1.5">Rarity</span>
          <select
            value={rarity}
            onChange={(event) => setRarity(event.target.value as ThemeRarity)}
            className="input-field w-full"
          >
            {RARITY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-neutral-800 block mb-1.5">Order</span>
          <input
            type="number"
            min="0"
            step="1"
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value || 0))}
            className="input-field w-full"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-xs text-neutral-600 font-mono truncate">theme id: {item.id}</span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary inline-flex flex-shrink-0 items-center gap-2 px-4 py-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </article>
  )
}
