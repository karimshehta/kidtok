import { supabase } from '@/lib/supabase'

export interface CreatorUploadQuota {
  plan_code: string
  upload_limit: number
  used_uploads: number
  remaining_uploads: number
  cycle_start: string
  cycle_end: string
}

export interface CreatorUploadOptions extends CreatorUploadQuota {
  extra_upload_credits: number
  extra_upload_coin_cost: number
  coin_balance: number
  coins_per_ad: number
  can_upload: boolean
  extra_upload_purchase_available: boolean
}

export class CreatorUploadLimitError extends Error {
  options: CreatorUploadOptions | null

  constructor(message: string, options: CreatorUploadOptions | null = null) {
    super(message)
    this.name = 'CreatorUploadLimitError'
    this.options = options
  }
}

const missingQuotaRpc = (message: string) =>
  message.includes('my_creator_upload_quota') ||
  message.includes('get_creator_upload_quota') ||
  message.includes('Could not find the function')

const missingExtraUploadRpc = (message: string) =>
  message.includes('my_creator_upload_options') ||
  message.includes('buy_creator_extra_upload_credit') ||
  message.includes('Could not find the function') ||
  message.includes('schema cache')

export async function fetchCreatorUploadQuota(): Promise<CreatorUploadQuota | null> {
  const { data, error } = await supabase.rpc('my_creator_upload_quota')
  if (error) {
    const msg = String(error.message || '')
    if (missingQuotaRpc(msg)) {
      console.warn('[creator-upload-quota] RPC is not deployed yet; falling back to server enforcement.')
      return null
    }
    throw error
  }

  const rows = Array.isArray(data) ? data : data ? [data] : []
  return (rows[0] as CreatorUploadQuota | undefined) ?? null
}

function normalizeUploadOptions(value: any): CreatorUploadOptions | null {
  if (!value || typeof value !== 'object') return null
  const uploadLimit = Math.max(0, Number(value.upload_limit || 0))
  const usedUploads = Math.max(0, Number(value.used_uploads || 0))
  const remainingUploads = Math.max(0, Number(value.remaining_uploads || 0))
  const extraCredits = Math.max(0, Number(value.extra_upload_credits || 0))
  const coinCost = Math.max(0, Number(value.extra_upload_coin_cost || 0))

  return {
    plan_code: String(value.plan_code || 'free'),
    upload_limit: uploadLimit,
    used_uploads: usedUploads,
    remaining_uploads: remainingUploads,
    cycle_start: String(value.cycle_start || ''),
    cycle_end: String(value.cycle_end || ''),
    extra_upload_credits: extraCredits,
    extra_upload_coin_cost: coinCost,
    coin_balance: Math.max(0, Number(value.coin_balance || 0)),
    coins_per_ad: Math.max(1, Number(value.coins_per_ad || 5)),
    can_upload: value.can_upload === true || remainingUploads > 0 || extraCredits > 0,
    extra_upload_purchase_available:
      value.extra_upload_purchase_available !== false && coinCost > 0,
  }
}

/**
 * Reads the complete, server-authoritative upload gate state. Older production
 * databases fall back to the existing quota RPC so an OTA update cannot break
 * uploads while the additive migration is still being rolled out.
 */
export async function fetchCreatorUploadOptions(): Promise<CreatorUploadOptions | null> {
  const { data, error } = await supabase.rpc('my_creator_upload_options')
  if (!error) return normalizeUploadOptions(Array.isArray(data) ? data[0] : data)

  const message = String(error.message || '')
  if (!missingExtraUploadRpc(message)) throw error

  const quota = await fetchCreatorUploadQuota()
  if (!quota) return null
  return {
    ...quota,
    extra_upload_credits: 0,
    extra_upload_coin_cost: 0,
    coin_balance: 0,
    coins_per_ad: 5,
    can_upload: quota.remaining_uploads > 0,
    extra_upload_purchase_available: false,
  }
}

export async function buyCreatorExtraUploadCredit(): Promise<{
  purchased: boolean
  coin_cost: number
  new_balance: number
  extra_upload_credits: number
}> {
  const { data, error } = await supabase.rpc('buy_creator_extra_upload_credit')
  if (error) throw error
  const value = Array.isArray(data) ? data[0] : data
  return {
    purchased: value?.purchased !== false,
    coin_cost: Math.max(0, Number(value?.coin_cost || 0)),
    new_balance: Math.max(0, Number(value?.new_balance || 0)),
    extra_upload_credits: Math.max(0, Number(value?.extra_upload_credits || 0)),
  }
}

export function creatorUploadLimitMessage(quota: CreatorUploadQuota | null | undefined, ar: boolean) {
  const limit = quota?.upload_limit ?? 0
  return ar
    ? `وصلت لحد رفع أو تصوير الفيديوهات في باقتك (${limit} فيديو كل 30 يوم).`
    : `You reached your plan upload/recording limit (${limit} videos every 30 days).`
}

export async function ensureCreatorUploadQuota(ar: boolean) {
  const options = await fetchCreatorUploadOptions()
  if (options && !options.can_upload) {
    throw new CreatorUploadLimitError(creatorUploadLimitMessage(options, ar), options)
  }
  return options
}

export function isCreatorUploadLimitError(error: unknown): error is CreatorUploadLimitError {
  return error instanceof CreatorUploadLimitError ||
    (error instanceof Error && error.name === 'CreatorUploadLimitError')
}

export async function creatorUploadFunctionErrorMessage(error: any, ar: boolean) {
  let msg = String(error?.message || (ar ? 'حدث خطأ' : 'Something went wrong'))
  let code = ''

  try {
    const ctx = error?.context
    const body = typeof ctx?.clone === 'function'
      ? await ctx.clone().json()
      : typeof ctx?.json === 'function'
        ? await ctx.json()
        : ctx
    code = String(body?.error?.code || body?.code || '')
    msg = String(body?.error?.message || body?.message || msg)
  } catch {}

  if (code === 'PLAN_UPLOAD_LIMIT_REACHED' || msg.includes('PLAN_UPLOAD_LIMIT_REACHED')) {
    return ar
      ? 'وصلت لحد رفع أو تصوير الفيديوهات في باقتك لهذا الشهر.'
      : 'You reached your plan upload/recording limit for this month.'
  }

  return msg
}
