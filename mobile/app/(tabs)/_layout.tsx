import { Redirect, Tabs, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, View, Text } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, spacing } from '@/lib/theme'
import { useAuth } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

/** زر الـ + في النص — يفتح شاشة التسجيل مباشرة */
function RecordTabButton() {
  const insets = useSafeAreaInsets()
  return (
    <Pressable
      onPress={() => router.push('/creator/record')}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 6,
        opacity: pressed ? 0.8 : 1,
      })}
      accessibilityLabel="تسجيل فيديو"
    >
      {/* Circle + button */}
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 6,
          marginTop: -12, // ارفعه شوية عن الـ tab bar
        }}
      >
        <Ionicons name="add" size={30} color={colors.white} />
      </View>
      <Text style={{ fontSize: 10, color: colors.grey400, marginTop: 4, fontWeight: '600' }}>
        سجّل
      </Text>
    </Pressable>
  )
}

export default function TabsLayout() {
  const { t } = useTranslation()
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
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.grey400,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 1,
          borderTopColor: colors.grey100,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: t('tabs.feed'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />
          ),
        }}
      />

      {/* ── زر التسجيل في النص ── */}
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
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
