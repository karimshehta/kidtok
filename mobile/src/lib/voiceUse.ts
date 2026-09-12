import { supabase } from '@/lib/supabase'

export type VoiceAccessMethod = 'free' | 'reward' | 'coins'

export interface VoiceUseReservation {
  eventId: string
  accessType: VoiceAccessMethod
  coinCost: number
  balance: number
  purchased: boolean
}

/**
 * The mobile release can safely keep working while the database migration and
 * the three new Edge Functions are rolled out.  Callers only fall back for a
 * genuine missing-function response; pricing/reward errors always remain
 * blocking and visible to the child.
 */
export class VoiceUseServiceUnavailableError extends Error {
  constructor(message = 'Voice purchase service is not deployed yet') {
    super(message)
    this.name = 'VoiceUseServiceUnavailableError'
  }
}

export function isVoiceUseServiceUnavailable(error: unknown) {
  return error instanceof VoiceUseServiceUnavailableError
}

export async function reserveKidVoiceUse({
  voiceId,
  accessMethod,
  ar,
}: {
  voiceId: string
  accessMethod?: VoiceAccessMethod | null
  ar: boolean
}): Promise<VoiceUseReservation> {
  const data = await invokeVoiceFunction('voice-use-reserve', {
    voice_id: voiceId,
    access_method: accessMethod || null,
  }, ar)

  const eventId = String(data?.use_event_id || '')
  if (!eventId) throw new Error(ar ? 'تعذر حجز الصوت الآن' : 'Could not reserve this voice')

  return {
    eventId,
    accessType: data.access_type as VoiceAccessMethod,
    coinCost: Number(data.coin_cost || 0),
    balance: Number(data.new_balance || 0),
    purchased: Boolean(data.purchased),
  }
}

export async function finalizeKidVoiceUse({
  creatorVideoId,
  eventId,
  ar,
}: {
  creatorVideoId: string
  eventId?: string | null
  ar: boolean
}) {
  await invokeVoiceFunction('voice-use-finalize', {
    creator_video_id: creatorVideoId,
    event_id: eventId || null,
  }, ar)
}

export async function releaseKidVoiceUse(eventId: string) {
  await invokeVoiceFunction('voice-use-release', { event_id: eventId }, false)
}

async function invokeVoiceFunction(name: string, body: Record<string, unknown>, ar: boolean) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data

  const details = await getFunctionErrorDetails(error)
  if (details.status === 404 && !details.code) {
    throw new VoiceUseServiceUnavailableError()
  }
  if (details.status === 404 && /function|not found|relay/i.test(details.message)) {
    throw new VoiceUseServiceUnavailableError()
  }

  throw new Error(voiceErrorMessage(details.code, details.message, ar))
}

async function getFunctionErrorDetails(error: any): Promise<{ status?: number; code?: string; message: string }> {
  const context = error?.context
  const status = typeof context?.status === 'number' ? context.status : undefined
  let payload: any = null

  try {
    if (context && typeof context.clone === 'function') {
      payload = await context.clone().json()
    }
  } catch {
    // A relay/network error has no JSON body. The original error still gives a
    // useful diagnostic and must not be treated as a paid-access success.
  }

  return {
    status,
    code: payload?.error?.code || payload?.code,
    message: String(payload?.error?.message || payload?.message || error?.message || 'Voice request failed'),
  }
}

function voiceErrorMessage(code: string | undefined, fallback: string, ar: boolean) {
  const messages: Record<string, [string, string]> = {
    INSUFFICIENT_COINS: ['You need more coins for this voice.', 'تحتاج كوينز أكثر لاختيار هذا الصوت.'],
    REWARDED_AD_REQUIRED: ['Watch a rewarded ad to use this voice once.', 'شاهد إعلان Reward لاستخدام هذا الصوت مرة واحدة.'],
    VOICE_REWARD_ONLY: ['This voice is unlocked by a rewarded ad only.', 'هذا الصوت يفتح بإعلان Reward فقط.'],
    VOICE_PRICE_NOT_CONFIGURED: ['This voice price is not ready yet.', 'سعر هذا الصوت غير جاهز حاليًا.'],
    VOICE_NOT_FOUND: ['This voice is unavailable right now.', 'هذا الصوت غير متاح حاليًا.'],
    VOICE_USE_REFUNDED: ['This voice reservation was released. Please choose it again.', 'تم إلغاء حجز هذا الصوت، اختره مرة أخرى.'],
  }
  const message = code ? messages[code] : undefined
  return message ? (ar ? message[1] : message[0]) : fallback
}
