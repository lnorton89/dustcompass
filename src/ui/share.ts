/**
 * Hand a link to whatever the device can do with it: the native share sheet if
 * there is one, the clipboard otherwise. Returns what actually happened so the
 * caller can say so, rather than claiming "copied" when nothing was.
 */
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable'

export async function shareLink(url: string, title: string): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text: title, url })
      return 'shared'
    } catch (error) {
      // The user dismissing the sheet is not a failure worth reporting.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    // Clipboard access needs a secure context and can be refused outright.
    return 'unavailable'
  }
}
