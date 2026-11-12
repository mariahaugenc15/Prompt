import { Share } from '@capacitor/share'
import { isNativeIOS } from './widgetBridge'
import { canvasToBlob } from './recapImage'

// Three tiers, same native-first-then-web-then-download pattern the app
// already uses for haptics/widget: native iOS gets the real system share
// sheet via Capacitor; a browser or installed PWA that supports the Web
// Share API with files gets the same sheet; anything else just downloads
// the PNG, which is still a real file the person can share by hand.
export async function shareRecapCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await canvasToBlob(canvas)

  if (isNativeIOS()) {
    const dataUrl = await blobToDataUrl(blob)
    await Share.share({ title: 'My Prompt recap', url: dataUrl })
    return
  }

  const file = new File([blob], filename, { type: 'image/png' })
  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'My Prompt recap' })
      return
    } catch {
      // User cancelled the share sheet, or the browser rejected it after
      // claiming support — fall through to a plain download either way.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
