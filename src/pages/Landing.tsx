import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Shield, Clock, BarChart3, Sparkles } from 'lucide-react'

export default function Landing() {
  const { t, i18n } = useTranslation()

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')
  }

  const features = [
    { icon: Shield, title: 'محتوى آمن 100%', desc: 'فيديوهات مفلترة ومناسبة لطفلك' },
    { icon: Clock, title: 'حدود زمنية', desc: 'تحكّم في وقت الاستخدام اليومي والأسبوعي' },
    { icon: BarChart3, title: 'إحصائيات تفصيلية', desc: 'تابع ما يشاهده طفلك في أي وقت' },
    { icon: Sparkles, title: 'قوائم مخصصة', desc: 'أنشئ قوائم تشغيل خاصة لكل طفل' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-light via-white to-white">
      {/* Nav */}
      <nav className="container mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
            K
          </div>
          <span className="text-2xl font-bold text-primary-dark">{t('appName')}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleLang} className="text-sm font-medium text-neutral-700">
            {i18n.language === 'ar' ? 'EN' : 'عربي'}
          </button>
          <Link to="/login" className="text-primary font-semibold">
            {t('login')}
          </Link>
          <Link to="/signup" className="btn-primary text-sm">
            {t('signup')}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-4 py-16 md:py-24 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-primary-dark mb-6">
          {t('appName')} <span className="text-secondary">🎈</span>
        </h1>
        <p className="text-xl md:text-2xl text-neutral-700 mb-8 max-w-2xl mx-auto">
          {t('tagline')} - تجربة مشاهدة آمنة وممتعة، مع تحكم كامل للوالدين
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/signup" className="btn-primary text-lg">
            ابدأ مجانًا
          </Link>
          <a href="#features" className="btn-outline text-lg">
            اعرف أكثر
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <div key={i} className="card text-center hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <f.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-neutral-700 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-16">
        <div className="bg-gradient-primary text-white rounded-3xl p-8 md:p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">جاهز لتجربة آمنة لطفلك؟</h2>
          <p className="text-lg mb-6 opacity-90">انضم لآلاف الآباء الذين يثقون في KidTok</p>
          <Link to="/signup" className="inline-block bg-white text-primary-dark font-bold px-8 py-3 rounded-full hover:opacity-90 transition-opacity">
            ابدأ الآن
          </Link>
        </div>
      </section>

      <footer className="container mx-auto px-4 py-8 text-center text-neutral-700 text-sm">
        © 2026 KidTok. كل الحقوق محفوظة.
      </footer>
    </div>
  )
}
