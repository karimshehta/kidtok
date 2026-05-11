import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth'
import Landing from '@/pages/Landing'
import Login from '@/pages/auth/Login'
import Signup from '@/pages/auth/Signup'
import Home from '@/pages/Home'
import Children from '@/pages/Children'
import ChildMode from '@/pages/ChildMode'
import Profile from '@/pages/Profile'
import Subscription from '@/pages/Subscription'
import Statistics from '@/pages/Statistics'
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
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/home" element={<Home />} />
        <Route path="/children" element={<Children />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/statistics/:childId" element={<Statistics />} />
        <Route path="/kid/:childId" element={<ChildMode />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
