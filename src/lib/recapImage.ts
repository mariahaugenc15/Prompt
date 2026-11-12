// Renders a Monthly recap (v2 Phase 11) as a shareable image, canvas-drawn
// (no screenshot library) so the output is crisp at any export size and
// never depends on what's actually on screen. Matches the app's existing
// ink-and-stamp visual language (src/index.css's color tokens) rather than
// inventing a new palette.

import type { RecapData } from './recapApi'

const COLOR_PAPER = '#f7f4ec'
const COLOR_INK = '#211f1c'
const COLOR_INK_SOFT = '#57534a'
const COLOR_INK_FAINT = '#948d80'
const COLOR_ACCENT = '#bd5c3a'
const COLOR_LINE = '#d8d2c2'

const CATEGORY_LABEL: Record<string, string> = {
  snap: 'Snap it',
  sound: 'Sound it',
  show: 'Show it',
  share: 'Share it',
  unplug: 'Unplug it',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(monthKey: string): string {
  const [, month] = monthKey.split('-').map(Number)
  return MONTH_NAMES[month - 1]
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

export type RecapAspect = '9:16' | '1:1'

// The exported image is deliberately self-contained: it never includes
// another user's name or content (the spec's "never include another
// user's content or username in the exported image by default"), so
// recap.topFriend is read by the in-app view but intentionally never
// passed to or drawn by this function.
export function renderRecapCanvas(recap: RecapData, aspect: RecapAspect): HTMLCanvasElement {
  const width = 1080
  const height = aspect === '9:16' ? 1920 : 1080
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = COLOR_PAPER
  ctx.fillRect(0, 0, width, height)

  // A faint dot-grid texture, echoing the app's own paper background.
  ctx.fillStyle = COLOR_LINE
  for (let y = 40; y < height; y += 28) {
    for (let x = 40; x < width; x += 28) {
      ctx.beginPath()
      ctx.arc(x, y, 1.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const marginX = 90
  let y = aspect === '9:16' ? 180 : 110

  ctx.textAlign = 'left'
  ctx.fillStyle = COLOR_INK_FAINT
  ctx.font = '500 28px Georgia, serif'
  ctx.fillText('PROMPT RECAP', marginX, y)

  y += 70
  ctx.fillStyle = COLOR_INK
  ctx.font = '600 76px Georgia, serif'
  ctx.fillText(monthLabel(recap.monthKey), marginX, y)

  // A simple ink-stamp motif: an irregular terra-cotta ring, echoing
  // src/components/Stamp.tsx's circular stamp border without pulling in
  // SVG filters a canvas export can't render anyway.
  ctx.save()
  ctx.strokeStyle = COLOR_ACCENT
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.ellipse(width - marginX - 70, y - 100, 90, 84, -0.08, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  y += 90

  if (recap.thin) {
    ctx.fillStyle = COLOR_INK_SOFT
    ctx.font = '400 42px Georgia, serif'
    const lines = wrapText(
      ctx,
      recap.totalCompletions === 0
        ? 'A quiet month. Every month counts, even the slow ones. See you next month.'
        : `A quieter month, ${recap.totalCompletions} completion${recap.totalCompletions === 1 ? '' : 's'} and counting. See you next month.`,
      width - marginX * 2,
    )
    for (const line of lines) {
      y += 56
      ctx.fillText(line, marginX, y)
    }
    drawFooter(ctx, width, height)
    return canvas
  }

  const stats: { label: string; value: string }[] = [
    { label: 'Completions', value: String(recap.totalCompletions) },
    { label: 'Completion score', value: recap.completionScore === null ? 'N/A' : `${recap.completionScore}%` },
    { label: 'Favorite category', value: recap.favoriteCategory ? (CATEGORY_LABEL[recap.favoriteCategory] ?? recap.favoriteCategory) : 'N/A' },
    { label: 'Longest streak', value: `${recap.longestStreakDays} day${recap.longestStreakDays === 1 ? '' : 's'}` },
  ]

  for (const stat of stats) {
    y += 100
    ctx.fillStyle = COLOR_INK_FAINT
    ctx.font = '500 26px Georgia, serif'
    ctx.fillText(stat.label.toUpperCase(), marginX, y)
    y += 58
    ctx.fillStyle = COLOR_ACCENT
    ctx.font = '600 58px Georgia, serif'
    ctx.fillText(stat.value, marginX, y)
  }

  if (recap.mostLaughedAt) {
    y += 100
    ctx.fillStyle = COLOR_INK_FAINT
    ctx.font = '500 26px Georgia, serif'
    ctx.fillText('MOST LAUGHED AT', marginX, y)
    y += 50
    ctx.fillStyle = COLOR_INK
    ctx.font = 'italic 400 36px Georgia, serif'
    const lines = wrapText(ctx, `"${recap.mostLaughedAt.text}"`, width - marginX * 2)
    for (const line of lines.slice(0, 3)) {
      y += 46
      ctx.fillText(line, marginX, y)
    }
  }

  drawFooter(ctx, width, height)
  return canvas
}

function drawFooter(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = COLOR_INK_FAINT
  ctx.font = '500 26px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillText('Prompt', width / 2, height - 70)
  ctx.textAlign = 'left'
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export image'))), 'image/png')
  })
}
