import { useState } from 'react'

const FALLBACK_SRC = `${import.meta.env.BASE_URL}fallback-avatar.svg`

interface TeamAvatarProps {
  src: string | null
  alt: string
  className?: string
}

export default function TeamAvatar({ src, alt, className = 'size-10' }: TeamAvatarProps) {
  const [hasFailed, setHasFailed] = useState(false)
  const resolvedSrc = src !== null && !hasFailed ? src : FALLBACK_SRC
  return (
    <img
      src={resolvedSrc}
      alt={alt}
      onError={() => setHasFailed(true)}
      className={`rounded-full object-cover ${className}`}
    />
  )
}
