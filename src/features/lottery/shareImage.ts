import { toBlob, toPng } from 'html-to-image'

const EXPORT_PIXEL_RATIO = 2

/** Render a DOM node to a 2x PNG and trigger a download. */
export async function downloadPoster(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, { pixelRatio: EXPORT_PIXEL_RATIO, cacheBust: true })
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

/** Copy the rendered PNG to the clipboard. Returns false where unsupported. */
export async function copyPoster(node: HTMLElement): Promise<boolean> {
  try {
    const blob = await toBlob(node, { pixelRatio: EXPORT_PIXEL_RATIO, cacheBust: true })
    if (!blob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      return false
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

/** Turn a league name into a safe download filename. */
export function posterFilename(leagueName: string): string {
  const slug = leagueName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'draft-order'}-draft-order.png`
}
