import { Capacitor, registerPlugin } from '@capacitor/core'
import { API_BASE } from './apiBase'

interface WidgetBridgePlugin {
  configure(options: { authToken: string; apiBaseURL: string }): Promise<void>
  clearAuth(): Promise<void>
  refreshNow(): Promise<void>
  registerForPush(): Promise<void>
  requestNotificationPermission(): Promise<{ granted: boolean }>
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge')

// The home-screen widget (iOS only, native app build, see
// ios/PromptWidget) runs entirely outside this web view and needs its own
// copy of the signed-in account's token and this build's API base URL,
// handed over through a small custom native plugin (ios/App/App/
// WidgetBridgePlugin.swift). Every function here is a no-op in the
// browser/PWA build, where there's no native widget to feed. Capacitor
// simply has nothing registered under this plugin name there.
export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

// Called right after login (and once at app launch while already signed
// in) so the widget has a token to fetch with; also asks for push
// permission so the widget can refresh close to immediately instead of
// waiting on iOS's own background-refresh schedule.
export async function configureWidget(authToken: string): Promise<void> {
  if (!isNativeIOS()) return
  try {
    await WidgetBridge.configure({ authToken, apiBaseURL: API_BASE || window.location.origin })
    await WidgetBridge.registerForPush()
  } catch {
    // Best-effort: a widget that can't be fed right now shouldn't block
    // anything else about signing in.
  }
}

// Called on sign-out so the widget doesn't keep showing a signed-out
// device's last-known prompts.
export async function clearWidgetAuth(): Promise<void> {
  if (!isNativeIOS()) return
  try {
    await WidgetBridge.clearAuth()
  } catch {
    // best-effort
  }
}

// Called right after a send/receive/complete action so the widget updates
// immediately rather than waiting on a push round-trip.
export async function refreshWidgetNow(): Promise<void> {
  if (!isNativeIOS()) return
  try {
    await WidgetBridge.refreshNow()
  } catch {
    // best-effort
  }
}

// Asks for the permission that gates a real, visible push notification
// (banner/sound/badge) — distinct from configureWidget's unconditional
// registerForPush, which only needs a device token for the silent
// widget-refresh push and deliberately never prompts. Only ever called
// from a user gesture (the Notifications screen's "Turn on push"
// button), same rule src/lib/push.ts follows for the web/VAPID path:
// iOS shows its permission dialog at most once, so firing it from a
// page-load effect burns that one shot before the user has any context
// for what they're being asked.
export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!isNativeIOS()) return false
  try {
    const { granted } = await WidgetBridge.requestNotificationPermission()
    return granted
  } catch {
    return false
  }
}
