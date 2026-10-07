import Foundation
import WidgetKit

// Shared between WidgetBridgePlugin.swift (the Capacitor plugin the web
// app calls) and AppDelegate's silent-push handler: both need to do the
// exact same "fetch the latest widget snapshot from the API, cache it in
// the shared App Group container, then tell WidgetKit to redraw" routine,
// just triggered from different places: a manual refresh request from
// the web view versus a silent push waking the app in the background.
//
// The App Group id below must be registered under Signing & Capabilities
// for BOTH this app target and the PromptWidget extension target (same
// string in both), and under Identifiers → App Groups in the Apple
// Developer portal first. See ios/PromptWidget/SETUP.md for the full
// walkthrough.
enum WidgetDataStore {
    static let appGroupID = "group.com.promptsocial.app"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    static func setAuth(token: String, apiBaseURL: String) {
        defaults?.set(token, forKey: "authToken")
        defaults?.set(apiBaseURL, forKey: "apiBaseURL")
    }

    static func clearAuth() {
        defaults?.removeObject(forKey: "authToken")
        defaults?.removeObject(forKey: "widgetSnapshotJSON")
        WidgetCenter.shared.reloadAllTimelines()
    }

    static var authToken: String? { defaults?.string(forKey: "authToken") }
    static var apiBaseURL: String? { defaults?.string(forKey: "apiBaseURL") }

    // Fetches /api/widget/snapshot, caches the raw JSON for the widget
    // extension's TimelineProvider to read back out, then asks WidgetKit
    // to redraw with it. Safe to call with no stored auth (a no-op, calls
    // completion immediately) and safe to call often. This is the only
    // way the widget's on-screen data ever changes.
    static func refresh(completion: (() -> Void)? = nil) {
        guard let token = authToken, let base = apiBaseURL, let url = URL(string: "\(base)/api/widget/snapshot") else {
            completion?()
            return
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: request) { data, response, _ in
            defer { completion?() }
            guard let data = data,
                  let http = response as? HTTPURLResponse,
                  http.statusCode == 200,
                  let json = String(data: data, encoding: .utf8)
            else { return }
            defaults?.set(json, forKey: "widgetSnapshotJSON")
            defaults?.set(Date().timeIntervalSince1970 * 1000, forKey: "widgetSnapshotFetchedAt")
            WidgetCenter.shared.reloadAllTimelines()
        }.resume()
    }
}
