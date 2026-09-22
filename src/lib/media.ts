export function fileToCompressedDataUrl(file: File, maxDim = 480, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no canvas context'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

// A video can't be run through the canvas downscale path above — an <img>
// element can never decode a video container, so that would always reject.
// There's no in-browser way to transcode/shrink video without a heavy
// library, so video proof rides along at its original size instead, capped
// so it stays well under the server's JSON body limit (see server/index.ts)
// and doesn't blow up localStorage's ~5-10MB per-origin quota by itself.
const MAX_VIDEO_BYTES = 8 * 1024 * 1024

export async function fileToProofDataUrl(file: File): Promise<{ dataUrl: string; kind: 'photo' | 'video' }> {
  if (file.type.startsWith('image/')) {
    return { dataUrl: await fileToCompressedDataUrl(file), kind: 'photo' }
  }
  if (file.type.startsWith('video/')) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error(`That video is too large (max ${Math.floor(MAX_VIDEO_BYTES / (1024 * 1024))}MB). Try a shorter clip.`)
    }
    return { dataUrl: await readFileAsDataUrl(file), kind: 'video' }
  }
  throw new Error('Unsupported file type. Please choose a photo or video.')
}
