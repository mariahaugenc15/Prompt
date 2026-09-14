import type { CapacitorConfig } from '@capacitor/cli'

// appId is a reverse-DNS bundle identifier — change it to match your own
// Apple Developer team/account before actually submitting to the App
// Store (it has to be unique and registered there), but it's safe to leave
// as-is just to open and run the project in Xcode locally first.
const config: CapacitorConfig = {
  appId: 'com.promptsocial.app',
  appName: 'Prompt',
  webDir: 'dist',
}

export default config
