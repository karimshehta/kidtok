import { Redirect, Tabs, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'

import { colors, spacing } from '@/lib/theme'
import { useAuth } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

/** Center record button opens Snap Camera Kit first; that screen has a safe normal-camera fallback. */
function RecordTabButton() {
  const { i18n } = useTranslation()
  const label = i18n.language === 'ar' ? '\u0633\u062c\u0651\u0644' : 'Record'
  return (
    <Pressable
      onPress={() => router.push('/creator/snap-record')}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 6,
        opacity: pressed ? 0.8 : 1,
      })}
      accessibilityLabel={label}
    >
      {/* Circle + button */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.secondary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 6,
          marginTop: -12,
        }}
      >
        <Ionicons name="add" size={30} color={colors.white} />
      </View>
      <Text style={{ fontSize: 10, color: colors.secondary, marginTop: 3, fontWeight: '800', letterSpacing: 0.2 }}>
        {label}
      </Text>
    </Pressable>
  )
}

export default function TabsLayout() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const user = useAuth((s) => s.user)
  const qc = useQueryClient()

  useEffect(() => {
    if (!user?.id) return
    qc.prefetchQuery({
      queryKey: ['children', user.id],
      queryFn: async () => {
        const { data } = await supabase
          .from('children')
          .select('id, name, gender, image_url')
          .order('created_at', { ascending: false })
        return data || []
      },
      staleTime: 30_000,
    })
  }, [user?.id])

  if (!user) return <Redirect href="/landing" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.primary,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 0.5,
          borderTopColor: '#E5E7EB',
          height: 60 + insets.bottom,
          paddingBottom: 6 + insets.bottom,
          paddingTop: 6,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
        tabBarIconStyle: { marginBottom: -2 },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: t('tabs.feed'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={focused ? colors.secondary : colors.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={24} color={focused ? colors.secondary : colors.primary} />
          ),
        }}
      />

      {/* â”€â”€ ط²ط± ط§ظ„طھط³ط¬ظٹظ„ ظپظٹ ط§ظ„ظ†طµ â”€â”€ */}
      <Tabs.Screen
        name="record-tab"
        options={{
          title: '',
          tabBarButton: () => <RecordTabButton />,
        }}
      />

      <Tabs.Screen
        name="children"
        options={{
          title: t('tabs.children'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={24} color={focused ? colors.secondary : colors.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={24} color={focused ? colors.secondary : colors.primary} />
          ),
        }}
      />
    </Tabs>
  )
}
