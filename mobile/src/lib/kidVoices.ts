import type { AudioSource } from 'expo-audio'

export type KidVoiceId = string
export type KidVoiceEffectId = 'natural' | 'bright' | 'story' | 'robot' | 'cartoon' | 'giant' | 'space' | 'magic'

export interface KidVoiceDefinition {
  id: KidVoiceId
  effectId: KidVoiceEffectId
  labelAr: string
  labelEn: string
  descriptionAr: string
  descriptionEn: string
  emoji: string
  color: string
  /** A real spoken sample. It is processed with the same profile as video audio. */
  preview: AudioSource
  /** A deliberately modest pitch adjustment; character comes mainly from texture/EQ. */
  pitchFactor: number
}

/**
 * Voices are independent from masks: a child can combine any face filter with
 * any of these curated audio profiles. The preview files are real English
 * speech generated locally from several distinct open Piper speakers, then
 * lightly styled to match the video effect profile. They replace the old
 * phone TTS preview and its extreme pitch-only sound.
 */
export const KID_VOICES: KidVoiceDefinition[] = [
  {
    id: 'natural_voice', effectId: 'natural',
    labelAr: 'بطل صغير', labelEn: 'Young hero',
    descriptionAr: 'صوت إنجليزي صغير ومليان طاقة', descriptionEn: 'A young, energetic English voice',
    emoji: '🎙️', color: '#0EA5E9', pitchFactor: 1.09,
    preview: require('../../assets/sounds/voices/natural_voice.wav'),
  },
  {
    id: 'bright_voice', effectId: 'bright',
    labelAr: 'بنت مرحة', labelEn: 'Cheerful girl',
    descriptionAr: 'صوت إنجليزي مرح وواضح', descriptionEn: 'A bright, cheerful English voice',
    emoji: '✨', color: '#F59E0B', pitchFactor: 1.16,
    preview: require('../../assets/sounds/voices/bright_voice.wav'),
  },
  {
    id: 'story_voice', effectId: 'story',
    labelAr: 'راوية الحكايات', labelEn: 'Story woman',
    descriptionAr: 'صوت إنجليزي دافئ للحكايات', descriptionEn: 'A warm English storytelling voice',
    emoji: '📖', color: '#7C3AED', pitchFactor: 0.91,
    preview: require('../../assets/sounds/voices/story_voice.wav'),
  },
  {
    id: 'robot_voice', effectId: 'robot',
    labelAr: 'روبوت ذكي', labelEn: 'Smart robot',
    descriptionAr: 'روبوت إنجليزي واضح وممتع', descriptionEn: 'A clear playful English robot',
    emoji: '🤖', color: '#64748B', pitchFactor: 1.03,
    preview: require('../../assets/sounds/voices/robot_voice.wav'),
  },
  {
    id: 'cartoon_voice', effectId: 'cartoon',
    labelAr: 'كرتوني مرح', labelEn: 'Cartoon kid',
    descriptionAr: 'صوت إنجليزي كرتوني خفيف', descriptionEn: 'A playful English cartoon voice',
    emoji: '🎈', color: '#F43F5E', pitchFactor: 1.24,
    preview: require('../../assets/sounds/voices/cartoon_voice.wav'),
  },
  {
    id: 'giant_voice', effectId: 'giant',
    labelAr: 'الجد المرح', labelEn: 'Friendly grandpa',
    descriptionAr: 'صوت رجل كبير دافئ وواضح', descriptionEn: 'A warm, older English narrator',
    emoji: '🦁', color: '#D97706', pitchFactor: 0.79,
    preview: require('../../assets/sounds/voices/giant_voice.wav'),
  },
  {
    id: 'space_voice', effectId: 'space',
    labelAr: 'قائد الفضاء', labelEn: 'Space captain',
    descriptionAr: 'صوت إنجليزي من مهمة فضائية', descriptionEn: 'An English space-mission voice',
    emoji: '🚀', color: '#0284C7', pitchFactor: 0.88,
    preview: require('../../assets/sounds/voices/space_voice.wav'),
  },
  {
    id: 'magic_voice', effectId: 'magic',
    labelAr: 'صوت أميرة', labelEn: 'Magic princess',
    descriptionAr: 'صوت إنجليزي لطيف بسحر خفيف', descriptionEn: 'A gentle English magical voice',
    emoji: '🪄', color: '#DB2777', pitchFactor: 1.12,
    preview: require('../../assets/sounds/voices/magic_voice.wav'),
  },
]

const KID_VOICE_BY_ID = Object.fromEntries(
  KID_VOICES.map((voice) => [voice.id, voice]),
) as Record<string, KidVoiceDefinition>

// Videos made by development builds before the curated profiles keep working
// and receive an honest matching label in the feed.
const LEGACY_VOICE_ALIASES: Record<string, KidVoiceId> = {
  boy_chime: 'natural_voice',
  girl_chime: 'bright_voice',
  robot_bleep: 'robot_voice',
  cartoon_boing: 'cartoon_voice',
  cartoon_giggle: 'cartoon_voice',
  lion_roar: 'giant_voice',
  hero_whoosh: 'story_voice',
  princess_magic: 'magic_voice',
  space_signal: 'space_voice',
  king_fanfare: 'story_voice',
  elephant_trumpet: 'giant_voice',
  dinosaur_roar: 'giant_voice',
  grandpa_laugh: 'story_voice',
  sunglasses_cool: 'cartoon_voice',
}

export function getKidVoice(id?: string | null): KidVoiceDefinition | null {
  if (!id || id === 'none') return null
  return KID_VOICE_BY_ID[id] || KID_VOICE_BY_ID[LEGACY_VOICE_ALIASES[id]] || null
}

export function getKidVoiceLabel(id: string | null | undefined, ar: boolean) {
  const voice = getKidVoice(id)
  if (voice) return ar ? voice.labelAr : voice.labelEn
  return ar ? 'بدون مؤثر صوتي' : 'Original voice'
}
