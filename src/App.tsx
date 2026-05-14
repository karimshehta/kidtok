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
import Feed from '@/pages/Feed'
import Children from '@/pages/Children'
import ChildDetail from '@/pages/ChildDetail'
import PlaylistDetail from '@/pages/PlaylistDetail'
import ChildMode from '@/pages/ChildMode'
import Profile from '@/pages/Profile'
import Subscription from '@/pages/Subscription'
import Statistics from '@/pages/Statistics'
import SubscriptionSuccess from '@/pages/subscription/Success'
import SubscriptionFailed from '@/pages/subscription/Failed'
import CreatorUpload from '@/pages/creator/Upload'
import CreatorMyVideos from '@/pages/creator/MyVideos'
import PlaylistFeed from '@/pages/PlaylistFeed'
import CreatorProfile from '@/pages/CreatorProfile'
import AdminDashboard from '@/pages/admin/Dashboard'
import AdminContent from '@/pages/admin/Content'
import AdminModeration from '@/pages/admin/Moderation'
import AdminUsers from '@/pages/admin/Users'
import AdminPlans from '@/pages/admin/Plans'
import AdminAds from '@/pages/admin/Ads'
import AdminReference from '@/pages/admin/Reference'
import AdminReports from '@/pages/admin/Reports'
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
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/home" element={<Home />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/children" element={<Children />} />
        <Route path="/children/:childId" element={<ChildDetail />} />
        <Route path="/playlists/:playlistId" element={<PlaylistDetail />} />
        <Route path="/playlists/:playlistId/play" element={<PlaylistFeed />} />
        <Route path="/creator/:userId" element={<CreatorProfile />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/subscription/success" element={<SubscriptionSuccess />} />
        <Route path="/subscription/failed" element={<SubscriptionFailed />} />
        <Route path="/statistics/:childId" element={<Statistics />} />
        <Route path="/kid/:childId" element={<ChildMode />} />
        <Route path="/creator/upload" element={<CreatorUpload />} />
        <Route path="/creator/videos" element={<CreatorMyVideos />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/content" element={<AdminContent />} />
        <Route path="/admin/moderation" element={<AdminModeration />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/plans" element={<AdminPlans />} />
        <Route path="/admin/ads" element={<AdminAds />} />
        <Route path="/admin/reference" element={<AdminReference />} />
        <Route path="/admin/reports" element={<AdminReports />} />
      </Route>

      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
