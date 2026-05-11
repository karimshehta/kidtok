import AppLayout from '@/components/AppLayout'

export default function Children() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">أطفالي</h1>
        <div className="card">
          <p className="text-neutral-700">قائمة الأطفال - سيتم بناؤها قريبًا</p>
        </div>
      </div>
    </AppLayout>
  )
}
