import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg'

import { getKidAvatar } from '@/lib/kidAvatars'

type Props = {
  avatarId?: string | null
  size?: number
  variant?: 'full' | 'badge'
}

type MaskTheme = {
  main: string
  light: string
  dark: string
  inner: string
  nose: string
  kind: 'bear' | 'cat' | 'robot' | 'lion' | 'hero' | 'princess' | 'space' | 'king' | 'elephant' | 'dino'
}

const DEFAULT_THEME: MaskTheme = {
  main: '#9CA3AF',
  light: '#F8FAFC',
  dark: '#4B5563',
  inner: '#FBCFE8',
  nose: '#111827',
  kind: 'bear',
}

const THEMES: Record<string, MaskTheme> = {
  boy: { main: '#9CA3AF', light: '#F8FAFC', dark: '#4B5563', inner: '#FBCFE8', nose: '#111827', kind: 'bear' },
  girl: { main: '#F9A8D4', light: '#FFF7ED', dark: '#DB2777', inner: '#FBCFE8', nose: '#7C2D12', kind: 'cat' },
  robot: { main: '#94A3B8', light: '#E0F2FE', dark: '#334155', inner: '#67E8F9', nose: '#0F172A', kind: 'robot' },
  'cartoon-boy': { main: '#60A5FA', light: '#EFF6FF', dark: '#1D4ED8', inner: '#BFDBFE', nose: '#1E3A8A', kind: 'bear' },
  'cartoon-girl': { main: '#FB7185', light: '#FFF1F2', dark: '#BE123C', inner: '#FBCFE8', nose: '#831843', kind: 'cat' },
  lion: { main: '#F59E0B', light: '#FEF3C7', dark: '#92400E', inner: '#FED7AA', nose: '#451A03', kind: 'lion' },
  superhero: { main: '#2563EB', light: '#DBEAFE', dark: '#1E3A8A', inner: '#FDE68A', nose: '#111827', kind: 'hero' },
  princess: { main: '#EC4899', light: '#FCE7F3', dark: '#9D174D', inner: '#FBCFE8', nose: '#831843', kind: 'princess' },
  astronaut: { main: '#0EA5E9', light: '#E0F2FE', dark: '#075985', inner: '#BAE6FD', nose: '#0F172A', kind: 'space' },
  king: { main: '#EAB308', light: '#FEF9C3', dark: '#854D0E', inner: '#FDE68A', nose: '#451A03', kind: 'king' },
  elephant: { main: '#93A4B8', light: '#F8FAFC', dark: '#475569', inner: '#FBCFE8', nose: '#111827', kind: 'elephant' },
  dinosaur: { main: '#8B5CF6', light: '#F3E8FF', dark: '#5B21B6', inner: '#C4B5FD', nose: '#2E1065', kind: 'dino' },
}

export default function KidAvatarMaskArt({ avatarId, size = 220, variant = 'full' }: Props) {
  const avatar = getKidAvatar(avatarId)
  const theme = THEMES[avatar?.id || ''] || DEFAULT_THEME
  const strokeWidth = variant === 'badge' ? 4 : 5

  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      <G>
        <Accessory theme={theme} />
        <Ears theme={theme} />
        <FaceBand theme={theme} strokeWidth={strokeWidth} />
        <Muzzle theme={theme} />
        <Details theme={theme} />
      </G>
    </Svg>
  )
}

function Ears({ theme }: { theme: MaskTheme }) {
  if (theme.kind === 'robot') {
    return (
      <G>
        <Rect x="36" y="32" width="48" height="50" rx="12" fill={theme.main} stroke={theme.dark} strokeWidth="5" />
        <Rect x="156" y="32" width="48" height="50" rx="12" fill={theme.main} stroke={theme.dark} strokeWidth="5" />
        <Circle cx="60" cy="56" r="8" fill={theme.inner} />
        <Circle cx="180" cy="56" r="8" fill={theme.inner} />
      </G>
    )
  }

  if (theme.kind === 'lion') {
    return (
      <G>
        <Path d="M33 90 C24 48 55 18 90 50 C69 52 55 68 49 96 Z" fill={theme.dark} />
        <Path d="M207 90 C216 48 185 18 150 50 C171 52 185 68 191 96 Z" fill={theme.dark} />
        <Path d="M51 86 C47 58 66 40 84 55 C69 58 59 69 55 92 Z" fill={theme.inner} />
        <Path d="M189 86 C193 58 174 40 156 55 C171 58 181 69 185 92 Z" fill={theme.inner} />
      </G>
    )
  }

  if (theme.kind === 'cat' || theme.kind === 'dino') {
    return (
      <G>
        <Path d="M40 86 L72 24 L102 88 Z" fill={theme.main} stroke={theme.dark} strokeWidth="5" strokeLinejoin="round" />
        <Path d="M200 86 L168 24 L138 88 Z" fill={theme.main} stroke={theme.dark} strokeWidth="5" strokeLinejoin="round" />
        <Path d="M62 76 L74 49 L88 77 Z" fill={theme.inner} />
        <Path d="M178 76 L166 49 L152 77 Z" fill={theme.inner} />
      </G>
    )
  }

  if (theme.kind === 'elephant') {
    return (
      <G>
        <Ellipse cx="48" cy="78" rx="40" ry="48" fill={theme.main} stroke={theme.dark} strokeWidth="5" />
        <Ellipse cx="192" cy="78" rx="40" ry="48" fill={theme.main} stroke={theme.dark} strokeWidth="5" />
        <Ellipse cx="53" cy="82" rx="22" ry="28" fill={theme.inner} opacity="0.75" />
        <Ellipse cx="187" cy="82" rx="22" ry="28" fill={theme.inner} opacity="0.75" />
      </G>
    )
  }

  return (
    <G>
      <Path d="M39 88 C34 44 65 22 94 55 C74 55 58 69 52 96 Z" fill={theme.main} stroke={theme.dark} strokeWidth="5" />
      <Path d="M201 88 C206 44 175 22 146 55 C166 55 182 69 188 96 Z" fill={theme.main} stroke={theme.dark} strokeWidth="5" />
      <Path d="M58 80 C57 58 72 47 88 59 C74 62 65 72 62 87 Z" fill={theme.inner} />
      <Path d="M182 80 C183 58 168 47 152 59 C166 62 175 72 178 87 Z" fill={theme.inner} />
    </G>
  )
}

function FaceBand({ theme, strokeWidth }: { theme: MaskTheme; strokeWidth: number }) {
  if (theme.kind === 'robot') {
    return (
      <Rect
        x="31"
        y="86"
        width="178"
        height="104"
        rx="34"
        fill={theme.main}
        stroke={theme.dark}
        strokeWidth={strokeWidth}
      />
    )
  }

  return (
    <Path
      d="M31 110 C44 88 77 82 120 82 C163 82 196 88 209 110 L199 176 C187 203 155 216 120 216 C85 216 53 203 41 176 Z"
      fill={theme.main}
      stroke={theme.dark}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  )
}

function Muzzle({ theme }: { theme: MaskTheme }) {
  if (theme.kind === 'elephant') {
    return (
      <G>
        <Path d="M92 121 C100 107 140 107 148 121 C151 150 143 188 121 212 C100 190 89 151 92 121 Z" fill={theme.light} />
        <Path d="M121 124 C120 151 120 176 120 199" stroke={theme.dark} strokeWidth="5" strokeLinecap="round" />
        <Path d="M120 199 C132 199 138 192 139 184" stroke={theme.dark} strokeWidth="5" strokeLinecap="round" fill="none" />
      </G>
    )
  }

  if (theme.kind === 'robot') {
    return (
      <G>
        <Rect x="67" y="111" width="106" height="55" rx="18" fill={theme.light} />
        <Rect x="84" y="128" width="72" height="17" rx="8" fill={theme.nose} />
        <Circle cx="97" cy="136" r="4" fill="#67E8F9" />
        <Circle cx="120" cy="136" r="4" fill="#67E8F9" />
        <Circle cx="143" cy="136" r="4" fill="#67E8F9" />
      </G>
    )
  }

  return (
    <G>
      <Ellipse cx="120" cy="151" rx="58" ry="48" fill={theme.light} />
      <Ellipse cx="120" cy="126" rx="24" ry="19" fill={theme.nose} />
      <Line x1="120" y1="142" x2="120" y2="166" stroke={theme.nose} strokeWidth="5" strokeLinecap="round" />
      <Path d="M120 166 C109 184 88 181 79 163" stroke={theme.nose} strokeWidth="5" strokeLinecap="round" fill="none" />
      <Path d="M120 166 C131 184 152 181 161 163" stroke={theme.nose} strokeWidth="5" strokeLinecap="round" fill="none" />
    </G>
  )
}

function Details({ theme }: { theme: MaskTheme }) {
  if (theme.kind === 'hero') {
    return (
      <G>
        <Path d="M70 104 L120 76 L170 104 L120 98 Z" fill="#FDE047" opacity="0.95" />
        <Path d="M63 112 L101 112" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
        <Path d="M139 112 L177 112" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      </G>
    )
  }

  if (theme.kind === 'princess' || theme.kind === 'king') {
    return (
      <G>
        <Path d="M80 78 L96 45 L120 76 L144 45 L160 78 Z" fill="#FDE047" stroke={theme.dark} strokeWidth="4" strokeLinejoin="round" />
        <Circle cx="96" cy="48" r="6" fill="#F472B6" />
        <Circle cx="144" cy="48" r="6" fill="#38BDF8" />
      </G>
    )
  }

  if (theme.kind === 'space') {
    return (
      <G>
        <Ellipse cx="120" cy="78" rx="64" ry="20" fill="none" stroke="#BAE6FD" strokeWidth="7" opacity="0.9" />
        <Circle cx="173" cy="69" r="8" fill="#FDE047" />
      </G>
    )
  }

  if (theme.kind === 'dino') {
    return (
      <G>
        <Path d="M75 84 L91 60 L107 84 Z" fill="#C4B5FD" />
        <Path d="M111 83 L127 57 L143 83 Z" fill="#C4B5FD" />
        <Path d="M147 84 L163 60 L179 84 Z" fill="#C4B5FD" />
      </G>
    )
  }

  if (theme.kind === 'lion') {
    return (
      <G opacity="0.95">
        <Path d="M38 117 C25 128 26 148 42 155" stroke={theme.dark} strokeWidth="7" strokeLinecap="round" fill="none" />
        <Path d="M202 117 C215 128 214 148 198 155" stroke={theme.dark} strokeWidth="7" strokeLinecap="round" fill="none" />
      </G>
    )
  }

  return (
    <G>
      <Circle cx="83" cy="145" r="3" fill={theme.nose} />
      <Circle cx="96" cy="154" r="3" fill={theme.nose} />
      <Circle cx="157" cy="145" r="3" fill={theme.nose} />
      <Circle cx="144" cy="154" r="3" fill={theme.nose} />
    </G>
  )
}

function Accessory({ theme }: { theme: MaskTheme }) {
  if (theme.kind !== 'cat' && theme.kind !== 'princess') return null
  return (
    <G>
      <Path d="M47 103 C31 92 27 72 40 60 C53 72 58 88 47 103 Z" fill="#F472B6" />
      <Circle cx="43" cy="62" r="5" fill="#FDE68A" />
    </G>
  )
}
