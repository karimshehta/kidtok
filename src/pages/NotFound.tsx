import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-light via-white to-white flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-8xl font-bold text-primary mb-4">404</div>
        <h1 className="text-2xl font-bold text-primary-dark mb-2">الصفحة غير موجودة</h1>
        <p className="text-neutral-700 mb-6">الصفحة اللي بتدوّر عليها مش موجودة أو اتنقلت</p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2">
          <Home className="w-5 h-5" />
          الصفحة الرئيسية
        </Link>
      </div>
    </div>
  )
}
