interface Props {
  text?: string
}

export default function Divider({ text = 'أو' }: Props) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-neutral-300" />
      <span className="text-xs text-neutral-700 px-2">{text}</span>
      <div className="flex-1 h-px bg-neutral-300" />
    </div>
  )
}
