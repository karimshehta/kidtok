import type { ReactElement } from 'react'
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg'

/**
 * Landmark-anchored filter art. Each avatar filter is split into independent
 * parts so glasses land on the eyes, moustaches under the nose, trunks on the
 * nose and ears/crowns on top of the head — the way TikTok-style masks behave.
 *
 * All parts share a 240×240 design space (the same one KidFaceFilterArt uses)
 * so the shapes below reuse the original artwork coordinates.
 *
 * - `anchor`     the tracked face point this part follows.
 * - `designAnchor` the point inside the 240×240 art that must land exactly on
 *                the tracked anchor point.
 * - `widthInIod` how wide the whole 240 design box should appear on screen,
 *                measured in interocular distances (distance between the eyes).
 * - `followMouth` parts that playfully stretch when the child opens their mouth.
 */
export type FilterAnchor = 'eyes' | 'nose' | 'mouth' | 'muzzle' | 'headTop'

export type FilterPart = {
  key: string
  anchor: FilterAnchor
  designAnchor: { x: number; y: number }
  widthInIod: number
  followMouth?: boolean
  /**
   * A mouth interior drawn fully open: collapses into a thin lip line when the
   * child's mouth is closed and opens with their real jaw while talking.
   */
  mouthCavity?: boolean
  render: () => ReactElement
}

export const FILTER_ART_SIZE = 240

function PartSvg({ children }: { children: ReactElement | ReactElement[] }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 240 240">
      {children}
    </Svg>
  )
}

/**
 * Shared talking mouth: drawn FULLY OPEN near the top of the design box so the
 * jaw-pinned cavity scaling opens it downward from the upper lip. Dark mouth
 * interior + upper teeth + tongue, TikTok-cartoon style.
 */
function mouthCavityPart(key: string): FilterPart {
  return {
    key,
    anchor: 'mouth',
    designAnchor: { x: 120, y: 10 },
    widthInIod: 2.3,
    mouthCavity: true,
    render: () => (
      <PartSvg>
        <G>
          <Ellipse cx="120" cy="68" rx="52" ry="60" fill="#7F1D1D" stroke="#450A0A" strokeWidth="6" />
          <Rect x="88" y="12" width="64" height="18" rx="7" fill="#FFF7ED" />
          <Ellipse cx="120" cy="106" rx="32" ry="22" fill="#F87171" stroke="#DC2626" strokeWidth="3" />
        </G>
      </PartSvg>
    ),
  }
}

// ─── Bear (boy) ───────────────────────────────────────────────────────────────

const bearParts: FilterPart[] = [
  {
    key: 'bear-ears',
    anchor: 'headTop',
    designAnchor: { x: 120, y: 62 },
    widthInIod: 3.4,
    render: () => (
      <PartSvg>
        <G>
          <Circle cx="48" cy="56" r="31" fill="#8E98A8" stroke="#4B5563" strokeWidth="5" />
          <Circle cx="192" cy="56" r="31" fill="#8E98A8" stroke="#4B5563" strokeWidth="5" />
          <Circle cx="48" cy="56" r="16" fill="#F7C6CF" />
          <Circle cx="192" cy="56" r="16" fill="#F7C6CF" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'bear-muzzle',
    anchor: 'muzzle',
    designAnchor: { x: 120, y: 150 },
    widthInIod: 3.1,
    followMouth: true,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M39 150 C52 125 82 118 120 118 C158 118 188 125 201 150 L192 190 C172 213 68 213 48 190 Z" fill="#A7AFBA" stroke="#4B5563" strokeWidth="5" />
          <Ellipse cx="120" cy="168" rx="54" ry="37" fill="#F8FAFC" />
          <Ellipse cx="120" cy="148" rx="18" ry="13" fill="#20232A" />
          <Line x1="120" y1="160" x2="120" y2="178" stroke="#20232A" strokeWidth="5" strokeLinecap="round" />
        </G>
      </PartSvg>
    ),
  },
  mouthCavityPart('bear-mouth'),
]

// ─── Cat (girl / cartoon-girl) ───────────────────────────────────────────────

function catParts(pink: boolean): FilterPart[] {
  const main = pink ? '#FB7185' : '#F9A8D4'
  const stroke = pink ? '#9F1239' : '#BE185D'
  return [
    {
      key: 'cat-ears',
      anchor: 'headTop',
      designAnchor: { x: 120, y: 72 },
      widthInIod: 3.5,
      render: () => (
        <PartSvg>
          <G>
            <Path d="M30 88 L58 20 L98 88 Z" fill={main} stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
            <Path d="M210 88 L182 20 L142 88 Z" fill={main} stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
            <Path d="M46 75 L59 43 L78 77 Z" fill="#FDE2E8" />
            <Path d="M194 75 L181 43 L162 77 Z" fill="#FDE2E8" />
          </G>
        </PartSvg>
      ),
    },
    {
      key: 'cat-muzzle',
      anchor: 'muzzle',
      designAnchor: { x: 120, y: 152 },
      widthInIod: 3.1,
      followMouth: true,
      render: () => (
        <PartSvg>
          <G>
            <Path d="M40 153 C54 128 82 120 120 120 C158 120 186 128 200 153 L191 191 C169 212 71 212 49 191 Z" fill={main} stroke={stroke} strokeWidth="5" />
            <Ellipse cx="120" cy="171" rx="53" ry="35" fill="#FFF7ED" />
            <Path d="M107 150 L133 150 L120 167 Z" fill={stroke} />
            <Line x1="120" y1="166" x2="120" y2="180" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
            <Line x1="58" y1="168" x2="91" y2="174" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
            <Line x1="182" y1="168" x2="149" y2="174" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          </G>
        </PartSvg>
      ),
    },
    mouthCavityPart(pink ? 'cartoon-cat-mouth' : 'cat-mouth'),
  ]
}

// ─── Robot ────────────────────────────────────────────────────────────────────

const robotParts: FilterPart[] = [
  {
    key: 'robot-antenna',
    anchor: 'headTop',
    designAnchor: { x: 120, y: 52 },
    widthInIod: 3.3,
    render: () => (
      <PartSvg>
        <G>
          <Rect x="95" y="20" width="50" height="28" rx="14" fill="#64748B" stroke="#1E293B" strokeWidth="5" />
          <Circle cx="120" cy="27" r="6" fill="#22D3EE" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'robot-visor',
    anchor: 'eyes',
    designAnchor: { x: 119, y: 124 },
    widthInIod: 2.95,
    render: () => (
      <PartSvg>
        <G>
          <Rect x="31" y="90" width="178" height="70" rx="30" fill="#94A3B8" fillOpacity="0.35" stroke="#334155" strokeWidth="6" />
          <Rect x="48" y="106" width="62" height="37" rx="16" fill="#0F172A" fillOpacity="0.28" stroke="#0F172A" strokeWidth="4" />
          <Rect x="130" y="106" width="62" height="37" rx="16" fill="#0F172A" fillOpacity="0.28" stroke="#0F172A" strokeWidth="4" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'robot-grille',
    anchor: 'muzzle',
    designAnchor: { x: 120, y: 165 },
    widthInIod: 3.1,
    followMouth: true,
    render: () => (
      <PartSvg>
        <G>
          <Rect x="72" y="158" width="96" height="43" rx="16" fill="#E0F2FE" stroke="#334155" strokeWidth="5" />
          <Circle cx="95" cy="180" r="5" fill="#22D3EE" /><Circle cx="120" cy="180" r="5" fill="#22D3EE" /><Circle cx="145" cy="180" r="5" fill="#22D3EE" />
        </G>
      </PartSvg>
    ),
  },
]

// ─── Funny glasses (cartoon-boy) ─────────────────────────────────────────────

const funnyGlassesParts: FilterPart[] = [
  {
    key: 'glasses',
    anchor: 'eyes',
    designAnchor: { x: 120, y: 124 },
    widthInIod: 2.55,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M31 103 L94 92 L106 111 L134 111 L146 92 L209 103" stroke="#F97316" strokeWidth="12" strokeLinecap="round" fill="none" />
          <Circle cx="73" cy="124" r="36" fill="#FEF3C7" fillOpacity="0.46" stroke="#F97316" strokeWidth="9" />
          <Circle cx="167" cy="124" r="36" fill="#FEF3C7" fillOpacity="0.46" stroke="#F97316" strokeWidth="9" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'moustache',
    anchor: 'nose',
    designAnchor: { x: 120, y: 160 },
    widthInIod: 2.9,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M91 174 C102 158 138 158 149 174 C140 201 100 201 91 174 Z" fill="#4B2E1E" />
          <Path d="M120 163 L120 181" stroke="#4B2E1E" strokeWidth="6" strokeLinecap="round" />
        </G>
      </PartSvg>
    ),
  },
  mouthCavityPart('glasses-mouth'),
]

// ─── Lion ─────────────────────────────────────────────────────────────────────

// A premium TikTok-style accessory. Semi-transparent lenses leave the child's
// own eyes visible, while the single eye-line anchor makes both lenses rotate,
// scale and move as one stable pair.
const blackSunglassesParts: FilterPart[] = [
  {
    key: 'black-shades',
    anchor: 'eyes',
    designAnchor: { x: 120, y: 124 },
    widthInIod: 3.15,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M27 103 L91 94 L107 113 L133 113 L149 94 L213 103" stroke="#020617" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M31 112 C40 96 64 90 92 98 L104 129 C92 154 58 159 40 142 Z" fill="#111827" fillOpacity="0.78" stroke="#020617" strokeWidth="8" strokeLinejoin="round" />
          <Path d="M209 112 C200 96 176 90 148 98 L136 129 C148 154 182 159 200 142 Z" fill="#111827" fillOpacity="0.78" stroke="#020617" strokeWidth="8" strokeLinejoin="round" />
          <Path d="M53 111 C65 103 80 103 91 110" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="5" strokeLinecap="round" />
          <Path d="M149 110 C160 103 175 103 187 111" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="5" strokeLinecap="round" />
        </G>
      </PartSvg>
    ),
  },
]

const lionParts: FilterPart[] = [
  {
    key: 'lion-ears',
    anchor: 'headTop',
    designAnchor: { x: 120, y: 70 },
    widthInIod: 3.4,
    render: () => (
      <PartSvg>
        <G>
          <Circle cx="45" cy="65" r="33" fill="#A16207" /><Circle cx="195" cy="65" r="33" fill="#A16207" />
          <Circle cx="45" cy="65" r="18" fill="#FDE68A" /><Circle cx="195" cy="65" r="18" fill="#FDE68A" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'lion-muzzle',
    anchor: 'muzzle',
    designAnchor: { x: 120, y: 152 },
    widthInIod: 3.2,
    followMouth: true,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M38 154 C50 126 82 117 120 117 C158 117 190 126 202 154 L190 195 C163 219 77 219 50 195 Z" fill="#F59E0B" stroke="#92400E" strokeWidth="6" />
          <Ellipse cx="120" cy="173" rx="55" ry="39" fill="#FEF3C7" />
          <Ellipse cx="120" cy="150" rx="18" ry="13" fill="#451A03" />
          <Line x1="120" y1="162" x2="120" y2="180" stroke="#451A03" strokeWidth="5" strokeLinecap="round" />
        </G>
      </PartSvg>
    ),
  },
  mouthCavityPart('lion-mouth'),
]

// ─── Superhero ────────────────────────────────────────────────────────────────

const heroParts: FilterPart[] = [
  {
    key: 'hero-mask',
    anchor: 'eyes',
    designAnchor: { x: 120, y: 122 },
    widthInIod: 2.95,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M34 117 C57 89 90 83 120 97 C150 83 183 89 206 117 L184 154 C162 145 141 144 120 157 C99 144 78 145 56 154 Z" fill="#2563EB" stroke="#172554" strokeWidth="6" />
          <Path d="M57 119 C72 111 90 111 101 121 C92 135 76 138 62 132 Z" fill="#FFFFFF" fillOpacity="0.35" />
          <Path d="M183 119 C168 111 150 111 139 121 C148 135 164 138 178 132 Z" fill="#FFFFFF" fillOpacity="0.35" />
          <Path d="M120 89 L132 108 L120 120 L108 108 Z" fill="#FDE047" stroke="#A16207" strokeWidth="3" />
        </G>
      </PartSvg>
    ),
  },
]

// ─── Princess ─────────────────────────────────────────────────────────────────

const princessParts: FilterPart[] = [
  {
    key: 'princess-crown',
    anchor: 'headTop',
    designAnchor: { x: 120, y: 80 },
    widthInIod: 3.7,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M55 84 L69 27 L99 62 L120 18 L141 62 L171 27 L185 84 Z" fill="#FDE047" stroke="#A21CAF" strokeWidth="6" strokeLinejoin="round" />
          <Circle cx="69" cy="30" r="7" fill="#38BDF8" /><Circle cx="120" cy="20" r="8" fill="#F472B6" /><Circle cx="171" cy="30" r="7" fill="#A78BFA" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'princess-cheeks',
    anchor: 'muzzle',
    designAnchor: { x: 120, y: 160 },
    widthInIod: 3.6,
    followMouth: true,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M81 146 C98 129 142 129 159 146 L147 190 C133 200 107 200 93 190 Z" fill="#FBCFE8" fillOpacity="0.85" stroke="#BE185D" strokeWidth="5" />
          <Ellipse cx="120" cy="164" rx="31" ry="23" fill="#FFF7ED" />
          <Circle cx="107" cy="164" r="3" fill="#EC4899" /><Circle cx="133" cy="164" r="3" fill="#EC4899" />
        </G>
      </PartSvg>
    ),
  },
  mouthCavityPart('princess-mouth'),
]

// ─── Astronaut ────────────────────────────────────────────────────────────────

const astronautParts: FilterPart[] = [
  {
    key: 'astro-visor',
    anchor: 'eyes',
    designAnchor: { x: 120, y: 116 },
    widthInIod: 4.2,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M44 118 C57 65 183 65 196 118 L182 164 C159 180 81 180 58 164 Z" fill="#E0F2FE" fillOpacity="0.35" stroke="#075985" strokeWidth="6" />
          <Path d="M65 115 C78 82 162 82 175 115 C162 141 78 141 65 115 Z" fill="#0EA5E9" fillOpacity="0.3" stroke="#BAE6FD" strokeWidth="5" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'astro-comm',
    anchor: 'muzzle',
    designAnchor: { x: 120, y: 170 },
    widthInIod: 3.6,
    render: () => (
      <PartSvg>
        <G>
          <Rect x="94" y="161" width="52" height="27" rx="12" fill="#F8FAFC" stroke="#075985" strokeWidth="4" />
          <Circle cx="111" cy="175" r="4" fill="#22D3EE" /><Circle cx="129" cy="175" r="4" fill="#F472B6" />
        </G>
      </PartSvg>
    ),
  },
]

// ─── King ─────────────────────────────────────────────────────────────────────

const kingParts: FilterPart[] = [
  {
    key: 'king-crown',
    anchor: 'headTop',
    designAnchor: { x: 120, y: 86 },
    widthInIod: 3.8,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M50 90 L61 29 L94 62 L120 20 L146 62 L179 29 L190 90 Z" fill="#F59E0B" stroke="#854D0E" strokeWidth="7" strokeLinejoin="round" />
          <Circle cx="61" cy="31" r="7" fill="#EF4444" /><Circle cx="120" cy="21" r="8" fill="#2563EB" /><Circle cx="179" cy="31" r="7" fill="#22C55E" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'king-moustache',
    anchor: 'nose',
    designAnchor: { x: 120, y: 148 },
    widthInIod: 3.6,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M77 158 C91 142 110 147 120 162 C130 147 149 142 163 158 C152 187 137 189 120 176 C103 189 88 187 77 158 Z" fill="#4B2E1E" />
          <Line x1="120" y1="153" x2="120" y2="177" stroke="#4B2E1E" strokeWidth="6" strokeLinecap="round" />
        </G>
      </PartSvg>
    ),
  },
  mouthCavityPart('king-mouth'),
]

// ─── Elephant ─────────────────────────────────────────────────────────────────

const elephantParts: FilterPart[] = [
  {
    key: 'elephant-ears',
    anchor: 'eyes',
    designAnchor: { x: 120, y: 104 },
    widthInIod: 4.2,
    render: () => (
      <PartSvg>
        <G>
          <Ellipse cx="44" cy="102" rx="39" ry="50" fill="#94A3B8" stroke="#475569" strokeWidth="6" />
          <Ellipse cx="196" cy="102" rx="39" ry="50" fill="#94A3B8" stroke="#475569" strokeWidth="6" />
          <Ellipse cx="44" cy="104" rx="23" ry="32" fill="#FBCFE8" /><Ellipse cx="196" cy="104" rx="23" ry="32" fill="#FBCFE8" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'elephant-trunk',
    anchor: 'nose',
    designAnchor: { x: 120, y: 136 },
    widthInIod: 3.8,
    followMouth: true,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M88 139 C99 121 141 121 152 139 C156 165 149 205 121 222 C94 206 84 166 88 139 Z" fill="#A8B5C2" stroke="#475569" strokeWidth="6" />
          <Path d="M121 144 L121 204 C133 205 141 198 143 188" stroke="#475569" strokeWidth="6" strokeLinecap="round" fill="none" />
          <Circle cx="110" cy="143" r="4" fill="#475569" /><Circle cx="132" cy="143" r="4" fill="#475569" />
        </G>
      </PartSvg>
    ),
  },
]

// ─── Dinosaur ─────────────────────────────────────────────────────────────────

const dinoParts: FilterPart[] = [
  {
    key: 'dino-spikes',
    anchor: 'headTop',
    designAnchor: { x: 120, y: 88 },
    widthInIod: 3.9,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M60 93 L81 28 L104 89 L120 20 L136 89 L159 28 L180 93" fill="#8B5CF6" stroke="#5B21B6" strokeWidth="6" strokeLinejoin="round" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'dino-muzzle',
    anchor: 'muzzle',
    designAnchor: { x: 120, y: 152 },
    widthInIod: 3.2,
    followMouth: true,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M43 153 C57 127 88 118 120 118 C152 118 183 127 197 153 L187 192 C166 212 74 212 53 192 Z" fill="#A78BFA" stroke="#5B21B6" strokeWidth="6" />
          <Ellipse cx="120" cy="171" rx="52" ry="34" fill="#EDE9FE" />
          <Path d="M101 154 L114 171 L101 188 L88 171 Z M139 154 L152 171 L139 188 L126 171 Z" fill="#5B21B6" />
        </G>
      </PartSvg>
    ),
  },
  mouthCavityPart('dino-mouth'),
]

// ─── Grandpa (white hair + black glasses + black moustache) ──────────────────

const grandpaParts: FilterPart[] = [
  {
    key: 'grandpa-hair',
    anchor: 'headTop',
    designAnchor: { x: 120, y: 78 },
    widthInIod: 3.5,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M34 88 C30 52 60 30 90 34 C100 22 140 22 150 34 C180 30 210 52 206 88 C196 74 178 68 164 72 C152 58 88 58 76 72 C62 68 44 74 34 88 Z" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="5" strokeLinejoin="round" />
          <Circle cx="40" cy="96" r="14" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="4" />
          <Circle cx="200" cy="96" r="14" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="4" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'grandpa-glasses',
    anchor: 'eyes',
    designAnchor: { x: 120, y: 126 },
    widthInIod: 2.55,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M48 102 C58 94 74 93 86 98 M154 98 C166 93 182 94 192 102" stroke="#E2E8F0" strokeWidth="9" strokeLinecap="round" fill="none" />
          <Circle cx="73" cy="126" r="33" fill="#F8FAFC" fillOpacity="0.14" stroke="#111827" strokeWidth="9" />
          <Circle cx="167" cy="126" r="33" fill="#F8FAFC" fillOpacity="0.14" stroke="#111827" strokeWidth="9" />
          <Path d="M106 122 C114 116 126 116 134 122" stroke="#111827" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M40 120 L31 112 M200 120 L209 112" stroke="#111827" strokeWidth="8" strokeLinecap="round" />
        </G>
      </PartSvg>
    ),
  },
  {
    key: 'grandpa-moustache',
    anchor: 'nose',
    designAnchor: { x: 120, y: 158 },
    widthInIod: 3.0,
    followMouth: true,
    render: () => (
      <PartSvg>
        <G>
          <Path d="M78 172 C92 154 112 158 120 170 C128 158 148 154 162 172 C154 194 134 196 120 184 C106 196 86 194 78 172 Z" fill="#111827" />
        </G>
      </PartSvg>
    ),
  },
  mouthCavityPart('grandpa-mouth'),
]

const PART_SETS: Record<string, FilterPart[]> = {
  boy: bearParts,
  girl: catParts(false),
  'cartoon-girl': catParts(true),
  robot: robotParts,
  'cartoon-boy': funnyGlassesParts,
  black_sunglasses: blackSunglassesParts,
  lion: lionParts,
  superhero: heroParts,
  princess: princessParts,
  astronaut: astronautParts,
  king: kingParts,
  elephant: elephantParts,
  dinosaur: dinoParts,
  grandpa: grandpaParts,
}

export function getFilterParts(avatarId?: string | null): FilterPart[] {
  if (!avatarId) return PART_SETS.boy
  return PART_SETS[avatarId] || PART_SETS.boy
}
