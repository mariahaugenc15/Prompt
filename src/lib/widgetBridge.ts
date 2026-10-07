import { Capacitor, registerPlugin } from '@capacitor/core'
import { API_BASE } from './apiBase'

interface WidgetBridgePlugin {
  configure(options: { authToken: string; apiBaseURL: string }): Promise<void>
  clearAuth(): Promise<void>
  refreshNow(): Promise<void>
  registerForPush(): Promise<{ granted: boolean }>
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge')

// The home-screen widget (iOS only, native app build, see
// ios/PromptWidget) runs entirely outside this web view and needs its own
// copy of the signed-in account's token and this build's API base URL,
// handed over through a small custom native plugin (ios/App/App/
// WidgetBridgePlugin.swift). Every function here is a no-op in the
// browser/PWA build, where there's no native widget to feed. Capacitor
// simply has nothing registered under this plugin name there.
function isNativeIOS(): boolean {
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
