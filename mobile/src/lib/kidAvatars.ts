import type { ImageSourcePropType } from 'react-native'
import type { AudioSource } from 'expo-audio'

export type KidAvatarAccess = 'free' | 'reward' | 'coins'
export type KidAvatarAnimation = 'bounce' | 'pulse' | 'float' | 'wiggle'

export interface KidAvatarDefinition {
  id: string
  nameAr: string
  nameEn: string
  access: KidAvatarAccess
  coinCost: number
  soundKey: string
  image: ImageSourcePropType
  sound: AudioSource
  color: string
  animation: KidAvatarAnimation
}

export const KID_AVATARS: KidAvatarDefinition[] = [
  {
    id: 'boy', nameAr: 'ولد', nameEn: 'Boy', access: 'free', coinCost: 0,
    soundKey: 'boy_chime', image: require('../../assets/avatars/boy.png'),
    sound: require('../../assets/sounds/avatars/boy_chime.wav'), color: '#03BBE5', animation: 'bounce',
  },
  {
    id: 'girl', nameAr: 'بنت', nameEn: 'Girl', access: 'free', coinCost: 0,
    soundKey: 'girl_chime', image: require('../../assets/avatars/girl.png'),
    sound: require('../../assets/sounds/avatars/girl_chime.wav'), color: '#F96286', animation: 'bounce',
  },
  {
    id: 'robot', nameAr: 'روبوت', nameEn: 'Robot', access: 'free', coinCost: 0,
    soundKey: 'robot_bleep', image: require('../../assets/avatars/robot.png'),
    sound: require('../../assets/sounds/avatars/robot_bleep.wav'), color: '#64748B', animation: 'pulse',
  },
  {
    id: 'cartoon-boy', nameAr: 'ولد كرتوني', nameEn: 'Cartoon boy', access: 'coins', coinCost: 40,
    soundKey: 'cartoon_boing', image: require('../../assets/avatars/cartoon-boy.png'),
    sound: require('../../assets/sounds/avatars/cartoon_boing.wav'), color: '#FB7185', animation: 'wiggle',
  },
  {
    id: 'cartoon-girl', nameAr: 'بنت كرتونية', nameEn: 'Cartoon girl', access: 'coins', coinCost: 40,
    soundKey: 'cartoon_giggle', image: require('../../assets/avatars/cartoon-girl.png'),
    sound: require('../../assets/sounds/avatars/cartoon_giggle.wav'), color: '#EC4899', animation: 'wiggle',
  },
  {
    id: 'lion', nameAr: 'أسد', nameEn: 'Lion', access: 'coins', coinCost: 50,
    soundKey: 'lion_roar', image: require('../../assets/avatars/lion.png'),
    sound: require('../../assets/sounds/avatars/lion_roar.wav'), color: '#F59E0B', animation: 'pulse',
  },
  {
    id: 'superhero', nameAr: 'سوبر هيرو', nameEn: 'Superhero', access: 'coins', coinCost: 100,
    soundKey: 'hero_whoosh', image: require('../../assets/avatars/superhero.png'),
    sound: require('../../assets/sounds/avatars/hero_whoosh.wav'), color: '#2563EB', animation: 'float',
  },
  {
    id: 'princess', nameAr: 'أميرة', nameEn: 'Princess', access: 'coins', coinCost: 80,
    soundKey: 'princess_magic', image: require('../../assets/avatars/princess.png'),
    sound: require('../../assets/sounds/avatars/princess_magic.wav'), color: '#EC4899', animation: 'float',
  },
  {
    id: 'astronaut', nameAr: 'رائد فضاء', nameEn: 'Astronaut', access: 'coins', coinCost: 50,
    soundKey: 'space_signal', image: require('../../assets/avatars/astronaut.png'),
    sound: require('../../assets/sounds/avatars/space_signal.wav'), color: '#0EA5E9', animation: 'float',
  },
  {
    id: 'king', nameAr: 'ملك', nameEn: 'King', access: 'coins', coinCost: 80,
    soundKey: 'king_fanfare', image: require('../../assets/avatars/king.png'),
    sound: require('../../assets/sounds/avatars/king_fanfare.wav'), color: '#EAB308', animation: 'bounce',
  },
  {
    id: 'elephant', nameAr: 'فيل', nameEn: 'Elephant', access: 'coins', coinCost: 50,
    soundKey: 'elephant_trumpet', image: require('../../assets/avatars/elephant.png'),
    sound: require('../../assets/sounds/avatars/elephant_trumpet.wav'), color: '#60A5FA', animation: 'wiggle',
  },
  {
    id: 'dinosaur', nameAr: 'ديناصور', nameEn: 'Dinosaur', access: 'coins', coinCost: 80,
    soundKey: 'dinosaur_roar', image: require('../../assets/avatars/dinosaur.png'),
    sound: require('../../assets/sounds/avatars/dinosaur_roar.wav'), color: '#8B5CF6', animation: 'wiggle',
  },
  {
    // A simple premium accessory rather than a full-face character. It keeps
    // the child's eyes visible while the live tracker locks the frame to the
    // real eye line.
    id: 'black_sunglasses', nameAr: 'نظارة شمس سودا', nameEn: 'Black shades', access: 'coins', coinCost: 60,
    // KidAvatarArt renders the vector filter; this legacy image/sound pair is
    // retained only for the shared catalog type and is never shown as a PNG.
    soundKey: 'sunglasses_cool', image: require('../../assets/avatars/cartoon-boy.png'),
    sound: require('../../assets/sounds/avatars/cartoon_boing.wav'), color: '#111827', animation: 'float',
  },
  {
    // Classic Messenger-style disguise: white hair, black glasses, black
    // moustache. Reuses existing placeholder assets (PNG is unused in the UI
    // and the picker chime is shared) so no new binaries are needed.
    id: 'grandpa', nameAr: 'جدو', nameEn: 'Grandpa', access: 'free', coinCost: 0,
    soundKey: 'grandpa_laugh', image: require('../../assets/avatars/king.png'),
    sound: require('../../assets/sounds/avatars/king_fanfare.wav'), color: '#64748B', animation: 'bounce',
  },
]

export const KID_AVATAR_BY_ID = Object.fromEntries(
  KID_AVATARS.map((avatar) => [avatar.id, avatar])
) as Record<string, KidAvatarDefinition>

export function getKidAvatar(id?: string | null): KidAvatarDefinition | null {
  if (!id) return null
  return KID_AVATAR_BY_ID[id] || null
}
