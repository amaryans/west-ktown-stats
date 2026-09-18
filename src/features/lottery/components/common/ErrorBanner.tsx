interface ErrorBannerProps {
  message: string | null
}

export default function ErrorBanner({ message }: ErrorBannerProps) {
  if (message === null) {
    return null
  }
  return (
    <div
      role="alert"
      className="rounded-lg border border-accent/60 bg-accent/15 px-4 py-3 text-sm text-red-100"
    >
      {message}
    </div>
  )
}
