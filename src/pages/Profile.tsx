import { useAuth } from '@/stores/auth'
import AppLayout from '@/components/AppLayout'

export default function Profile() {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-xl">
        <h1 className="text-2xl font-bold mb-4">الملف الشخصي</h1>
        <div className="card space-y-3">
          <div>
            <div className="text-sm text-neutral-700">البريد</div>
            <div className="font-medium">{user?.email}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-700">الاسم</div>
            <div className="font-medium">{user?.user_metadata.name || '-'}</div>
          </div>
          <button onClick={signOut} className="btn-outline w-full">
            تسجيل الخروج
          </button>
        </div>
      </div>
    </AppLayout>
  )
}
