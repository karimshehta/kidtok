/**
 * KidTok fun sound-effects library.
 *
 * Source: Google Assistant Sound Library (actions.google.com/sounds) —
 * royalty-free for use in projects, no attribution required, stable direct
 * OGG links. EVERY URL below was verified with an HTTP 200 check on
 * 2026-07-20 — do not add entries without verifying them the same way:
 *   curl -sI -o /dev/null -w "%{http_code}" "<url>"
 *
 * Played inside the WebView recorder (WebArRecorder → {type:'sfx'}), where
 * WebAudio mixes them straight into the recorded clip's audio track.
 */
export type KidSoundCategory = 'transform' | 'animal' | 'cartoon'

export interface KidSound {
  id: string
  nameAr: string
  emoji: string
  category: KidSoundCategory
  url: string
  /** Approximate seconds — cosmetic only (UI hints). */
  duration: number
  volume: number
}

const G = 'https://actions.google.com/sounds/v1'

export const KID_SOUNDS: KidSound[] = [
  // ── كرتونية ────────────────────────────────────────────────────────────────
  { id: 'boing', nameAr: 'بوينج', emoji: '🤪', category: 'cartoon', url: `${G}/cartoon/cartoon_boing.ogg`, duration: 1, volume: 0.9 },
  { id: 'pop', nameAr: 'فرقعة', emoji: '🎈', category: 'cartoon', url: `${G}/cartoon/pop.ogg`, duration: 1, volume: 0.9 },
  { id: 'cowbell', nameAr: 'جرس', emoji: '🔔', category: 'cartoon', url: `${G}/cartoon/cartoon_cowbell.ogg`, duration: 1, volume: 0.85 },
  { id: 'clang', nameAr: 'خبطة مرحة', emoji: '🥁', category: 'cartoon', url: `${G}/cartoon/clang_and_wobble.ogg`, duration: 2, volume: 0.85 },
  { id: 'guitar-boing', nameAr: 'وتر مجنون', emoji: '🎸', category: 'cartoon', url: `${G}/cartoon/concussive_hit_guitar_boing.ogg`, duration: 1, volume: 0.85 },
  { id: 'twang', nameAr: 'طقطقة معدن', emoji: '🪘', category: 'cartoon', url: `${G}/cartoon/metal_twang.ogg`, duration: 1, volume: 0.8 },
  { id: 'thunk', nameAr: 'دق مضحك', emoji: '🔨', category: 'cartoon', url: `${G}/cartoon/cartoon_metal_thunk.ogg`, duration: 1, volume: 0.85 },
  { id: 'plank', nameAr: 'خشب مرح', emoji: '🪵', category: 'cartoon', url: `${G}/cartoon/wood_plank_flicks.ogg`, duration: 1, volume: 0.85 },
  { id: 'whistle-slide', nameAr: 'صفارة زحليقة', emoji: '🛝', category: 'cartoon', url: `${G}/cartoon/slide_whistle.ogg`, duration: 1, volume: 0.9 },

  // ── حيوانات ────────────────────────────────────────────────────────────────
  { id: 'dog', nameAr: 'نباح كلب', emoji: '🐶', category: 'animal', url: `${G}/animals/dog_barking.ogg`, duration: 2, volume: 0.9 },
  { id: 'cat', nameAr: 'قطة بتهرهر', emoji: '🐱', category: 'animal', url: `${G}/animals/cat_purr_close.ogg`, duration: 2, volume: 0.9 },
  { id: 'crow', nameAr: 'غراب', emoji: '🐦‍⬛', category: 'animal', url: `${G}/animals/crow_call.ogg`, duration: 2, volume: 0.85 },

  // ── تحويل وفانتازيا ────────────────────────────────────────────────────────
  { id: 'robot-code', nameAr: 'كلام روبوت', emoji: '🤖', category: 'transform', url: `${G}/science_fiction/robot_code.ogg`, duration: 2, volume: 0.85 },
  { id: 'alien-beam', nameAr: 'شعاع فضائي', emoji: '👽', category: 'transform', url: `${G}/science_fiction/alien_beam.ogg`, duration: 2, volume: 0.85 },
  { id: 'siren-whistle', nameAr: 'صفارة ساحرة', emoji: '🌀', category: 'transform', url: `${G}/cartoon/siren_whistle.ogg`, duration: 1, volume: 0.9 },
  { id: 'thunder', nameAr: 'رعد الوحش', emoji: '⚡', category: 'transform', url: `${G}/weather/thunder_crack.ogg`, duration: 2, volume: 0.8 },
  { id: 'crash', nameAr: 'كراش!', emoji: '💥', category: 'transform', url: `${G}/impacts/crash.ogg`, duration: 2, volume: 0.8 },
  { id: 'cheer', nameAr: 'تصفيق الجمهور', emoji: '🎉', category: 'transform', url: `${G}/crowds/battle_crowd_celebrate_stutter.ogg`, duration: 3, volume: 0.85 },
]

export const KID_SOUND_URLS = KID_SOUNDS.map((sound) => sound.url)
