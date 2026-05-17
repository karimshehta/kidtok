/**
 * headerScroll — module-level singleton for the global app header animation.
 *
 * Any screen can call:
 *   - onHeaderScroll(event)   → for ScrollView / FlatList continuous scroll
 *   - onHeaderPageChange(idx) → for paged TikTok-style FlatList
 *   - showHeader() / hideHeader() → manual control
 */
import { Animated } from 'react-native'

export const HEADER_BAR_HEIGHT = 52

/** Animated height of the header bar (52 = shown, 0 = hidden) */
export const headerAnimHeight = new Animated.Value(HEADER_BAR_HEIGHT)

// ─── Continuous scroll handler (SearchView, ScrollView, etc.) ────────────────
let _lastScrollY = 0

export function onHeaderScroll(event: { nativeEvent: { contentOffset: { y: number } } }) {
  const y = event.nativeEvent.contentOffset.y
  const diff = y - _lastScrollY
  _lastScrollY = y

  if (diff > 4 && y > HEADER_BAR_HEIGHT) {
    hideHeader()
  } else if (diff < -4) {
    showHeader()
  }
}

// ─── Paged scroll handler (TikTok-style FlatList) ───────────────────────────
let _lastPageIndex = 0

export function onHeaderPageChange(newIndex: number) {
  if (newIndex > _lastPageIndex) hideHeader()
  else if (newIndex < _lastPageIndex) showHeader()
  _lastPageIndex = newIndex
}

// ─── Explicit show / hide ────────────────────────────────────────────────────
export function showHeader() {
  Animated.timing(headerAnimHeight, {
    toValue: HEADER_BAR_HEIGHT,
    duration: 180,
    useNativeDriver: false,
  }).start()
}

export function hideHeader() {
  Animated.timing(headerAnimHeight, {
    toValue: 0,
    duration: 180,
    useNativeDriver: false,
  }).start()
}
