/** Round avatar with an initial fallback (no broken-image icons). */
export default function Avatar({
  src,
  name,
  size = 'md',
}: {
  src: string | null | undefined
  name: string
  size?: 'md' | 'lg'
}) {
  const cls = size === 'lg' ? 'avatar lg' : 'avatar'
  if (src)
    return <img className={cls} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
  return (
    <span className={`${cls} avatar--blank`} aria-hidden="true">
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
