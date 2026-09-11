export type Category = 'snap' | 'sound' | 'show' | 'share' | 'unplug'

export const CATEGORY_META: Record<Category, { label: string; emoji: string }> = {
  snap: { label: 'Snap it', emoji: '📸' },
  sound: { label: 'Sound it', emoji: '🎤' },
  show: { label: 'Show it', emoji: '🎥' },
  share: { label: 'Share it', emoji: '🙏' },
  unplug: { label: 'Unplug it', emoji: '🌿' },
}

export type PromptPermission = 'everyone' | 'followers' | 'mutuals'

export type CalendarVisibility = 'public' | 'private'

export type BoardCategory = 'brand' | 'nonprofit' | 'creator' | 'local' | 'interest'
