import { initials } from '../lib/social'

type Props = {
  name: string | null | undefined
  url: string | null | undefined
  size?: number
  className?: string
}

/** Avatar with an initials fallback, so a missing picture is never a gap. */
export default function Avatar({ name, url, size = 40, className = '' }: Props) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-raised font-semibold text-ink ring-1 ring-hair ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  )
}
