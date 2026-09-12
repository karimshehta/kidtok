import KidAvatarFaceMask from '@/components/KidAvatarFaceMask'

interface Props {
  avatarId?: string | null
  voiceKey?: string | null
  isActive: boolean
}

export default function KidAvatarVideoOverlay({ avatarId, voiceKey, isActive }: Props) {
  return <KidAvatarFaceMask avatarId={avatarId} voiceKey={voiceKey} isActive={isActive} mode="playback" showVoiceBadge />
}
