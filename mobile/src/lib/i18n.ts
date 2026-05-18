import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import * as Localization from 'expo-localization'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { I18nManager } from 'react-native'

const resources = {
  ar: {
    translation: {
      common: {
        loading: 'جارٍ التحميل...', save: 'حفظ', cancel: 'إلغاء', delete: 'حذف',
        edit: 'تعديل', confirm: 'تأكيد', error: 'حدث خطأ', success: 'تم بنجاح',
        retry: 'إعادة المحاولة', skip: 'تخطي', next: 'التالي', back: 'رجوع',
        done: 'تم', comingSoon: 'قريباً', user: 'مستخدم',
      },
      lang: { arabic: 'العربية', english: 'English' },
      landing: {
        title: 'KidTok', subtitle: 'محتوى يوتيوب آمن لأطفالك',
        feature1: 'كنترول كامل على ما يشاهده طفلك',
        feature2: 'حدّ زمني يومي للمشاهدة', feature3: 'إحصائيات تفصيلية',
        getStarted: 'ابدأ الآن', haveAccount: 'لدي حساب بالفعل',
      },
      auth: {
        login: 'تسجيل الدخول', signup: 'إنشاء حساب', email: 'البريد الإلكتروني',
        password: 'كلمة المرور', name: 'الاسم', phone: 'رقم الموبايل',
        emailPlaceholder: 'example@email.com', passwordPlaceholder: 'كلمة المرور',
        forgotPassword: 'نسيت كلمة المرور؟', noAccount: 'ليس لديك حساب؟',
        haveAccount: 'لديك حساب بالفعل؟', loginCta: 'دخول', signupCta: 'إنشاء حساب',
        orContinueWith: 'أو تابع باستخدام', google: 'Google',
        invalidCredentials: 'البريد أو كلمة المرور غير صحيحة',
        loginSuccess: 'تم تسجيل الدخول بنجاح',
        signupSuccess: 'تم إنشاء الحساب! تحقق من بريدك',
      },
      tabs: { feed: 'الرئيسية', search: 'بحث', children: 'أطفالي', profile: 'حسابي' },
      onboarding: {
        welcome: 'مرحباً في KidTok!', subtitle: 'محتوى آمن لأطفالك',
        watchAd: 'شاهد إعلاناً قصيراً', watchAdHint: 'احصل على عملات تستخدمها في الاشتراك',
        login: 'تسجيل الدخول', loginHint: 'وصول كامل لكل الميزات', skip: 'تصفح بدون حساب',
      },
      coins: { myCoins: 'رصيد العملات', watchAd: 'شاهد إعلان واكسب {{n}} عملة', earned: 'كسبت +{{n}} عملة! 🪙' },
      profile: {
        editProfile: 'تعديل الحساب', language: 'اللغة', logout: 'تسجيل الخروج',
        subscription: 'الاشتراك', free: 'مجاني', active: 'مفعّل',
        settings: 'الإعدادات', tapToChangePhoto: 'اضغط لتغيير الصورة',
      },
      username: {
        label: 'اسم المستخدم', placeholder: 'kidtok',
        hint: 'اختر اسم مميز يعرفك به الجميع',
        checking: 'جاري التحقق...', available: 'هذا الاسم متاح ✅',
        taken: 'هذا الاسم مأخوذ ❌', invalid: '3-30 حرف: أحرف إنجليزية، أرقام، شرطة سفلية',
        takenError: 'هذا الاسم مأخوذ، اختر اسماً آخر', invalidError: 'الاسم غير صالح (3-30 حرف)',
        addHandle: 'أضف اسم مستخدم @',
      },
      search: {
        videos: '🎬 فيديوهات', users: '👤 مستخدمين',
        searchYoutube: 'ابحث في YouTube...', searchUsers: 'ابحث بالاسم أو @username',
        noUsers: 'لا يوجد مستخدمون بهذا الاسم',
        followers: 'متابع', following: 'أتابع', videos_count: 'فيديو',
        pickChild: 'اختر طفلاً', noChildren: 'لم تضف أطفالاً بعد',
        pickPlaylist: 'اختر قائمة', noPlaylists: 'لا توجد قوائم لهذا الطفل',
        addVideo: 'إضافة', added: '✓ تمت الإضافة', adding: 'جاري الإضافة...',
        searchError: 'فشل البحث', addSuccess: '✓ أُضيف إلى', newPlaylist: '+ قائمة جديدة',
      },
      creator: {
        myVideos: 'فيديوهاتي', followers: 'متابع', following: 'أتابع',
        editProfile: 'تعديل الحساب', follow: 'متابعة', unfollow: 'إلغاء المتابعة',
        noVideos: 'لا توجد فيديوهات بعد', upload: '📹 رفع',
      },
    },
  },
  en: {
    translation: {
      common: {
        loading: 'Loading...', save: 'Save', cancel: 'Cancel', delete: 'Delete',
        edit: 'Edit', confirm: 'Confirm', error: 'An error occurred', success: 'Success',
        retry: 'Retry', skip: 'Skip', next: 'Next', back: 'Back', done: 'Done',
        comingSoon: 'Coming Soon', user: 'User',
      },
      lang: { arabic: 'العربية', english: 'English' },
      landing: {
        title: 'KidTok', subtitle: 'Safe YouTube content for your kids',
        feature1: 'Full control over what your child watches',
        feature2: 'Daily time limits', feature3: 'Detailed statistics',
        getStarted: 'Get Started', haveAccount: 'I already have an account',
      },
      auth: {
        login: 'Login', signup: 'Sign Up', email: 'Email', password: 'Password',
        name: 'Name', phone: 'Phone', emailPlaceholder: 'example@email.com',
        passwordPlaceholder: 'Password', forgotPassword: 'Forgot password?',
        noAccount: "Don't have an account?", haveAccount: 'Already have an account?',
        loginCta: 'Sign in', signupCta: 'Create account', orContinueWith: 'Or continue with',
        google: 'Google', invalidCredentials: 'Invalid email or password',
        loginSuccess: 'Logged in successfully', signupSuccess: 'Account created! Check your email',
      },
      tabs: { feed: 'Feed', search: 'Search', children: 'Children', profile: 'Profile' },
      onboarding: {
        welcome: 'Welcome to KidTok!', subtitle: 'Safe content for your kids',
        watchAd: 'Watch a short ad', watchAdHint: 'Earn coins to use toward subscriptions',
        login: 'Sign in', loginHint: 'Full access to all features', skip: 'Browse without account',
      },
      coins: { myCoins: 'My coins', watchAd: 'Watch ad & earn {{n}} coins', earned: 'You earned +{{n}} coins! 🪙' },
      profile: {
        editProfile: 'Edit profile', language: 'Language', logout: 'Logout',
        subscription: 'Subscription', free: 'Free', active: 'Active',
        settings: 'Settings', tapToChangePhoto: 'Tap to change photo',
      },
      username: {
        label: 'Username', placeholder: 'kidtok',
        hint: 'Choose a unique name others can find you by',
        checking: 'Checking...', available: 'Username available ✅',
        taken: 'Username taken ❌', invalid: '3-30 chars: lowercase, numbers, underscores',
        takenError: 'Username taken, choose another', invalidError: 'Invalid username (3-30 chars)',
        addHandle: 'Add @username',
      },
      search: {
        videos: '🎬 Videos', users: '👤 Users',
        searchYoutube: 'Search YouTube...', searchUsers: 'Search by name or @username',
        noUsers: 'No users found',
        followers: 'followers', following: 'following', videos_count: 'videos',
        pickChild: 'Select a child', noChildren: 'No children added yet',
        pickPlaylist: 'Select a playlist', noPlaylists: 'No playlists for this child',
        addVideo: 'Add', added: '✓ Added', adding: 'Adding...',
        searchError: 'Search failed', addSuccess: '✓ Added to', newPlaylist: '+ New playlist',
      },
      creator: {
        myVideos: 'My Videos', followers: 'followers', following: 'following',
        editProfile: 'Edit Profile', follow: 'Follow', unfollow: 'Unfollow',
        noVideos: 'No videos yet', upload: '📹 Upload',
      },
    },
  },
}

const LANG_KEY = 'kidtok_lang_v1'

async function getInitialLang(): Promise<'ar' | 'en'> {
  try {
    const saved = await AsyncStorage.getItem(LANG_KEY)
    if (saved === 'ar' || saved === 'en') return saved
  } catch {}
  const locale = Localization.getLocales()[0]?.languageCode
  return locale === 'ar' ? 'ar' : 'en'
}

export async function initI18n() {
  const lang = await getInitialLang()
  await i18n.use(initReactI18next).init({
    resources,
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
  })
  return lang
}

export async function setLanguage(lang: 'ar' | 'en') {
  try { await AsyncStorage.setItem(LANG_KEY, lang) } catch {}
  const shouldBeRTL = lang === 'ar'
  I18nManager.allowRTL(shouldBeRTL)
  I18nManager.forceRTL(shouldBeRTL)
  await i18n.changeLanguage(lang)
}

export { i18n }
