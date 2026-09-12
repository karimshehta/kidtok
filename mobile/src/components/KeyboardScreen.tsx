/**
 * KeyboardScreen — Global keyboard handler
 *
 * Drop-in wrapper that handles keyboard avoidance on ALL screens with inputs.
 * Modeled after WhatsApp / Messenger / ChatGPT mobile UX.
 *
 * Usage:
 *   <KeyboardScreen>
 *     <YourContent />
 *   </KeyboardScreen>
 *
 *   // With ScrollView (recommended for forms)
 *   <KeyboardScreen scrollable>
 *     <Field1 />
 *     <Field2 />
 *     <SubmitButton />
 *   </KeyboardScreen>
 *
 *   // For chat-like UIs with fixed input bar at bottom
 *   <KeyboardScreen variant="chat">
 *     <Messages />
 *     <Composer />
 *   </KeyboardScreen>
 */
import { ReactNode } from 'react'
import {
  View, KeyboardAvoidingView, Platform,
  ScrollView, TouchableWithoutFeedback, Keyboard,
  StyleSheet, ViewStyle,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

interface Props {
  children: ReactNode
  /**
   * 'form'  — for screens with form fields + submit button (default)
   *           Wraps in ScrollView, dismisses on tap-outside
   * 'chat'  — for chat/comments with fixed input at bottom
   *           Adjusts position to push input above keyboard
   * 'simple'— minimal wrapper, no ScrollView
   */
  variant?: 'form' | 'chat' | 'simple'
  /** Make content scrollable (auto-enabled in 'form' variant) */
  scrollable?: boolean
  /** Style for outer SafeAreaView */
  style?: ViewStyle
  /** Style for inner content container */
  contentStyle?: ViewStyle
  /** Background color */
  backgroundColor?: string
  /** Disable dismiss on tap-outside */
  noDismiss?: boolean
  /** Custom keyboardVerticalOffset (height of any fixed header) */
  headerOffset?: number
  /** Edges for SafeAreaView */
  edges?: ('top' | 'bottom' | 'left' | 'right')[]
}

export default function KeyboardScreen({
  children,
  variant = 'form',
  scrollable,
  style,
  contentStyle,
  backgroundColor = '#FFFFFF',
  noDismiss,
  headerOffset = 0,
  edges = ['top', 'bottom'],
}: Props) {
  const insets = useSafeAreaInsets()

  // iOS uses padding, Android handles via windowSoftInputMode=adjustResize
  const behavior = Platform.OS === 'ios' ? 'padding' : undefined
  const offset   = Platform.OS === 'ios' ? headerOffset : 0

  // Form variant: ScrollView wrapper + tap-to-dismiss
  if (variant === 'form' || scrollable) {
    const inner = (
      <ScrollView
        contentContainerStyle={[
          { flexGrow: 1, paddingBottom: 24 },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    )

    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor }, style]} edges={edges}>
        <KeyboardAvoidingView
          behavior={behavior}
          keyboardVerticalOffset={offset}
          style={{ flex: 1 }}
        >
          {noDismiss ? inner : (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              {inner}
            </TouchableWithoutFeedback>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // Chat variant: pushes content up smoothly
  if (variant === 'chat') {
    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor }, style]} edges={edges}>
        <KeyboardAvoidingView
          behavior={behavior}
          keyboardVerticalOffset={offset}
          style={[{ flex: 1 }, contentStyle]}
        >
          {children}
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // Simple variant: just KAV + SafeArea, no scroll
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor }, style]} edges={edges}>
      <KeyboardAvoidingView
        behavior={behavior}
        keyboardVerticalOffset={offset}
        style={[{ flex: 1 }, contentStyle]}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
