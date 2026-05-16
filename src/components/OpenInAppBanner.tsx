import { useEffect, useState } from 'react'
import { Smartphone, X, Download } from 'lucide-react'

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.kidtok.app'
const APP_STORE_URL = 'https://apps.apple.com/app/kidtok/id000000000' // Replace when iOS app is live

/**
 * Shows a banner on /auth/callback and /reset-password pages if the user
 * is on a mobile device. Lets them either:
 * - Open in the KidTok app (if installed → universal link will catch it)
 * - Download the app from the Play Store / App Store
 */
export default function OpenInAppBanner() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = navigator.userAgent || ''
    const isAndroid = /Android/i.test(ua)
    const isIos = /iPhone|iPad|iPod/i.test(ua)
    // Don't show if user already dismissed in this session
    if (sessionStorage.getItem('kidtok_open_in_app_dismissed') === '1') return
    if (isAndroid) { setPlatform('android'); setShow(true) }
    else if (isIos) { setPlatform('ios'); setShow(true) }
  }, [])

  if (!show || !platform) return null

  const storeUrl = platform === 'android' ? PLAY_STORE_URL : APP_STORE_URL

  const openApp = () => {
    // The current URL is a universal link (kidtok.vercel.app/auth/...).
    // If the app is installed, Android/iOS already intercepted it before
    // we got here. So if we're seeing this banner, the app probably isn't
    // installed — send them to the store.
    window.location.href = storeUrl
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #03BBE5, #F96286)',
        color: 'white',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'rgba(255,255,255,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Smartphone size={24} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>افتح في تطبيق KidTok</div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>تجربة أفضل على الموبايل</div>
      </div>

      <button
        onClick={openApp}
        style={{
          background: 'white',
          color: '#03BBE5',
          border: 'none',
          borderRadius: 999,
          padding: '8px 16px',
          fontWeight: 800,
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <Download size={16} />
        تثبيت
      </button>

      <button
        onClick={() => {
          sessionStorage.setItem('kidtok_open_in_app_dismissed', '1')
          setShow(false)
        }}
        style={{
          background: 'rgba(255,255,255,0.15)',
          color: 'white',
          border: 'none',
          width: 32, height: 32, borderRadius: 999,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <X size={18} />
      </button>
    </div>
  )
}
