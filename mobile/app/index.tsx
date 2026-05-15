import { Redirect } from 'expo-router'
import { useAuth } from '@/stores/auth'

export default function Index() {
  const user = useAuth((s) => s.user)
  return user ? <Redirect href="/(tabs)/feed" /> : <Redirect href="/landing" />
}
