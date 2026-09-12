/**
 * KidTok theme — mirrors lib/core/theme/theme_colors.dart from the Flutter app
 * exactly, so the mobile + web React Native app feels identical to users
 * coming from the legacy Flutter app.
 */
export const colors = {
  // ── Primary Colors ─────────────────────────────────────────
  primary:          '#03BBE5',
  primaryLight:     '#CCE6FA',
  primarySemiDark:  '#0F75CE',
  primarySemiLight: '#F96286',  // pink (alias of secondary)
  primaryDark:      '#07375B',
  primaryContainer: '#E3F2FD',

  // ── Secondary Colors ───────────────────────────────────────
  secondary:          '#F96286',
  secondaryContainer: '#FBE4D6',

  // ── Surface / text ────────────────────────────────────────
  surface:        '#FFFFFF',
  white:          '#FFFFFF',
  black:          '#0A0A0A',
  onPrimary:      '#FFFFFF',
  onSecondary:    '#FFFFFF',
  onSurface:      '#333333',
  onBackground:   '#333333',
  primaryTextDark:  '#14181B',
  primaryTextLight: '#FFFFFF',

  // ── Neutrals (from Flutter theme) ─────────────────────────
  neutral200: '#F5F7F9',
  neutral300: '#EBEEF2',
  neutral400: '#CCD4DF',
  neutral700: '#6D8195',
  neutral900: '#181B20',
  grey:       '#667085',

  // Aliases used throughout the codebase
  grey50:  '#F5F7F9',  // = neutral200
  grey100: '#EBEEF2',  // = neutral300
  grey200: '#CCD4DF',  // = neutral400
  grey300: '#9BA8BC',
  grey400: '#7e8da6',
  grey500: '#738399',
  grey600: '#6D8195',  // = neutral700
  grey700: '#667085',  // = grey
  grey900: '#181B20',  // = neutral900

  // ── Complementary / accents (from Flutter) ────────────────
  complementary: '#F78F1E',  // orange
  ghostWhite:    '#F9F8FD',
  rainbow:       '#163B6E',
  chineseBronze: '#CC842A',
  shadowBlue:    '#7E8DA6',

  // ── Status colors (from Flutter) ──────────────────────────
  success:     '#43A047',
  successLight:'#EDF7F1',
  warning:     '#FFB429',
  warningLight:'#FEF5E3',
  error:       '#E44E35',
  errorLight:  '#FFF0EB',
  errorText:   '#CC412B',
  info:        '#0F75CE',
  infoLight:   '#D0E4FC',
  green:       '#43A047',  // alias for success
  red:         '#E44E35',  // alias for error
  amber:       '#FFB429',  // alias for warning
  amber400:    '#FBBF24',

  // ── Gold (for coins) ──────────────────────────────────────
  gold:        '#C6862B',
  goldLight:   '#FFD54F',

  // ── Form field colors ─────────────────────────────────────
  boxBorderGray: '#DEDDDD',
  hintGray:      '#828181',
  disabledGray:  '#F5F7F9',
  hintTextGray:  '#838383',
  lightGray:     '#F9F9FA',
}

// Convenience gradients (matching Flutter's RadialGradient stops)
export const gradients = {
  primary:   ['#CCE6FA', '#0F75CE', '#07375B'] as const,
  dark:      ['#03BBE5', '#0F75CE'] as const,
  secondary: ['#FBE4D6', '#F96286'] as const,
  gold:      ['#FFD54F', '#C6862B'] as const,
  hero:      ['#03BBE5', '#0F75CE', '#F96286'] as const, // landing/onboarding
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
}

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
}

export const fonts = {
  cairo: 'Cairo',
  cairoFallback: 'Cairo, system-ui, sans-serif',
}
