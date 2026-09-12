// This screen is never rendered directly; it redirects to the Snap Camera Kit
// recorder first. That screen has an explicit normal-camera fallback if the
// EAS build token is missing, so the user sees why lenses are unavailable.
import { Redirect } from 'expo-router'

export default function RecordTab() {
  return <Redirect href="/creator/snap-record" />
}
