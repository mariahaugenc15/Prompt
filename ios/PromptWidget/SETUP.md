# Home-screen widget: setup

Every line of code for this feature is written and committed: the server side (`server/apnsRepo.ts`, `server/widgetRoutes.ts`, the `apns_device_tokens` table), the native bridge (`ios/App/App/WidgetDataStore.swift`, `ios/App/App/WidgetBridgePlugin.swift`, the AppDelegate additions), the web side (`src/lib/widgetBridge.ts`, wired into login/logout/send/complete/decline), and the widget itself (this folder's `PromptWidget.swift` and `PromptWidgetBundle.swift`).

What's left is wiring it into Xcode and generating one Apple Developer credential, neither of which can be done from this Linux container (no Xcode here) or on your behalf (the credential is tied to your own Apple Developer account). Altogether this is about 15 minutes of clicking, not writing code.

## 1. Create the widget extension target

1. Open `ios/App/App.xcodeproj` in Xcode.
2. File → New → Target… → **Widget Extension**.
3. Product Name: `PromptWidget`. Uncheck "Include Configuration Intent" (this widget has nothing for the user to configure). Uncheck "Include Live Activity" too.
4. When Xcode asks to "Activate" the new scheme, choose Activate.
5. Xcode generates its own starter Swift files inside a new `PromptWidget/` group. **Delete those** (the ones Xcode generated, not this folder) and instead drag the three files already written for you into that group, checking "PromptWidget" as their target membership:
   - `ios/PromptWidget/PromptWidget.swift`
   - `ios/PromptWidget/PromptWidgetBundle.swift`
   - `ios/PromptWidget/Info.plist` (replace the one Xcode generated, or just confirm the contents match: same NSExtension dict either way)
6. In the PromptWidget target's Signing & Capabilities tab, set its entitlements file to `ios/PromptWidget/PromptWidget.entitlements` (already written) if Xcode didn't pick it up automatically from step 3.

## 2. App Groups (lets the app and the widget share data)

The widget reads its data from a small shared container the main app writes to, since they're separate processes and can't talk to each other any other way.

1. In the Apple Developer portal (developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → App Groups), register a new group: `group.com.promptsocial.app`. If you changed the bundle id in `capacitor.config.ts` away from `com.promptsocial.app`, use the matching name instead everywhere below.
2. Back in Xcode, select the **App** target → Signing & Capabilities → + Capability → **App Groups**. Check (or add) `group.com.promptsocial.app`.
3. Do the same for the **PromptWidget** target.
4. Confirm the id matches exactly in three places: `WidgetDataStore.appGroupID` (`ios/App/App/WidgetDataStore.swift`), the private `appGroupID` constant at the top of `ios/PromptWidget/PromptWidget.swift`, and both entitlements files. All four should already say `group.com.promptsocial.app`; only change them if you used a different name in step 1.

## 3. Push notifications + background refresh (lets the widget update itself)

1. Select the **App** target → Signing & Capabilities → + Capability → **Push Notifications**.
2. Still on the App target: + Capability → **Background Modes** → check **Remote notifications** (this was also added directly to `Info.plist`, so it may already show as checked).
3. Generate an APNs Auth Key: Apple Developer portal → Certificates, Identifiers & Profiles → Keys → **+** → check "Apple Push Notifications service (APNs)" → Continue → Register. Download the resulting `.p8` file **immediately**, since Apple only lets you download it once. Note the **Key ID** shown on that page, and your account's **Team ID** (top-right of the developer portal, or Membership page).
4. Set these on the backend (same place you already set `SMTP_*`/`VAPID_*`: Render's environment tab, or your `.env` for local testing):
   - `APNS_TEAM_ID`: the Team ID from step 3.
   - `APNS_KEY_ID`: the Key ID from step 3.
   - `APNS_PRIVATE_KEY`: the full contents of the downloaded `.p8` file, including the `-----BEGIN PRIVATE KEY-----`/`-----END PRIVATE KEY-----` lines.
   - `APNS_BUNDLE_ID`: only needed if you changed the bundle id away from `com.promptsocial.app`.
   - `APNS_HOST`: only needed to point at `api.sandbox.push.apple.com` instead of production (e.g. while testing a Debug build that isn't using a production push entitlement).

Without these four set, the server-side push send (`server/apnsRepo.ts`) is a silent no-op: the widget still works, it just won't refresh until the app itself is opened (the web app calls `WidgetBridge.refreshNow()` after every send/complete/decline, and `configure()` on every launch while signed in) rather than near-instantly in the background.

## 4. Build and test

1. Build and run the **App** scheme on a real device (push notifications don't deliver to the Simulator at all; widget timelines work in the Simulator but won't refresh from a push there).
2. Log in. Long-press the home screen → **+** → find "Prompt" → add the widget (small or medium size both work).
3. Send yourself a prompt from a second test account, or complete one. The widget should refresh within a few seconds (if push is fully configured) or the next time you open the app (always, as a fallback).
4. Tapping the widget opens the app via the `promptapp://open` URL scheme (already registered in `Info.plist`). It opens the app, but doesn't yet deep-link to the specific tapped prompt, which would need the `@capacitor/app` plugin and a router listener on the web side to parse a destination out of the URL: a clean, separate follow-up rather than something this change needed to include.

## What each file does, if you're verifying before building

| File | Role |
|---|---|
| `server/apnsRepo.ts` | Signs its own APNs auth JWT (ES256, token-based, no third-party package) and sends a silent push to every registered device for an account. |
| `server/widgetRoutes.ts` | `GET /api/widget/snapshot` (waiting prompts + recent completions), `POST /api/widget/apns-register`/`apns-unregister`. |
| `ios/App/App/WidgetDataStore.swift` | The shared App Group read/write helper: auth token, API base URL, cached snapshot JSON. |
| `ios/App/App/WidgetBridgePlugin.swift` | The custom Capacitor plugin (`WidgetBridge` in JS) the web app calls. |
| `ios/App/App/AppDelegate.swift` | Registers the device token with the server; handles the silent push to refresh in the background. |
| `src/lib/widgetBridge.ts` | The web-side wrapper, a no-op outside a native iOS build. |
| `ios/PromptWidget/PromptWidget.swift` | The widget's `TimelineProvider` and SwiftUI view (the post-it notes). |
