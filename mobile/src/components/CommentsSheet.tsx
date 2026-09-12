import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'
import { useTranslation } from 'react-i18next'

import { useComments, useAddComment, useDeleteComment, useReportComment } from '@/hooks/useSocial'
import BannerAd from '@/components/BannerAd'
import ChildSafetyReminderModal from '@/components/ChildSafetyReminderModal'
import { detectPersonalInfoRisk, hasSeenChildSafetyReminder, markChildSafetyReminderSeen } from '@/lib/childSafety'
import { useAuth } from '@/stores/auth'
import { useMyRole } from '@/hooks/useMyRole'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

// ─── Relative time helper ────────────────────────────────────────────────────
function formatRelativeTime(dateStr: string, lang: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, Math.floor((now - then) / 1000))

  if (lang === 'ar') {
    if (diff < 60)      return 'الآن'
    if (diff < 3600)    return `${Math.floor(diff / 60)}د`
    if (diff < 86400)   return `${Math.floor(diff / 3600)}س`
    if (diff < 604800)  return `${Math.floor(diff / 86400)}ي`
    if (diff < 2592000) return `${Math.floor(diff / 604800)}أ`
    return `${Math.floor(diff / 2592000)}ش`
  } else {
    if (diff < 60)      return 'now'
    if (diff < 3600)    return `${Math.floor(diff / 60)}m`
    if (diff < 86400)   return `${Math.floor(diff / 3600)}h`
    if (diff < 604800)  return `${Math.floor(diff / 86400)}d`
    if (diff < 2592000) return `${Math.floor(diff / 604800)}w`
    return `${Math.floor(diff / 2592000)}mo`
  }
}

// ─── Single comment item ─────────────────────────────────────────────────────
function CommentItem({
  item,
  lang,
  currentUserId,
  isAdmin,
  onDelete,
  onReport,
  busy,
}: {
  item: any
  lang: string
  currentUserId?: string | null
  isAdmin: boolean
  onDelete: (item: any) => void
  onReport: (item: any) => void
  busy?: boolean
}) {
  const profile = item?.profile || { name: 'مستخدم', avatar_url: null }
  const timeLabel = item.created_at ? formatRelativeTime(item.created_at, lang) : ''
  const isRTL = lang === 'ar'
  const isMine = !!currentUserId && item?.user_id === currentUserId
  const canDelete = isMine || isAdmin
  const canReport = !isMine

  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: spacing.md,
      }}
    >
      {/* Avatar */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.primaryLight,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Ionicons name="person" size={20} color={colors.primary} />
        )}
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 3,
          }}
        >
          <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.grey900 }}>
            {profile?.name || (isRTL ? 'مستخدم' : 'User')}
          </Text>
          {timeLabel ? (
            <Text style={{ fontSize: 11, color: colors.grey400 }}>· {timeLabel}</Text>
          ) : null}
        </View>

        <Text
          style={{
            fontSize: fontSize.sm,
            color: colors.grey900,
            lineHeight: 20,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {item.content}
        </Text>

        {(canDelete || canReport) && (
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              gap: 10,
              marginTop: 8,
            }}
          >
            {canDelete && (
              <Pressable
                onPress={() => onDelete(item)}
                disabled={busy}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 4,
                  opacity: pressed || busy ? 0.55 : 1,
                })}
              >
                <Ionicons name="trash-outline" size={14} color="#EF4444" />
                <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '800' }}>
                  {isRTL ? 'حذف' : 'Delete'}
                </Text>
              </Pressable>
            )}
            {canReport && (
              <Pressable
                onPress={() => onReport(item)}
                disabled={busy}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 4,
                  opacity: pressed || busy ? 0.55 : 1,
                })}
              >
                <Ionicons name="flag-outline" size={14} color={colors.grey500} />
                <Text style={{ color: colors.grey500, fontSize: 11, fontWeight: '800' }}>
                  {isRTL ? 'إبلاغ' : 'Report'}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <View style={{ width: 18 }} />
    </View>
  )
}

// ─── Separator ───────────────────────────────────────────────────────────────
function Separator() {
  return (
    <View style={{ height: 1, backgroundColor: colors.grey100, marginHorizontal: spacing.md }} />
  )
}

// ─── Main sheet ──────────────────────────────────────────────────────────────
export default function CommentsSheet({
  videoId,
  visible,
  onClose,
  onCommentAdded,
  onCommentDeleted,
}: {
  videoId: string
  visible: boolean
  onClose: () => void
  onCommentAdded?: () => void
  onCommentDeleted?: () => void
}) {
  const { data: comments = [], isLoading } = useComments(videoId)
  const addMut = useAddComment()
  const deleteMut = useDeleteComment()
  const reportMut = useReportComment()
  const [text, setText] = useState('')
  const [safetyVisible, setSafetyVisible] = useState(false)
  const [personalInfoRisk, setPersonalInfoRisk] = useState<ReturnType<typeof detectPersonalInfoRisk>>(null)
  const userId = useAuth((s) => s.user?.id)
  const { data: role } = useMyRole()
  const { i18n } = useTranslation()
  const lang = i18n.language
  const isRTL = lang === 'ar'
  const isAdmin = role === 'admin'
  const actionBusy = deleteMut.isPending || reportMut.isPending

  const submitComment = async () => {
    if (!text.trim()) return
    try {
      await addMut.mutateAsync({ videoId, comment: text.trim() })
      setText('')
      onCommentAdded?.()   // bump the feed's comment counter instantly
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    }
  }

  const deleteComment = (item: any) => {
    Alert.alert(
      isRTL ? 'حذف التعليق' : 'Delete comment',
      isRTL ? 'هل أنت متأكد من حذف التعليق؟' : 'Are you sure you want to delete this comment?',
      [
        { text: isRTL ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isRTL ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMut.mutateAsync({ commentId: item.id, videoId })
              onCommentDeleted?.()
              Toast.show({
                type: 'kidReward',
                text1: isRTL ? 'تم حذف التعليق' : 'Comment deleted',
                props: { icon: '🗑️', accent: 'blue' },
              })
            } catch (err: any) {
              Toast.show({
                type: 'kidReward',
                text1: isRTL ? 'تعذر حذف التعليق' : 'Could not delete comment',
                text2: String(err?.message || err).slice(0, 120),
                props: { icon: '⚠️', accent: 'purple' },
              })
            }
          },
        },
      ],
    )
  }

  const reportComment = (item: any) => {
    Alert.alert(
      isRTL ? 'الإبلاغ عن التعليق' : 'Report comment',
      isRTL ? 'هنبعت التعليق لفريق المراجعة عشان نحافظ على KidTok آمن.' : 'We will send this comment to moderation to keep KidTok safe.',
      [
        { text: isRTL ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isRTL ? 'إبلاغ' : 'Report',
          style: 'destructive',
          onPress: async () => {
            try {
              await reportMut.mutateAsync({ commentId: item.id, videoId })
              Toast.show({
                type: 'kidReward',
                text1: isRTL ? 'تم إرسال البلاغ' : 'Report sent',
                text2: isRTL ? 'شكرًا إنك بتساعدنا نخلي كيدتوك آمن.' : 'Thanks for helping keep KidTok safe.',
                props: { icon: '🚩', accent: 'blue' },
              })
            } catch (err: any) {
              Toast.show({
                type: 'kidReward',
                text1: isRTL ? 'تعذر إرسال البلاغ' : 'Could not send report',
                text2: String(err?.message || err).slice(0, 120),
                props: { icon: '⚠️', accent: 'purple' },
              })
            }
          },
        },
      ],
    )
  }

  const handleSend = async () => {
    if (!text.trim()) return

    const risk = detectPersonalInfoRisk(text)
    if (risk) {
      setPersonalInfoRisk(risk)
      return
    }

    const seen = await hasSeenChildSafetyReminder(userId, 'comment')
    if (!seen) {
      setSafetyVisible(true)
      return
    }

    await submitComment()
  }

  const confirmSafety = async () => {
    await markChildSafetyReminderSeen(userId, 'comment')
    setSafetyVisible(false)
    await submitComment()
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        >
          <View
            style={{
              height: '72%',
              backgroundColor: colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <View
              style={{
                alignItems: 'center',
                paddingTop: 10,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.grey100,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.grey200,
                  marginBottom: 10,
                }}
              />
              <Text style={{ fontSize: fontSize.base, fontWeight: '800', color: colors.grey900 }}>
                {isRTL ? `${comments.length} تعليق` : `${comments.length} Comments`}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={{ position: 'absolute', right: spacing.md, top: 10 }}
              >
                <Ionicons name="close" size={24} color={colors.grey600} />
              </Pressable>
            </View>

            {/* ── List ── */}
            {isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : comments.length === 0 ? (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.sm,
                }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={52} color={colors.grey200} />
                <Text style={{ color: colors.grey700, fontWeight: '700', fontSize: fontSize.base }}>
                  {isRTL ? 'لا تعليقات بعد' : 'No comments yet'}
                </Text>
                <Text style={{ color: colors.grey400, fontSize: fontSize.xs }}>
                  {isRTL ? 'كن أول من يعلّق!' : 'Be the first to comment!'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => (
                  <CommentItem
                    item={item}
                    lang={lang}
                    currentUserId={userId}
                    isAdmin={isAdmin}
                    onDelete={deleteComment}
                    onReport={reportComment}
                    busy={actionBusy}
                  />
                )}
                ItemSeparatorComponent={Separator}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              />
            )}

            {/* ── Input bar ── */}
            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                paddingHorizontal: spacing.md,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: colors.grey100,
                gap: spacing.sm,
              }}
            >
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={isRTL ? 'أضف تعليقاً...' : 'Add a comment...'}
                placeholderTextColor={colors.grey400}
                textAlign={isRTL ? 'right' : 'left'}
                style={{
                  flex: 1,
                  backgroundColor: colors.grey50,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 10,
                  fontSize: fontSize.sm,
                  color: colors.grey900,
                  borderWidth: 1,
                  borderColor: colors.grey100,
                  writingDirection: isRTL ? 'rtl' : 'ltr',
                }}
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <Pressable
                onPress={handleSend}
                disabled={!text.trim() || addMut.isPending}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: text.trim() ? colors.primary : colors.grey200,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {addMut.isPending ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Ionicons
                    name="send"
                    size={18}
                    color={colors.white}
                    style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}
                  />
                )}
              </Pressable>
            </View>
          </View>
          <BannerAd variant="inline" />
        </KeyboardAvoidingView>
      </Modal>

      <ChildSafetyReminderModal
        visible={safetyVisible}
        ar={isRTL}
        mode="reminder"
        surface="comment"
        onCancel={() => setSafetyVisible(false)}
        onConfirm={confirmSafety}
      />
      <ChildSafetyReminderModal
        visible={!!personalInfoRisk}
        ar={isRTL}
        mode="personalInfo"
        surface="comment"
        riskLabel={isRTL ? personalInfoRisk?.labelAr : personalInfoRisk?.labelEn}
        onCancel={() => setPersonalInfoRisk(null)}
        onConfirm={() => setPersonalInfoRisk(null)}
      />
    </>
  )
}
