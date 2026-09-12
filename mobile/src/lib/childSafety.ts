import AsyncStorage from '@react-native-async-storage/async-storage'

export type ChildSafetySurface = 'video' | 'comment'

const SAFETY_REMINDER_VERSION = 'v1'
const SAFETY_REMINDER_PREFIX = `kidtok-child-safety:${SAFETY_REMINDER_VERSION}`

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function keyFor(userId: string | null | undefined, surface: ChildSafetySurface) {
  return `${SAFETY_REMINDER_PREFIX}:${userId || 'guest'}:${surface}:${todayKey()}`
}

export async function hasSeenChildSafetyReminder(
  userId: string | null | undefined,
  surface: ChildSafetySurface,
) {
  try {
    return (await AsyncStorage.getItem(keyFor(userId, surface))) === '1'
  } catch {
    return false
  }
}

export async function markChildSafetyReminderSeen(
  userId: string | null | undefined,
  surface: ChildSafetySurface,
) {
  try {
    await AsyncStorage.setItem(keyFor(userId, surface), '1')
  } catch {
    // The reminder is still shown in-memory; storage failure should never
    // block publishing or commenting.
  }
}

function normalizeDigits(value: string) {
  const arabic = '٠١٢٣٤٥٦٧٨٩'
  const persian = '۰۱۲۳۴۵۶۷۸۹'
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arIndex = arabic.indexOf(digit)
    if (arIndex >= 0) return String(arIndex)
    const faIndex = persian.indexOf(digit)
    return faIndex >= 0 ? String(faIndex) : digit
  })
}

export function detectPersonalInfoRisk(text: string) {
  const raw = text.trim()
  if (!raw) return null

  const normalized = normalizeDigits(raw).toLowerCase()
  const compactDigits = normalized.replace(/[^\d]/g, '')

  const checks: Array<{ id: string; labelEn: string; labelAr: string; test: boolean }> = [
    {
      id: 'phone',
      labelEn: 'phone number',
      labelAr: 'رقم هاتف',
      test: compactDigits.length >= 8,
    },
    {
      id: 'email',
      labelEn: 'email address',
      labelAr: 'بريد إلكتروني',
      test: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(normalized),
    },
    {
      id: 'link',
      labelEn: 'website or social link',
      labelAr: 'رابط أو حساب تواصل',
      test: /\b(https?:\/\/|www\.|wa\.me|t\.me|snapchat|instagram|facebook|whatsapp|telegram)\b/i.test(normalized),
    },
    {
      id: 'address',
      labelEn: 'home, school, or address details',
      labelAr: 'عنوان البيت أو المدرسة',
      test: /\b(address|street|school|class|grade|home|house|apartment|building|road)\b/i.test(normalized) ||
        /(العنوان|عنوان|شارع|مدرسة|فصل|صف|بيت|منزل|شقة|عمارة|طريق)/.test(normalized),
    },
    {
      id: 'handle',
      labelEn: 'social handle',
      labelAr: 'اسم حساب تواصل',
      test: /(^|\s)@[a-z0-9_.]{3,}/i.test(normalized),
    },
  ]

  return checks.find((item) => item.test) || null
}

export function hasPersonalInfoRisk(text: string) {
  return !!detectPersonalInfoRisk(text)
}
