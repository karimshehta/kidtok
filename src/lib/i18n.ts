import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  ar: {
    translation: {
      // Common
      appName: 'KidTok',
      tagline: 'يوتيوب آمن للأطفال',
      loading: 'جارٍ التحميل...',
      save: 'حفظ',
      cancel: 'إلغاء',
      delete: 'حذف',
      edit: 'تعديل',
      back: 'رجوع',
      next: 'التالي',
      done: 'تم',
      yes: 'نعم',
      no: 'لا',
      exit: 'خروج',

      // Auth
      login: 'تسجيل الدخول',
      signup: 'إنشاء حساب',
      logout: 'تسجيل الخروج',
      phone: 'رقم الهاتف',
      password: 'كلمة المرور',
      forgotPassword: 'نسيت كلمة المرور؟',
      name: 'الاسم',

      // Home
      content: 'المحتوى',
      questions: 'الأسئلة',
      children: 'أطفالي',
      suggestedForYou: 'مقترح لك',
      yourContent: 'محتواك',
      createPlaylist: 'إنشاء قائمة',
      myPlaylists: 'قوائمي',

      // Child
      childMode: 'وضع الطفل',
      parentMode: 'وضع الوالدين',
      timeLimit: 'حد الوقت',
      remainingTime: 'الوقت المتبقي',
      enterParentPassword: 'أدخل كلمة مرور الوالدين',

      // Subscription
      subscription: 'الاشتراك',
      upgrade: 'ترقية',
      plans: 'الخطط',

      // Errors
      errorGeneric: 'حدث خطأ، حاول مرة أخرى',
      networkError: 'لا يوجد اتصال بالإنترنت',
    },
  },
  en: {
    translation: {
      appName: 'KidTok',
      tagline: 'Safe YouTube for kids',
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      back: 'Back',
      next: 'Next',
      done: 'Done',
      yes: 'Yes',
      no: 'No',
      exit: 'Exit',

      login: 'Login',
      signup: 'Sign up',
      logout: 'Logout',
      phone: 'Phone',
      password: 'Password',
      forgotPassword: 'Forgot password?',
      name: 'Name',

      content: 'Content',
      questions: 'Questions',
      children: 'My Kids',
      suggestedForYou: 'Suggested for you',
      yourContent: 'Your content',
      createPlaylist: 'Create playlist',
      myPlaylists: 'My playlists',

      childMode: 'Child Mode',
      parentMode: 'Parent Mode',
      timeLimit: 'Time limit',
      remainingTime: 'Remaining time',
      enterParentPassword: 'Enter parent password',

      subscription: 'Subscription',
      upgrade: 'Upgrade',
      plans: 'Plans',

      errorGeneric: 'Something went wrong, try again',
      networkError: 'No internet connection',
    },
  },
}

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('lang') || 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('lang', lng)
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = lng
})

// Initial direction
document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr'
document.documentElement.lang = i18n.language

export default i18n
