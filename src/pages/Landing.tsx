import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Shield, Clock, BarChart3, Sparkles } from 'lucide-react'
import KidTokLogo from '@/components/KidTokLogo'

export default function Landing() {
  const { t, i18n } = useTranslation()
  const toggleLang = () => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')

  const features = [
    { icon: Shield, key: 'feature1' },
    { icon: Clock, key: 'feature2' },
    { icon: BarChart3, key: 'feature3' },
    { icon: Sparkles, key: 'feature4' },
  ] as const

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-light via-neutral-200 to-white">
      <nav className="container mx-auto px-4 py-5 flex items-center justify-between">
        <KidTokLogo textClassName="text-2xl" markClassName="h-11 w-11" />
        <div className="flex items-center gap-3">
          <button onClick={toggleLang} className="text-sm font-medium text-neutral-700">
            {i18n.language === 'ar' ? 'EN' : 'عربي'}
          </button>
          <Link to="/login" className="text-primary font-semibold">{t('auth.login')}</Link>
          <Link to="/signup" className="btn-primary text-sm">{t('auth.signup')}</Link>
        </div>
      </nav>

      <section className="container mx-auto grid min-h-[calc(100vh-88px)] items-center gap-10 px-4 py-10 md:grid-cols-[1.05fr_0.95fr] md:py-14">
        <div className="text-center md:text-start">
          <h1 className="mb-5 text-4xl font-extrabold text-primary-dark md:text-6xl">
            {t('common.appName')}
          </h1>
          <p className="mb-3 text-2xl font-bold text-secondary md:text-3xl">
            {t('landing.heroTitle')}
          </p>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-neutral-700 md:mx-0 md:text-xl">
            {t('landing.heroSubtitle')}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row md:justify-start justify-center">
            <Link to="/signup" className="btn-primary text-lg">{t('landing.startFree')}</Link>
            <a href="#features" className="btn-outline text-lg">{t('landing.learnMore')}</a>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-4 rounded-[40px] bg-gradient-secondary opacity-70 blur-2xl" />
          <img
            src="/assets/kidtok-hero.jpg"
            alt="KidTok"
            className="relative aspect-[3/4] w-full rounded-[32px] object-cover shadow-[0_30px_70px_rgba(7,55,91,0.20)] ring-8 ring-white"
          />
        </div>
      </section>

      <section id="features" className="container mx-auto px-4 py-14">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div key={f.key} className="card text-center hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <f.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">{t(`landing.${f.key}Title`)}</h3>
              <p className="text-neutral-700 text-sm">{t(`landing.${f.key}Desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="bg-gradient-primary text-white rounded-3xl p-8 md:p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('landing.ctaTitle')}</h2>
          <p className="text-lg mb-6 opacity-90">{t('landing.ctaSubtitle')}</p>
          <Link to="/signup" className="inline-block bg-white text-primary-dark font-bold px-8 py-3 rounded-full hover:opacity-90 transition-opacity">
            {t('landing.ctaButton')}
          </Link>
        </div>
      </section>

      <footer className="container mx-auto px-4 py-8 text-center text-neutral-700 text-sm">{t('landing.footer')}</footer>
    </div>
  )
}
