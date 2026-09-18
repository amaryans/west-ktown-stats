import type { ReactNode } from 'react'

export default function PageHeader({
  title,
  lede,
  children,
}: {
  title: string
  lede?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  )
}
