import { useParams } from 'react-router-dom'

export default function ChildMode() {
  const { childId } = useParams()
  return (
    <div className="min-h-screen bg-gradient-primary text-white p-6">
      <h1 className="text-2xl font-bold">وضع الطفل (#{childId})</h1>
      <p className="opacity-80 mt-2">سيتم بناؤها قريبًا - مشغل الفيديو + الـ time lock</p>
    </div>
  )
}
