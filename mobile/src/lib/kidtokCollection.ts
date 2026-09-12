import { supabase } from '@/lib/supabase'

export type KidTokTheme = {
  id: string
  name_ar: string
  name_en: string
  description_ar: string
  description_en: string
  emoji: string
  gradient: string[]
  accent_color: string
  animation_key: string
  coin_cost: number
  is_free: boolean
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
  sort_order: number
  owned: boolean
  equipped: boolean
}

export type KidTokMission = {
  id: string
  scope: 'daily' | 'weekly'
  period_key: string
  target: number
  progress: number
  raw_progress: number
  reward_coins: number
  completed: boolean
  claimed: boolean
  title_ar: string
  title_en: string
  description_ar: string
  description_en: string
}

export type ProfileFrameItem = {
  id: string
  name_ar: string
  name_en: string
  gradient: string[]
  icon: string
  required_level: number
  tier_order: number
  coin_cost: number
  is_free: boolean
  owned: boolean
}

export type KidTokCollection = {
  success: boolean
  coin_balance: number
  progress: any
  frames: ProfileFrameItem[]
  current_frame_id: string | null
  themes: KidTokTheme[]
  badges: any[]
  badge_metrics: Record<string, number>
  missions: KidTokMission[]
}

const EMPTY_COLLECTION: KidTokCollection = {
  success: false,
  coin_balance: 0,
  progress: null,
  frames: [],
  current_frame_id: null,
  themes: [],
  badges: [],
  badge_metrics: {},
  missions: [],
}

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeTheme(theme: any): KidTokTheme | null {
  if (!theme || typeof theme.id !== 'string') return null
  return {
    id: theme.id,
    name_ar: String(theme.name_ar || ''),
    name_en: String(theme.name_en || ''),
    description_ar: String(theme.description_ar || ''),
    description_en: String(theme.description_en || ''),
    emoji: String(theme.emoji || '🎨'),
    gradient: Array.isArray(theme.gradient) && theme.gradient.length
      ? theme.gradient.map(String)
      : ['#22D3EE', '#F96286'],
    accent_color: String(theme.accent_color || '#F96286'),
    animation_key: String(theme.animation_key || 'sparkle'),
    coin_cost: Math.max(0, asNumber(theme.coin_cost)),
    is_free: theme.is_free === true,
    rarity: ['common', 'rare', 'epic', 'legendary', 'mythic'].includes(theme.rarity)
      ? theme.rarity
      : 'common',
    sort_order: asNumber(theme.sort_order),
    owned: theme.owned === true,
    equipped: theme.equipped === true,
  }
}

function normalizeMission(mission: any): KidTokMission | null {
  if (!mission || typeof mission.id !== 'string') return null
  return {
    id: mission.id,
    scope: mission.scope === 'weekly' ? 'weekly' : 'daily',
    period_key: String(mission.period_key || ''),
    target: Math.max(1, asNumber(mission.target, 1)),
    progress: Math.max(0, asNumber(mission.progress)),
    raw_progress: Math.max(0, asNumber(mission.raw_progress ?? mission.progress)),
    reward_coins: Math.max(1, asNumber(mission.reward_coins, 1)),
    completed: mission.completed === true,
    claimed: mission.claimed === true,
    title_ar: String(mission.title_ar || ''),
    title_en: String(mission.title_en || ''),
    description_ar: String(mission.description_ar || ''),
    description_en: String(mission.description_en || ''),
  }
}

const DEFAULT_PROFILE_FRAMES: ProfileFrameItem[] = [
  {
    id: 'bronze',
    name_ar: 'برونزي',
    name_en: 'Bronze',
    gradient: ['#B45309', '#F59E0B', '#92400E'],
    icon: '🥉',
    required_level: 1,
    tier_order: 1,
    coin_cost: 0,
    is_free: true,
    owned: true,
  },
  {
    id: 'silver',
    name_ar: 'فضي',
    name_en: 'Silver',
    gradient: ['#94A3B8', '#F8FAFC', '#64748B'],
    icon: '🥈',
    required_level: 2,
    tier_order: 2,
    coin_cost: 40,
    is_free: false,
    owned: false,
  },
  {
    id: 'gold',
    name_ar: 'ذهبي',
    name_en: 'Gold',
    gradient: ['#F59E0B', '#FDE68A', '#D97706'],
    icon: '🥇',
    required_level: 3,
    tier_order: 3,
    coin_cost: 80,
    is_free: false,
    owned: false,
  },
  {
    id: 'diamond',
    name_ar: 'ألماسي',
    name_en: 'Diamond',
    gradient: ['#22D3EE', '#DBEAFE', '#7C3AED'],
    icon: '💎',
    required_level: 5,
    tier_order: 4,
    coin_cost: 120,
    is_free: false,
    owned: false,
  },
  {
    id: 'legendary',
    name_ar: 'أسطوري',
    name_en: 'Legendary',
    gradient: ['#7C3AED', '#F97316', '#F43F5E'],
    icon: '👑',
    required_level: 7,
    tier_order: 5,
    coin_cost: 180,
    is_free: false,
    owned: false,
  },
]

function normalizeFrame(frame: any): ProfileFrameItem | null {
  if (!frame || typeof frame.id !== 'string') return null
  return {
    id: frame.id,
    name_ar: String(frame.name_ar || ''),
    name_en: String(frame.name_en || ''),
    gradient: Array.isArray(frame.gradient) && frame.gradient.length
      ? frame.gradient.map(String)
      : ['#22D3EE', '#F96286'],
    icon: String(frame.icon || '🖼️'),
    required_level: Math.max(1, asNumber(frame.required_level, 1)),
    tier_order: asNumber(frame.tier_order),
    coin_cost: Math.max(0, asNumber(frame.coin_cost)),
    is_free: frame.is_free === true,
    owned: frame.owned === true || frame.is_free === true,
  }
}

function normalizeFrames(frames: any): ProfileFrameItem[] {
  const normalized = Array.isArray(frames)
    ? frames.map(normalizeFrame).filter(Boolean) as ProfileFrameItem[]
    : []
  if (normalized.length > 0) return normalized
  return DEFAULT_PROFILE_FRAMES
}

export async function getMyKidTokCollection(): Promise<KidTokCollection> {
  const { data, error } = await supabase.rpc('get_my_kidtok_collection')
  if (error || !data || typeof data !== 'object') return EMPTY_COLLECTION

  const raw = data as any
  return {
    success: raw.success === true,
    coin_balance: Math.max(0, asNumber(raw.coin_balance)),
    progress: raw.progress || null,
    frames: normalizeFrames(raw.frames),
    current_frame_id: typeof raw.current_frame_id === 'string' ? raw.current_frame_id : null,
    themes: Array.isArray(raw.themes)
      ? raw.themes.map(normalizeTheme).filter(Boolean) as KidTokTheme[]
      : [],
    badges: Array.isArray(raw.badges) ? raw.badges : [],
    badge_metrics: raw.badge_metrics && typeof raw.badge_metrics === 'object' ? raw.badge_metrics : {},
    missions: Array.isArray(raw.missions)
      ? raw.missions.map(normalizeMission).filter(Boolean) as KidTokMission[]
      : [],
  }
}

export async function purchaseAndEquipProfileTheme(themeId: string) {
  const { data, error } = await supabase.rpc('purchase_and_equip_profile_theme', {
    p_theme_id: themeId,
  })
  if (error) throw error
  return (data || {}) as any
}

export async function purchaseAndEquipProfileFrame(frameId: string) {
  const { data, error } = await supabase.rpc('purchase_and_equip_profile_frame', {
    p_frame_id: frameId,
  })
  if (error) throw error
  return (data || {}) as any
}

export async function unequipMyProfileTheme() {
  const { data, error } = await supabase.rpc('unequip_my_profile_theme')
  if (error) throw error
  return (data || {}) as any
}

export async function unequipMyProfileFrame() {
  const { data, error } = await supabase.rpc('unequip_my_profile_frame')
  if (error) throw error
  return (data || {}) as any
}

export async function claimKidTokMission(missionId: string) {
  const { data, error } = await supabase.rpc('claim_kidtok_mission', {
    p_mission_id: missionId,
  })
  if (error) throw error
  return (data || {}) as any
}
