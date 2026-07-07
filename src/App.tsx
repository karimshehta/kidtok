import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth'
import ProtectedRoute from '@/components/ProtectedRoute'
import OnboardingModal from '@/components/OnboardingModal'

// ── Critical path (always loaded) ────────────────────────────
import Landing from '@/pages/Landing'
import Login from '@/pages/auth/Login'
import Signup from '@/pages/auth/Signup'

// ── Lazy loaded (code-split per route) ───────────────────────
const ForgotPassword   = lazy(() => import('@/pages/auth/ForgotPassword'))
const ResetPassword    = lazy(() => import('@/pages/auth/ResetPassword'))
const AuthCallback     = lazy(() => import('@/pages/auth/AuthCallback'))
const Home             = lazy(() => import('@/pages/Home'))
const Feed             = lazy(() => import('@/pages/Feed'))
const Discover         = lazy(() => import('@/pages/Discover'))
const Children         = lazy(() => import('@/pages/Children'))
const ChildDetail      = lazy(() => import('@/pages/ChildDetail'))
const PlaylistDetail   = lazy(() => import('@/pages/PlaylistDetail'))
const PlaylistFeed     = lazy(() => import('@/pages/PlaylistFeed'))
const ChildMode        = lazy(() => import('@/pages/ChildMode'))
const Profile          = lazy(() => import('@/pages/Profile'))
const ProfileEdit      = lazy(() => import('@/pages/ProfileEdit'))
const Search           = lazy(() => import('@/pages/Search'))
const Statistics       = lazy(() => import('@/pages/Statistics'))
const Subscription     = lazy(() => import('@/pages/Subscription'))
const SubscriptionSuccess = lazy(() => import('@/pages/subscription/Success'))
const SubscriptionFailed  = lazy(() => import('@/pages/subscription/Failed'))
const CreatorUpload    = lazy(() => import('@/pages/creator/Upload'))
const CreatorMyVideos  = lazy(() => import('@/pages/creator/MyVideos'))
const CreatorProfile   = lazy(() => import('@/pages/CreatorProfile'))

// ── Admin (separate chunk — only for admins) ─────────────────
const AdminDashboard   = lazy(() => import('@/pages/admin/Dashboard'))
const AdminContent     = lazy(() => import('@/pages/admin/Content'))
const AdminModeration  = lazy(() => import('@/pages/admin/Moderation'))
const AdminUsers       = lazy(() => import('@/pages/admin/Users'))
const AdminPlans       = lazy(() => import('@/pages/admin/Plans'))
const AdminRevenue     = lazy(() => import('@/pages/admin/Revenue'))
const AdminAds         = lazy(() => import('@/pages/admin/Ads'))
const AdminSocial      = lazy(() => import('@/pages/admin/Social'))
const AdminAppVersion  = lazy(() => import('@/pages/admin/AppVersion'))
const AdminSecurity    = lazy(() => import('@/pages/admin/Security'))
const AdminNotifications = lazy(() => import('@/pages/admin/Notifications'))
const AdminReference   = lazy(() => import('@/pages/admin/Reference'))
const AdminReports     = lazy(() => import('@/pages/admin/Reports'))
const AdminAutomation  = lazy(() => import('@/pages/admin/Automation'))

const NotFound = lazy(() => import('@/pages/NotFound'))

// Minimal loading spinner used while lazy chunks load
function PageLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-white">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

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
    <>
      <OnboardingModal />
      <Suspense fallback={<PageLoader />}>
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
        <Route path="/discover" element={<Discover />} />
        <Route path="/children" element={<Children />} />
        <Route path="/children/:childId" element={<ChildDetail />} />
        <Route path="/playlists/:playlistId" element={<PlaylistDetail />} />
        <Route path="/playlists/:playlistId/play" element={<PlaylistFeed />} />
        <Route path="/creator/:userId" element={<CreatorProfile />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/edit" element={<ProfileEdit />} />
        <Route path="/search" element={<Search />} />
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
        <Route path="/admin/revenue" element={<AdminRevenue />} />
        <Route path="/admin/ads" element={<AdminAds />} />
        <Route path="/admin/social" element={<AdminSocial />} />
        <Route path="/admin/app-version" element={<AdminAppVersion />} />
        <Route path="/admin/security" element={<AdminSecurity />} />
        <Route path="/admin/notifications" element={<AdminNotifications />} />
        <Route path="/admin/reference" element={<AdminReference />} />
        <Route path="/admin/reports" element={<AdminReports />} />
        <Route path="/admin/automation" element={<AdminAutomation />} />
      </Route>

      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
    </Suspense>
    </>
  )
}
