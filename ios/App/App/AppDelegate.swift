import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Without this, iOS suppresses a push's banner/sound entirely
        // while the app is in the foreground — willPresent below is what
        // makes a visible alert push actually show up as a banner even
        // when the user already has the app open.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // MARK: - Push notifications
    //
    // Two kinds share the same device token: a silent background push
    // that always fires (server/apnsRepo.ts's sendWidgetRefreshPush, used
    // to keep the home-screen widget current), and a real user-visible
    // alert push (sendAlertPush) for new follower / new prompt / prompt
    // completed, sent only to devices whose user has actually granted
    // notification permission. The server decides which devices qualify
    // from the visiblePushEnabled flag registered below, read fresh from
    // UNUserNotificationCenter every time (rather than cached locally) so
    // a permission the user later revokes in Settings is picked up the
    // next time this fires, without this app needing to detect that itself.

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenHex = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let visiblePushEnabled = settings.authorizationStatus == .authorized
            self.registerDeviceTokenWithServer(tokenHex, visiblePushEnabled: visiblePushEnabled)
        }
    }

    // Lets a visible alert push actually show its banner/sound while the
    // app is open, which iOS otherwise suppresses by default.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Push just won't reach this device (simulator, permission denied,
        // no provisioning profile with the capability yet), and the widget
        // still works, it just won't refresh until the app is opened or
        // WidgetBridge.refreshNow() is called from the web view.
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        WidgetDataStore.refresh {
            completionHandler(.newData)
        }
    }

    private func registerDeviceTokenWithServer(_ tokenHex: String, visiblePushEnabled: Bool) {
        guard let authToken = WidgetDataStore.authToken,
              let base = WidgetDataStore.apiBaseURL,
              let url = URL(string: "\(base)/api/widget/apns-register")
        else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "deviceToken": tokenHex,
            "visiblePushEnabled": visiblePushEnabled,
        ])
        URLSession.shared.dataTask(with: request).resume()
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
