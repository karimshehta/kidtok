import { useEffect, useState } from 'react'
import { Modal, View, Text, Pressable, Image } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'

import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius, gradients } from '@/lib/theme'

const ONBOARDING_KEY = 'kidtok_onboarding_v1'

export default function OnboardingModal() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuth((s) => s.user)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (user) return
    let active = true
    AsyncStorage.getItem(ONBOARDING_KEY).then((seen) => {
      if (!seen && active) {
        setTimeout(() => setVisible(true), 1200)
      }
    })
    return () => { active = false }
  }, [user])

  const dismiss = async (action: 'login' | 'skip' | 'ad') => {
    await AsyncStorage.setItem(ONBOARDING_KEY, action)
    setVisible(false)
    if (action === 'login') router.push('/auth/login')
  }

  if (!visible) return null

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.white,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={gradients.hero}
            style={{ paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, alignItems: 'center' }}
          >
            <Image
              source={require('../../assets/images/logo.png')}
              style={{ width: 80, height: 80, marginBottom: spacing.sm }}
              resizeMode="contain"
            />
            <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900' }}>
              {t('onboarding.welcome')}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm, marginTop: 4 }}>
              {t('onboarding.subtitle')}
            </Text>
          </LinearGradient>

          <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            {/* Watch ad */}
            <Pressable
              onPress={() => dismiss('ad')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: '#FEF3C7',
                borderWidth: 2,
                borderColor: '#FCD34D',
                opacity: pressed ? 0.85 : 1,
                gap: spacing.md,
              })}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FBBF24', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="eye" size={22} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.grey900 }}>
                  {t('onboarding.watchAd')}  +5 🪙
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.grey700 }}>
                  {t('onboarding.watchAdHint')}
                </Text>
              </View>
            </Pressable>

            {/* Login */}
            <Pressable
              onPress={() => dismiss('login')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: `${colors.primary}10`,
                borderWidth: 2,
                borderColor: `${colors.primary}30`,
                opacity: pressed ? 0.85 : 1,
                gap: spacing.md,
              })}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="log-in" size={22} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.grey900 }}>
                  {t('onboarding.login')}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.grey700 }}>
                  {t('onboarding.loginHint')}
                </Text>
              </View>
            </Pressable>

            {/* Skip */}
            <Pressable
              onPress={() => dismiss('skip')}
              style={{ padding: spacing.md, alignItems: 'center' }}
            >
              <Text style={{ color: colors.grey600, fontSize: fontSize.sm }}>
                {t('onboarding.skip')} →
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
