import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth'
import Landing from '@/pages/Landing'
import Login from '@/pages/auth/Login'
import Signup from '@/pages/auth/Signup'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import ResetPassword from '@/pages/auth/ResetPassword'
import AuthCallback from '@/pages/auth/AuthCallback'
import Home from '@/pages/Home'
import Children from '@/pages/Children'
import ChildMode from '@/pages/ChildMode'
import Profile from '@/pages/Profile'
import Subscription from '@/pages/Subscription'
import Statistics from '@/pages/Statistics'
import NotFound from '@/pages/NotFound'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function App() {
  const init = useAuth((s) => s.init)
  const loading = useAuth((s) => s.loading)

  useEffect(() => {
    init()
  }, [init])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Protected */}
      <Route element={<ProtectedRoute />}>
        <Route path="/home" element={<Home />} />
        <Route path="/children" element={<Children />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/statistics/:childId" element={<Statistics />} />
        <Route path="/kid/:childId" element={<ChildMode />} />
      </Route>

      {/* Fallback */}
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
