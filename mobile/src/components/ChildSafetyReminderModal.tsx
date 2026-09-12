import { Modal, Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'

import { colors, fontSize, radius, spacing } from '@/lib/theme'

type Props = {
  visible: boolean
  ar: boolean
  mode?: 'reminder' | 'personalInfo'
  surface?: 'video' | 'comment'
  riskLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

export default function ChildSafetyReminderModal({
  visible,
  ar,
  mode = 'reminder',
  surface = 'video',
  riskLabel,
  onCancel,
  onConfirm,
}: Props) {
  const isPersonalInfo = mode === 'personalInfo'
  const actionLabel = surface === 'comment'
    ? (ar ? 'التعليق' : 'comment')
    : (ar ? 'الفيديو' : 'video')

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(6,10,30,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ width: '100%', maxWidth: 420, borderRadius: 34, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
          <LinearGradient
            colors={isPersonalInfo ? ['#FF7A7A', '#F97316', '#FBBF24'] : ['#03BBE5', '#7C3AED', '#F96286']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: spacing.lg, alignItems: 'center' }}
          >
            <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)' }}>
              <Ionicons name={isPersonalInfo ? 'shield' : 'sparkles'} size={42} color="#FFF" />
            </View>
            <Text style={{ marginTop: spacing.md, color: '#FFF', fontSize: fontSize.xl, fontWeight: '900', textAlign: 'center' }}>
              {isPersonalInfo
                ? (ar ? 'نحافظ على أمانك' : 'Let’s keep you safe')
                : (ar ? 'تذكير أمان قبل المشاركة' : 'Safety reminder before sharing')}
            </Text>
          </LinearGradient>

          <View style={{ padding: spacing.lg }}>
            <Text style={{ color: '#1F2937', fontSize: fontSize.base, fontWeight: '900', textAlign: 'center', lineHeight: 24 }}>
              {isPersonalInfo
                ? (ar
                  ? `لا يمكن نشر ${actionLabel} وفيه ${riskLabel || 'بيانات شخصية'}. اطلب من ولي الأمر وامسح البيانات الشخصية أولاً.`
                  : `This ${actionLabel} may include a ${riskLabel || 'personal detail'}. Ask a parent and remove personal details first.`)
                : (ar
                  ? 'قبل ما تنشر أو تكتب تعليق: لا تشارك رقمك، عنوانك، مدرستك، روابطك أو أي معلومة شخصية.'
                  : 'Before you post or comment: never share your phone, address, school, links, handles, or personal details.')}
            </Text>

            {!isPersonalInfo && (
              <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                <SafetyLine ar={ar} icon="people" textEn="Talk only with people you know in real life." textAr="تفاعل فقط مع ناس تعرفهم في الحقيقة." />
                <SafetyLine ar={ar} icon="person-add" textEn="Ask a parent before sharing anything personal." textAr="اسأل ولي الأمر قبل مشاركة أي حاجة شخصية." />
                <SafetyLine ar={ar} icon="flag" textEn="Report anything that feels scary or strange." textAr="بلّغ عن أي شيء يضايقك أو يخوفك." />
              </View>
            )}

            <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
              <Pressable
                onPress={onConfirm}
                style={({ pressed }) => ({
                  minHeight: 52,
                  borderRadius: radius.pill,
                  backgroundColor: isPersonalInfo ? '#F97316' : colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.78 : 1,
                })}
              >
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: fontSize.base }}>
                  {isPersonalInfo
                    ? (ar ? 'حاضر، هعدّل النص' : 'I’ll edit it')
                    : (ar ? 'فهمت، هشارك بأمان' : 'I understand')}
                </Text>
              </Pressable>

              <Pressable
                onPress={onCancel}
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: radius.pill,
                  backgroundColor: '#F3F4F6',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: '#4B5563', fontWeight: '800', fontSize: fontSize.sm }}>
                  {ar ? 'رجوع' : 'Go back'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function SafetyLine({
  ar,
  icon,
  textEn,
  textAr,
}: {
  ar: boolean
  icon: keyof typeof Ionicons.glyphMap
  textEn: string
  textAr: string
}) {
  return (
    <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, padding: spacing.sm, borderRadius: 16, backgroundColor: '#F8FAFC' }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.primary} />
      </View>
      <Text style={{ flex: 1, color: '#334155', fontSize: fontSize.sm, fontWeight: '800', textAlign: ar ? 'right' : 'left', lineHeight: 20 }}>
        {ar ? textAr : textEn}
      </Text>
    </View>
  )
}
