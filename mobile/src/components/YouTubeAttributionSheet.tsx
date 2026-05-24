/**
 * YouTubeAttributionSheet
 *
 * Replaces the (forbidden) fake KidTok profile that would otherwise open
 * when a user taps a YouTube channel name/avatar in the feed.
 *
 * Purpose:
 *   - Honest source attribution (no impersonation of native creators)
 *   - Clear explanation that the channel is external
 *   - Optional outbound link to the real YouTube channel
 *   - CTA to discover native KidTok creators instead
 *
 * Why a sheet (vs alert, vs disabled tap):
 *   - Alert = harsh, non-branded, no CTAs
 *   - Disabled tap = confusing, no learning moment for the user
 *   - External link only = dead end, doesn't promote native ecosystem
 *   - Sheet = soft, informative, gives the user a clear choice
 */
import { useEffect, useRef } from 'react'
import {
  View, Text, Pressable, Modal, Animated, Linking,
  Image, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface Props {
  visible: boolean
  onClose: () => void
  channelName: string | null
  channelId: string | null  // YouTube channel ID (UC...)
  videoThumbnail?: string | null
}

export default function YouTubeAttributionSheet({
  visible, onClose, channelName, channelId, videoThumbnail,
}: Props) {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const slideAnim = useRef(new Animated.Value(0)).current
  const fadeAnim  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()
    } else {
      slideAnim.setValue(0); fadeAnim.setValue(0)
    }
  }, [visible])

  const openYouTubeChannel = async () => {
    if (!channelId) {
      onClose()
      return
    }
    // Try YouTube app first, fall back to web
    const appUrl = `youtube://www.youtube.com/channel/${channelId}`
    const webUrl = `https://www.youtube.com/channel/${channelId}`
    try {
      const canOpenApp = await Linking.canOpenURL(appUrl)
      await Linking.openURL(canOpenApp ? appUrl : webUrl)
    } catch {
      try { await Linking.openURL(webUrl) }
      catch {
        Alert.alert(
          ar ? 'فتح الرابط فشل' : 'Could not open link',
          ar ? 'تأكد من اتصال الإنترنت' : 'Check your internet connection'
        )
      }
    }
    onClose()
  }

  const discoverNative = () => {
    onClose()
    setTimeout(() => router.push('/search'), 100)
  }

  if (!visible) return null

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] })

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', opacity: fadeAnim }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />

        {/* Sheet */}
        <Animated.View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            backgroundColor: '#fff',
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing.xl + 20,
            transform: [{ translateY }],
            elevation: 20,
          }}
        >
          {/* Drag handle */}
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <View style={{ width: 44, height: 5, backgroundColor: '#E5E7EB', borderRadius: 3 }} />
          </View>

          {/* YouTube source badge — prominent */}
          <View style={{
            flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6,
            backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 5,
            borderRadius: 100, marginBottom: spacing.md,
          }}>
            <Ionicons name="logo-youtube" size={15} color="#DC2626" />
            <Text style={{ color: '#991B1B', fontWeight: '800', fontSize: 11, letterSpacing: 0.3 }}>
              {ar ? 'محتوى خارجي من يوتيوب' : 'External content from YouTube'}
            </Text>
          </View>

          {/* Channel preview */}
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <View style={{
              width: 76, height: 76, borderRadius: 38,
              backgroundColor: '#F3F4F6',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 3, borderColor: '#DC2626',
              overflow: 'hidden',
            }}>
              {videoThumbnail ? (
                <Image source={{ uri: videoThumbnail }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Ionicons name="logo-youtube" size={32} color="#DC2626" />
              )}
            </View>
            <Text style={{
              marginTop: 10, fontSize: fontSize.lg, fontWeight: '900',
              color: '#111827', textAlign: 'center',
            }}>
              {channelName || (ar ? 'قناة يوتيوب' : 'YouTube channel')}
            </Text>
            <Text style={{
              marginTop: 2, fontSize: 11, color: '#6B7280', fontWeight: '600',
            }}>
              YouTube
            </Text>
          </View>

          {/* Honest explanation */}
          <View style={{
            backgroundColor: '#F9FAFB', borderRadius: radius.lg,
            padding: spacing.md, marginBottom: spacing.lg,
          }}>
            <Text style={{
              fontSize: fontSize.sm, color: '#374151', lineHeight: 20,
              textAlign: 'center',
            }}>
              {ar
                ? 'هذا الفيديو من يوتيوب، اختاره فريق KidTok للأطفال. القناة ليست جزءاً من منصة KidTok ولا يديرها صناع المحتوى لدينا.'
                : 'This video is from YouTube, hand-picked by the KidTok team for kids. The channel is not part of KidTok and is not managed by our creators.'}
            </Text>
          </View>

          {/* Action: open on YouTube */}
          {channelId && (
            <Pressable
              onPress={openYouTubeChannel}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14, borderRadius: radius.pill,
                backgroundColor: pressed ? '#B91C1C' : '#DC2626',
                marginBottom: 10,
              })}
            >
              <Ionicons name="logo-youtube" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.base }}>
                {ar ? 'افتح القناة في يوتيوب' : 'Open channel on YouTube'}
              </Text>
              <Ionicons name="open-outline" size={16} color="#fff" />
            </Pressable>
          )}

          {/* Action: discover native */}
          <Pressable
            onPress={discoverNative}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, paddingVertical: 14, borderRadius: radius.pill,
              backgroundColor: pressed ? '#02A4CB' : colors.primary,
              marginBottom: 6,
            })}
          >
            <Ionicons name="sparkles" size={17} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.base }}>
              {ar ? 'اكتشف صناع محتوى KidTok' : 'Discover KidTok creators'}
            </Text>
          </Pressable>

          {/* Close */}
          <Pressable onPress={onClose} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: fontSize.sm }}>
              {ar ? 'إغلاق' : 'Close'}
            </Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}
