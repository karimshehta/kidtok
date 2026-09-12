import Svg, { Circle, Path } from 'react-native-svg'

export default function KidCoinIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx="16" cy="16" r="14" fill="#F59E0B" />
      <Circle cx="16" cy="16" r="11.5" fill="#FDE68A" stroke="#FBBF24" strokeWidth="1.5" />
      <Circle cx="16" cy="16" r="8.5" fill="none" stroke="#F59E0B" strokeWidth="1.25" opacity="0.7" />
      <Path d="M13 9.5 V22.5 M18.5 10.8 C17.5 9.8 15.9 9.4 14.5 10.1 C12.2 11.2 12.8 13.6 15.6 14.3 C19.5 15.2 19.6 18.8 17.2 20.4 C15.8 21.3 13.7 21 12.5 20" fill="none" stroke="#92400E" strokeWidth="2.25" strokeLinecap="round" />
    </Svg>
  )
}
