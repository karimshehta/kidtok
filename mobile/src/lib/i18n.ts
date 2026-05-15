import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import * as Localization from 'expo-localization'
import AsyncStorage from '@react-native-async-storage/async-storage'

const resources = {
  ar: {
    translation: {
      // Common
      common: {
        loading: 'جارٍ التحميل...',
        save: 'حفظ',
        cancel: 'إلغاء',
        delete: 'حذف',
        edit: 'تعديل',
        confirm: 'تأكيد',
        error: 'حدث خطأ',
        success: 'تم بنجاح',
        retry: 'إعادة المحاولة',
        skip: 'تخطي',
        next: 'التالي',
        back: 'رجوع',
        done: 'تم',
        comingSoon: 'قريباً',
      },
      // Landing
      landing: {
        title: 'KidTok',
        subtitle: 'محتوى يوتيوب آمن لأطفالك',
        feature1: 'كنترول كامل على ما يشاهده طفلك',
        feature2: 'حدّ زمني يومي للمشاهدة',
        feature3: 'إحصائيات تفصيلية',
        getStarted: 'ابدأ الآن',
        haveAccount: 'لدي حساب بالفعل',
      },
      // Auth
      auth: {
        login: 'تسجيل الدخول',
        signup: 'إنشاء حساب',
        email: 'البريد الإلكتروني',
        password: 'كلمة المرور',
        name: 'الاسم',
        phone: 'رقم الموبايل',
        emailPlaceholder: 'example@email.com',
        passwordPlaceholder: 'كلمة المرور',
        forgotPassword: 'نسيت كلمة المرور؟',
        noAccount: 'ليس لديك حساب؟',
        haveAccount: 'لديك حساب بالفعل؟',
        loginCta: 'دخول',
        signupCta: 'إنشاء حساب',
        orContinueWith: 'أو تابع باستخدام',
        google: 'Google',
        invalidCredentials: 'البريد أو كلمة المرور غير صحيحة',
        loginSuccess: 'تم تسجيل الدخول بنجاح',
        signupSuccess: 'تم إنشاء الحساب! تحقق من بريدك',
      },
      // Tabs
      tabs: {
        feed: 'الرئيسية',
        search: 'بحث',
        children: 'أطفالي',
        profile: 'حسابي',
      },
      // Onboarding
      onboarding: {
        welcome: 'مرحباً في KidTok!',
        subtitle: 'محتوى آمن لأطفالك',
        watchAd: 'شاهد إعلاناً قصيراً',
        watchAdHint: 'احصل على عملات تستخدمها في الاشتراك',
        login: 'تسجيل الدخول',
        loginHint: 'وصول كامل لكل الميزات',
        skip: 'تصفح بدون حساب',
      },
      // Coins
      coins: {
        myCoins: 'رصيد العملات',
        watchAd: 'شاهد إعلان واكسب {{n}} عملة',
        earned: 'كسبت +{{n}} عملة! 🪙',
      },
      // Profile
      profile: {
        editProfile: 'تعديل الحساب',
        language: 'اللغة',
        logout: 'تسجيل الخروج',
        subscription: 'الاشتراك',
        free: 'مجاني',
        active: 'مفعّل',
      },
    },
  },
  en: {
    translation: {
      common: {
        loading: 'Loading...',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        confirm: 'Confirm',
        error: 'An error occurred',
        success: 'Success',
        retry: 'Retry',
        skip: 'Skip',
        next: 'Next',
        back: 'Back',
        done: 'Done',
        comingSoon: 'Coming Soon',
      },
      landing: {
        title: 'KidTok',
        subtitle: 'Safe YouTube content for your kids',
        feature1: 'Full control over what your child watches',
        feature2: 'Daily time limits',
        feature3: 'Detailed statistics',
        getStarted: 'Get Started',
        haveAccount: 'I already have an account',
      },
      auth: {
        login: 'Login',
        signup: 'Sign Up',
        email: 'Email',
        password: 'Password',
        name: 'Name',
        phone: 'Phone',
        emailPlaceholder: 'example@email.com',
        passwordPlaceholder: 'Password',
        forgotPassword: 'Forgot password?',
        noAccount: "Don't have an account?",
        haveAccount: 'Already have an account?',
        loginCta: 'Sign in',
        signupCta: 'Create account',
        orContinueWith: 'Or continue with',
        google: 'Google',
        invalidCredentials: 'Invalid email or password',
        loginSuccess: 'Logged in successfully',
        signupSuccess: 'Account created! Check your email',
      },
      tabs: {
        feed: 'Feed',
        search: 'Search',
        children: 'Children',
        profile: 'Profile',
      },
      onboarding: {
        welcome: 'Welcome to KidTok!',
        subtitle: 'Safe content for your kids',
        watchAd: 'Watch a short ad',
        watchAdHint: 'Earn coins to use toward subscriptions',
        login: 'Sign in',
        loginHint: 'Full access to all features',
        skip: 'Browse without account',
      },
      coins: {
        myCoins: 'My coins',
        watchAd: 'Watch ad & earn {{n}} coins',
        earned: 'You earned +{{n}} coins! 🪙',
      },
      profile: {
        editProfile: 'Edit profile',
        language: 'Language',
        logout: 'Logout',
        subscription: 'Subscription',
        free: 'Free',
        active: 'Active',
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
  await i18n.changeLanguage(lang)
  try { await AsyncStorage.setItem(LANG_KEY, lang) } catch {}
}

export { i18n }
