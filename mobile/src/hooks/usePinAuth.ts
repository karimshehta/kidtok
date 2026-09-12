import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
/** Simple deterministic hash for PIN — no external package needed */
function simpleHash(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
    hash = hash >>> 0  // keep unsigned 32-bit
  }
  // Convert to hex and pad to make it look like a hash
  const base = hash.toString(16).padStart(8, '0')
  return (base + base + base + base + base + base + base + base).slice(0, 64)
}
import * as LocalAuth from 'expo-local-authentication'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

function hashPin(pin: string): string {
  return simpleHash(pin + ':kidtok_salt_v1')
}

export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuth.hasHardwareAsync()
  if (!compatible) return false
  return LocalAuth.isEnrolledAsync()
}

export async function authenticateWithBiometric(): Promise<boolean> {
  const result = await LocalAuth.authenticateAsync({
    promptMessage: 'تحقق من هويتك للخروج من وضع الطفل',
    fallbackLabel: 'استخدم الـ PIN',
    disableDeviceFallback: false,
  })
  return result.success
}

export function usePinSetup() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const savePin = useCallback(async (pin: string): Promise<boolean> => {
    if (pin.length !== 4) return false
    setSaving(true)
    setError(null)
    try {
      const hash = hashPin(pin)
      const { error } = await supabase.rpc('set_child_mode_pin', { p_pin_hash: hash })
      if (error) throw error
      setSuccess(true)
      return true
    } catch (e: any) {
      setError(e.message || 'خطأ في حفظ الـ PIN')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  return { savePin, saving, error, success, setError }
}

export function usePinVerify() {
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [biometricAvailable, setBioAvail] = useState(false)

  useEffect(() => {
    isBiometricAvailable().then(setBioAvail)
  }, [])

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    setVerifying(true)
    setError(null)
    try {
      const hash = hashPin(pin)
      const { data } = await supabase.rpc('verify_child_mode_pin', { p_pin_hash: hash })
      if (!data) {
        setError('الـ PIN غير صحيح')
        return false
      }
      return true
    } catch (e: any) {
      setError(e.message)
      return false
    } finally {
      setVerifying(false)
    }
  }, [])

  const verifyBiometric = useCallback(async (): Promise<boolean> => {
    const result = await authenticateWithBiometric()
    if (!result) setError('فشل التحقق بالبصمة')
    return result
  }, [])

  return { verifyPin, verifyBiometric, verifying, error, setError, biometricAvailable }
}

export function useHasPin() {
  const userId = useAuth((s) => s.user?.id)
  // Cached via react-query so we can invalidate from set-pin's success
  // handler and have every consumer pick up the new value immediately.
  // Returns true / false (loaded) or null (still loading) to match the
  // original API.
  const { data } = useQuery({
    queryKey: ['has-pin', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('child_mode_pin')
        .eq('id', userId)
        .single()
      return !!data?.child_mode_pin
    },
  })
  return data === undefined ? null : data
}
