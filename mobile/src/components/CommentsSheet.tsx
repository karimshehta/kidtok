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

import {
  useComments,
  useAddComment,
  useDeleteComment,
  useReportComment,
} from '@/hooks/useSocial'
import { useAuth } from '@/stores/auth'
import { useMyRole } from '@/hooks/useMyRole'
import BannerAd from '@/components/BannerAd'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

function formatRelativeTime(dateStr: string, lang: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, Math.floor((now - then) / 1000))

  if (lang === 'ar') {
    if (diff < 60) return 'الآن'
    if (diff < 3600) return `${Math.floor(diff / 60)}د`
    if (diff < 86400) return `${Math.floor(diff / 3600)}س`
    if (diff < 604800) return `${Math.floor(diff / 86400)}ي`
    if (diff < 2592000) return `${Math.floor(diff / 604800)}أ`
    return `${Math.floor(diff / 2592000)}ش`
  }

  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w`
  return `${Math.floor(diff / 2592000)}mo`
}

function CommentItem({
  item,
  lang,
  currentUserId,
  isAdmin,
  busy,
  onDelete,
  onReport,
}: {
  item: any
  lang: string
  currentUserId?: string
  isAdmin: boolean
  busy: boolean
  onDelete: (item: any) => void
  onReport: (item: any) => void
}) {
  const isRTL = lang === 'ar'
  const profile = item?.profile || { name: isRTL ? 'مستخدم' : 'User', avatar_url: null }
  const timeLabel = item.created_at ? formatRelativeTime(item.created_at, lang) : ''
  const isOwn = !!currentUserId && item.user_id === currentUserId
  const canDelete = isOwn || isAdmin
  const canReport = !!currentUserId && !isOwn

  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: spacing.md,
      }}
    >
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

        {(canDelete || canReport) ? (
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              gap: 10,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            {canDelete ? (
              <Pressable
                disabled={busy}
                onPress={() => onDelete(item)}
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 4,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Ionicons name="trash-outline" size={14} color="#F43F5E" />
                <Text style={{ color: '#F43F5E', fontSize: 11, fontWeight: '800' }}>
                  {isRTL ? 'حذف' : 'Delete'}
                </Text>
              </Pressable>
            ) : null}

            {canReport ? (
              <Pressable
                disabled={busy}
                onPress={() => onReport(item)}
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 4,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Ionicons name="flag-outline" size={14} color={colors.grey500} />
                <Text style={{ color: colors.grey500, fontSize: 11, fontWeight: '800' }}>
                  {isRTL ? 'إبلاغ' : 'Report'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

function Separator() {
  return <View style={{ height: 1, backgroundColor: colors.grey100, marginHorizontal: spacing.md }} />
}

export default function CommentsSheet({
  videoId,
  visible,
  onClose,
  onCommentDeleted,
}: {
  videoId: string
  visible: boolean
  onClose: () => void
  onCommentDeleted?: () => void
}) {
  const { data: comments = [], isLoading } = useComments(videoId)
  const addMut = useAddComment()
  const deleteMut = useDeleteComment()
  const reportMut = useReportComment()
  const currentUserId = useAuth((s) => s.user?.id)
  const { data: role } = useMyRole()
  const [text, setText] = useState('')
  const { i18n } = useTranslation()
  const lang = i18n.language
  const isRTL = lang === 'ar'
  const isAdmin = role === 'admin'
  const actionBusy = deleteMut.isPending || reportMut.isPending

  const handleSend = async () => {
    if (!text.trim()) return
    try {
      await addMut.mutateAsync({ videoId, comment: text.trim() })
      setText('')
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: isRTL ? 'تعذر إرسال التعليق' : 'Comment failed',
        text2: (err as Error).message,
      })
    }
  }

  const handleDelete = (comment: any) => {
    Alert.alert(
      isRTL ? 'حذف التعليق؟' : 'Delete comment?',
      isRTL ? 'هل أنت متأكد أنك تريد حذف هذا التعليق؟' : 'Are you sure you want to delete this comment?',
      [
        { text: isRTL ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isRTL ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMut.mutateAsync({ commentId: comment.id, videoId })
              onCommentDeleted?.()
              Toast.show({
                type: 'success',
                text1: isRTL ? 'تم حذف التعليق' : 'Comment deleted',
              })
            } catch (err) {
              Toast.show({
                type: 'error',
                text1: isRTL ? 'تعذر حذف التعليق' : 'Delete failed',
                text2: (err as Error).message,
              })
            }
          },
        },
      ],
    )
  }

  const handleReport = (comment: any) => {
    Alert.alert(
      isRTL ? 'إبلاغ عن التعليق؟' : 'Report comment?',
      isRTL
        ? 'سيصل البلاغ إلى فريق المراجعة في لوحة التحكم.'
        : 'This will send the comment to the moderation team.',
      [
        { text: isRTL ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isRTL ? 'إبلاغ' : 'Report',
          style: 'destructive',
          onPress: async () => {
            try {
              await reportMut.mutateAsync({ commentId: comment.id, videoId })
              Toast.show({
                type: 'success',
                text1: isRTL ? 'وصل البلاغ للمراجعة' : 'Report sent',
                text2: isRTL ? 'سنراجعه في أسرع وقت.' : 'We will review it shortly.',
              })
            } catch (err) {
              Toast.show({
                type: 'error',
                text1: isRTL ? 'تعذر إرسال البلاغ' : 'Report failed',
                text2: (err as Error).message,
              })
            }
          },
        },
      ],
    )
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ height: '72%' }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              overflow: 'hidden',
            }}
          >
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
                  {isRTL ? 'لا توجد تعليقات بعد' : 'No comments yet'}
                </Text>
                <Text style={{ color: colors.grey400, fontSize: fontSize.xs }}>
                  {isRTL ? 'كن أول من يعلق!' : 'Be the first to comment!'}
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
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    busy={actionBusy}
                    onDelete={handleDelete}
                    onReport={handleReport}
                  />
                )}
                ItemSeparatorComponent={Separator}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              />
            )}

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
                placeholder={isRTL ? 'أضف تعليقًا...' : 'Add a comment...'}
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
      </View>
    </Modal>
  )
}
