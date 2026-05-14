/**
 * GET /functions/v1/app-config
 *
 * Called by the mobile app on EVERY launch (before auth).
 * Returns version requirements and maintenance mode.
 *
 * NO JWT REQUIRED — this must be reachable before the user logs in.
 *
 * Response shape:
 * {
 *   maintenance: { enabled: boolean, message_ar: string, message_en: string },
 *   android:  { min_version: string, current_version: string, store_url: string },
 *   ios:      { min_version: string, current_version: string, store_url: string },
 *   force_update: { message_ar: string, message_en: string },
 *   fetched_at: string  // ISO timestamp for cache-busting
 * }
 */

import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/supabase.ts'

// Allow GET and OPTIONS only
Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const admin = getServiceClient()

  const { data: rows, error } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'app_min_android_version',
      'app_current_android_version',
      'app_android_store_url',
      'app_min_ios_version',
      'app_current_ios_version',
      'app_ios_store_url',
      'app_force_update_message_ar',
      'app_force_update_message_en',
      'app_maintenance_mode',
      'app_maintenance_message_ar',
      'app_maintenance_message_en',
    ])

  if (error) {
    console.error('app-config: db error', error)
    // Return safe defaults so the app doesn't block on DB failure
    return jsonResponse(defaultConfig())
  }

  const s: Record<string, string> = {}
  for (const r of rows || []) s[r.key] = r.value ?? ''

  return jsonResponse({
    maintenance: {
      enabled: s['app_maintenance_mode'] === 'true',
      message_ar: s['app_maintenance_message_ar'] || 'التطبيق في وضع الصيانة.',
      message_en: s['app_maintenance_message_en'] || 'Under maintenance.',
    },
    android: {
      min_version: s['app_min_android_version'] || '1.0.0',
      current_version: s['app_current_android_version'] || '1.0.0',
      store_url: s['app_android_store_url'] || '',
    },
    ios: {
      min_version: s['app_min_ios_version'] || '1.0.0',
      current_version: s['app_current_ios_version'] || '1.0.0',
      store_url: s['app_ios_store_url'] || '',
    },
    force_update: {
      message_ar: s['app_force_update_message_ar'] || 'يرجى تحديث التطبيق.',
      message_en: s['app_force_update_message_en'] || 'Please update the app.',
    },
    fetched_at: new Date().toISOString(),
  })
})

function defaultConfig() {
  return {
    maintenance: { enabled: false, message_ar: '', message_en: '' },
    android: { min_version: '1.0.0', current_version: '1.0.0', store_url: '' },
    ios: { min_version: '1.0.0', current_version: '1.0.0', store_url: '' },
    force_update: { message_ar: '', message_en: '' },
    fetched_at: new Date().toISOString(),
  }
}
