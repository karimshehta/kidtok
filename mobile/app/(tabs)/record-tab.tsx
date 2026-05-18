// This screen is never rendered — the tab button navigates directly to /creator/record
// expo-router requires a file for every Tabs.Screen
import { Redirect } from 'expo-router'
export default function RecordTab() {
  return <Redirect href="/creator/record" />
}
