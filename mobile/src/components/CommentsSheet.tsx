import { useState } from 'react'
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Modal } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'

import { useComments, useAddComment } from '@/hooks/useSocial'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function CommentsSheet({
  videoId,
  visible,
  onClose,
}: { videoId: string; visible: boolean; onClose: () => void }) {
  const { data: comments = [], isLoading } = useComments(videoId)
  const addMut = useAddComment()
  const [text, setText] = useState('')

  const handleSend = async () => {
    if (!text.trim()) return
    try {
      await addMut.mutateAsync({ videoId, comment: text.trim() })
      setText('')
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ height: '70%' }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: colors.white,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.grey100,
              }}
            >
              <View style={{ width: 28 }} />
              <View style={{ alignItems: 'center' }}>
                <View
                  style={{
                    width: 40, height: 4, backgroundColor: colors.grey200, borderRadius: 2, marginBottom: 8,
                  }}
                />
                <Text style={{ fontSize: fontSize.base, fontWeight: '800' }}>
                  التعليقات ({comments.length})
                </Text>
              </View>
              <Pressable onPress={onClose}>
                <Ionicons name="close" size={28} color={colors.grey900} />
              </Pressable>
            </View>

            {/* Comment list */}
            {isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
            ) : comments.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
                <Ionicons name="chatbubble-outline" size={48} color={colors.grey200} />
                <Text style={{ color: colors.grey700, marginTop: spacing.sm, fontWeight: '700' }}>
                  لا تعليقات بعد
                </Text>
                <Text style={{ color: colors.grey600, fontSize: fontSize.xs, marginTop: 4 }}>
                  كن أول من يعلّق!
                </Text>
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c) => c.id}
                contentContainerStyle={{ padding: spacing.md }}
                renderItem={({ item }) => {
                  const profile = (item as any).profiles
                  return (
                    <View style={{ flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm }}>
                      <View
                        style={{
                          width: 36, height: 36, borderRadius: 18,
                          backgroundColor: colors.primary,
                          alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {profile?.avatar_url ? (
                          <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <Ionicons name="person" size={18} color={colors.white} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', fontSize: fontSize.xs, color: colors.grey900 }}>
                          {profile?.name || 'مستخدم'}
                        </Text>
                        <Text style={{ fontSize: fontSize.sm, color: colors.grey900, marginTop: 2 }}>
                          {(item as any).content}
                        </Text>
                      </View>
                    </View>
                  )
                }}
              />
            )}

            {/* Input */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: spacing.md,
                borderTopWidth: 1, borderTopColor: colors.grey100,
                gap: spacing.sm,
              }}
            >
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="أضف تعليقاً..."
                placeholderTextColor={colors.grey400}
                style={{
                  flex: 1,
                  backgroundColor: colors.grey50,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + 2,
                  fontSize: fontSize.sm,
                  color: colors.grey900,
                  borderWidth: 1, borderColor: colors.grey100,
                }}
              />
              <Pressable
                onPress={handleSend}
                disabled={!text.trim() || addMut.isPending}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: text.trim() ? colors.primary : colors.grey200,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {addMut.isPending ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Ionicons name="send" size={18} color={colors.white} />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}
