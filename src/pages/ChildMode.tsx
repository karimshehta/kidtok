import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function ChildMode() {
  const { childId } = useParams()
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-gradient-primary text-white p-6">
      <h1 className="text-2xl font-bold">{t('children.childMode')} (#{childId})</h1>
      <p className="opacity-80 mt-2">{t('common.loading')}</p>
    </div>
  )
}
