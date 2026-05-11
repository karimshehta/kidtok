import { AuthError } from '@supabase/supabase-js'

const ERROR_MAP_AR: Record<string, string> = {
  'Invalid login credentials': 'البريد أو كلمة المرور غير صحيحة',
  'Email not confirmed': 'لم يتم تأكيد البريد الإلكتروني بعد - تحقق من بريدك',
  'User already registered': 'هذا البريد الإلكتروني مسجل بالفعل',
  'Password should be at least 6 characters': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
  'Unable to validate email address: invalid format': 'صيغة البريد الإلكتروني غير صحيحة',
  'New password should be different from the old password': 'كلمة المرور الجديدة يجب أن تختلف عن القديمة',
  'Token has expired or is invalid': 'الرابط منتهي الصلاحية - اطلب رابط جديد',
  'For security purposes, you can only request this after': 'لأسباب أمنية، حاول مرة أخرى بعد قليل',
  'Email rate limit exceeded': 'تم تجاوز عدد محاولات إرسال البريد - حاول لاحقًا',
  'Email link is invalid or has expired': 'الرابط غير صالح أو منتهي الصلاحية',
  'User not found': 'لا يوجد حساب بهذا البريد الإلكتروني',
  'signup is disabled': 'التسجيل مغلق حاليًا',
}

export function translateAuthError(error: AuthError | Error | unknown, lang: 'ar' | 'en' = 'ar'): string {
  if (!(error instanceof Error)) return lang === 'ar' ? 'حدث خطأ غير متوقع' : 'Unexpected error'
  const msg = error.message

  if (lang === 'en') return msg

  // Exact match
  if (ERROR_MAP_AR[msg]) return ERROR_MAP_AR[msg]
  // Partial match (some Supabase messages have variable parts)
  for (const [key, value] of Object.entries(ERROR_MAP_AR)) {
    if (msg.startsWith(key)) return value
  }
  return msg
}
