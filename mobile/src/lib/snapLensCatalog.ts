import type { Lens } from '@snap/camera-kit-react-native'

import { supabase } from '@/lib/supabase'

export type SnapLensAccess = 'free' | 'reward' | 'coins'

export interface SnapLensCatalogItem {
  id: string
  lens_id: string | null
  lens_group_id: string | null
  name_match: string
  name_ar: string
  name_en: string
  icon_url: string | null
  access_type: SnapLensAccess
  coin_cost: number
  sort_order: number
  is_active: boolean
  is_blocked: boolean
}

type SnapLensDiscoveryInput = Pick<Lens, 'id' | 'name' | 'icons' | 'previews'>

const LOCAL_BLOCKED_LENS_TERMS = [
  'simple typing',
  'simple typ',
  'typing',
  'keyboard',
  'text input',
  'text entry',
  'type here',
]

function normalizeLensText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getSnapLensIconUrl(lens: Pick<Lens, 'icons' | 'previews'>) {
  return lens.icons?.[0]?.imageUrl || lens.previews?.[0]?.imageUrl || null
}

export function isLocallyBlockedSnapLens(lens: Pick<Lens, 'name'>) {
  const name = normalizeLensText(lens.name)
  return LOCAL_BLOCKED_LENS_TERMS.some((term) => name.includes(term))
}

export async function syncSnapLensesToCatalog(lenses: SnapLensDiscoveryInput[], lensGroupId?: string | null) {
  if (!lenses.length) return { seen: 0, inserted: 0 }
  const payload = lenses.slice(0, 200).map((lens, index) => ({
    lens_id: lens.id,
    lens_group_id: lensGroupId || null,
    name: String(lens.name || '').trim() || 'Snap Lens',
    icon_url: getSnapLensIconUrl(lens),
    sort_order: index,
  }))

  const { data, error } = await supabase.rpc('register_snap_lenses', {
    p_lenses: payload,
    p_lens_group_id: lensGroupId || null,
  })

  if (error) {
    // Older DBs will not have the discovery RPC until the migration is pushed.
    // Recording must still work, so keep this strictly best-effort.
    console.warn('[snap-lens-catalog] discovery sync unavailable:', error.message)
    return { seen: payload.length, inserted: 0 }
  }

  return {
    seen: Number((data as any)?.seen || payload.length || 0),
    inserted: Number((data as any)?.inserted || 0),
  }
}

export async function loadSnapLensCatalog(): Promise<SnapLensCatalogItem[]> {
  const { data, error } = await supabase
    .from('snap_lens_catalog')
    .select('id, lens_id, lens_group_id, name_match, name_ar, name_en, icon_url, access_type, coin_cost, sort_order, is_active, is_blocked')
    .order('sort_order', { ascending: true })

  if (error) {
    console.warn('[snap-lens-catalog] unavailable:', error.message)
    return []
  }

  return (data || []) as SnapLensCatalogItem[]
}

export async function loadMySnapLensPurchases(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_snap_lens_purchases')
    .select('snap_lens_id')

  if (error) {
    console.warn('[snap-lens-catalog] purchases unavailable:', error.message)
    return new Set()
  }

  return new Set((data || []).map((row: any) => String(row.snap_lens_id)).filter(Boolean))
}

export async function purchaseSnapLens(snapLensId: string) {
  const { data, error } = await supabase.rpc('purchase_snap_lens', {
    p_snap_lens_id: snapLensId,
  })
  if (error) throw error
  return (data || {}) as any
}

export async function useSnapLensOnce(snapLensId: string) {
  const { data, error } = await supabase.rpc('use_snap_lens_once', {
    p_snap_lens_id: snapLensId,
  })
  if (error) throw error
  return (data || {}) as any
}

export function getSnapLensUseCost(item?: SnapLensCatalogItem) {
  if (!item || item.access_type === 'free') return 0
  return Math.max(0, Math.floor(Number(item.coin_cost || 0)))
}

export function matchSnapLensCatalogItem(
  lens: Pick<Lens, 'id' | 'name'>,
  catalog: SnapLensCatalogItem[],
) {
  const lensName = normalizeLensText(lens.name)
  return catalog.find((item) => item.lens_id && item.lens_id === lens.id)
    || catalog.find((item) => {
      const candidates = [item.name_match, item.name_en, item.name_ar, item.id]
        .map(normalizeLensText)
        .filter(Boolean)
      return candidates.some((candidate) => (
        lensName.includes(candidate)
        || candidate.includes(lensName)
      ))
    })
}

export function shouldShowSnapLens(
  lens: Pick<Lens, 'name'>,
  item?: SnapLensCatalogItem,
  purchasedLensIds: Set<string> = new Set(),
) {
  void purchasedLensIds
  if (isLocallyBlockedSnapLens(lens)) return false
  if (!item) return true
  if (item.is_active === false || item.is_blocked === true) return false
  return true
}

export function snapLensPriceLabel(item?: SnapLensCatalogItem, ar = false) {
  const cost = getSnapLensUseCost(item)
  if (!item || cost <= 0) return ar ? 'مجاني' : 'Free'
  return ar ? `${cost} كوين/فيديو` : `${cost} / video`
}
