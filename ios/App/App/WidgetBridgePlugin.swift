import Foundation
import Capacitor
import UIKit

// Bridges the web app to the native widget pipeline. The web app already
// has an authenticated API client and knows the signed-in account's
// bearer token and the backend's base URL, but the widget extension and
// AppDelegate's background-push handler run entirely outside the web view
// and need their own copy of that data. See WidgetDataStore, a small
// shared App Group container both sides can read.
//
// A custom, local Capacitor plugin like this one needs no separate npm
// package: Capacitor auto-discovers any class in the app target that
// conforms to CAPBridgedPlugin by its jsName, the same way it discovers an
// installed plugin's native code.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshNow", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerForPush", returnType: CAPPluginReturnPromise),
    ]

    // Called once after login (and again on app launch while already
    // signed in) with the account's token and this build's API base URL,
    // stores both for the widget/AppDelegate to use, then immediately
    // fetches a first snapshot so the widget isn't empty until the next
    // push.
    @objc func configure(_ call: CAPPluginCall) {
        guard let token = call.getString("authToken"), let base = call.getString("apiBaseURL") else {
            call.reject("authToken and apiBaseURL are required")
            return
        }
        WidgetDataStore.setAuth(token: token, apiBaseURL: base)
        WidgetDataStore.refresh { call.resolve() }
    }

    // Called on logout: clears the cached auth and snapshot so the
    // widget doesn't keep showing a signed-out user's old prompts.
    @objc func clearAuth(_ call: CAPPluginCall) {
        WidgetDataStore.clearAuth()
        call.resolve()
    }

    // Called right after a send/receive/complete action in the web app so
    // the widget updates immediately rather than waiting on a push
    // round-trip (which is also not guaranteed to land instantly).
    @objc func refreshNow(_ call: CAPPluginCall) {
        WidgetDataStore.refresh { call.resolve() }
    }

    // Registers for remote notifications so the server can send the
    // silent (content-available) push that refreshes the widget in the
    // background. Deliberately NOT gated on requestAuthorization/
    // alert-sound-badge permission: that permission is for *visible*
    // notifications (banners, sounds, badges), which this feature never
    // shows. A silent push needs only registerForRemoteNotifications(),
    // and Apple delivers it regardless of whether the user has granted
    // or denied visible-notification permission. Gating this behind
    // that permission meant anyone who tapped "Don't Allow" (a common
    // choice for an app with nothing visible to notify about) never got
    // a device token at all, silently breaking the entire feature.
    @objc func registerForPush(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
            call.resolve()
        }
    }
}
