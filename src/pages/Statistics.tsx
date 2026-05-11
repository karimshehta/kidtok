import { useParams } from 'react-router-dom'
import AppLayout from '@/components/AppLayout'

export default function Statistics() {
  const { childId } = useParams()
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">إحصائيات الطفل (#{childId})</h1>
        <div className="card">
          <p className="text-neutral-700">الرسوم البيانية والإحصائيات - سيتم بناؤها قريبًا</p>
        </div>
      </div>
    </AppLayout>
  )
}
