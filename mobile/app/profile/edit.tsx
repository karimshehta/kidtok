import { useEffect, useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, Image, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function ProfileEditScreen() {
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('name, phone, bio, avatar_url')
        .eq('id', userId)
        .single()
      return data
    },
  })

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name || '')
      setPhone(profile.phone || '')
      setBio(profile.bio || '')
      setAvatarUrl(profile.avatar_url || null)
    }
  }, [profile])

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('السماح بالوصول', 'يلزم الإذن بالوصول للصور لتغيير الأفاتار.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    })
    if (result.canceled || !result.assets[0].base64 || !userId) return

    setUploading(true)
    try {
      const asset = result.assets[0]
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `${userId}/avatar-${Date.now()}.${ext}`
      const arrayBuffer = decodeBase64(asset.base64!)
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        })
      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(fileName)
      setAvatarUrl(pub.publicUrl)
      Toast.show({ type: 'success', text1: 'تم رفع الصورة' })
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl,
        })
        .eq('id', userId)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['profile'] })
      Toast.show({ type: 'success', text1: 'تم حفظ التعديلات' })
      router.back()
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
          تعديل الحساب
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Pressable onPress={pickAvatar} disabled={uploading}>
            <View style={{ position: 'relative' }}>
              <View
                style={{
                  width: 96, height: 96, borderRadius: 48,
                  backgroundColor: colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Ionicons name="person" size={56} color={colors.white} />
                )}
                {uploading && (
                  <View
                    style={{
                      position: 'absolute', inset: 0,
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <ActivityIndicator color={colors.white} />
                  </View>
                )}
              </View>
              <View
                style={{
                  position: 'absolute', bottom: -4, right: -4,
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: colors.secondary,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 3, borderColor: colors.white,
                }}
              >
                <Ionicons name="camera" size={16} color={colors.white} />
              </View>
            </View>
          </Pressable>
          <Text style={{ marginTop: spacing.sm, fontSize: fontSize.xs, color: colors.grey600 }}>
            اضغط لتغيير الصورة
          </Text>
        </View>

        <Field label="الاسم" value={name} onChange={setName} icon="person" />
        <Field label="رقم الموبايل" value={phone} onChange={setPhone} icon="call" keyboardType="phone-pad" />
        <Field label="نبذة عنك" value={bio} onChange={setBio} icon="document-text" multiline />

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: colors.primary,
            paddingVertical: spacing.md + 2,
            borderRadius: radius.pill,
            alignItems: 'center',
            marginTop: spacing.lg,
          }}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={{ color: colors.white, fontWeight: '800', fontSize: fontSize.base }}>
              حفظ التعديلات
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Field({ label, value, onChange, icon, keyboardType, multiline }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          backgroundColor: colors.grey50,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          borderWidth: 1, borderColor: colors.grey100,
        }}
      >
        <Ionicons name={icon} size={20} color={colors.grey400} style={{ marginTop: multiline ? 14 : 0 }} />
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          style={{
            flex: 1,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.sm,
            fontSize: fontSize.base,
            color: colors.grey900,
            textAlignVertical: multiline ? 'top' : 'center',
            minHeight: multiline ? 100 : undefined,
          }}
        />
      </View>
    </View>
  )
}

// Helper: base64 → Uint8Array for Supabase Storage upload
function decodeBase64(b64: string): Uint8Array {
  const binary = globalThis.atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
