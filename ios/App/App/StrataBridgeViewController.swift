import Capacitor
import UIKit
import UserNotifications

class StrataBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(NativeFeedbackPlugin())
        bridge?.registerPluginInstance(NativeMediaPlugin())
        bridge?.registerPluginInstance(NativeNotificationsPlugin())
    }
}

@objc(NativeFeedbackPlugin)
class NativeFeedbackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeFeedbackPlugin"
    public let jsName = "NativeFeedback"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "impact", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notify", returnType: CAPPluginReturnPromise),
    ]
    @objc func impact(_ call: CAPPluginCall) {
        let styleName = (call.getString("style") ?? "medium").lowercased()
        let style: UIImpactFeedbackGenerator.FeedbackStyle

        switch styleName {
        case "light":
            style = .light
        case "heavy":
            style = .heavy
        case "soft":
            style = .soft
        case "rigid":
            style = .rigid
        default:
            style = .medium
        }

        DispatchQueue.main.async {
            let generator = UIImpactFeedbackGenerator(style: style)
            generator.prepare()
            generator.impactOccurred()
            call.resolve()
        }
    }

    @objc func selection(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let generator = UISelectionFeedbackGenerator()
            generator.prepare()
            generator.selectionChanged()
            call.resolve()
        }
    }

    @objc func notify(_ call: CAPPluginCall) {
        let typeName = (call.getString("type") ?? "success").lowercased()
        let feedbackType: UINotificationFeedbackGenerator.FeedbackType

        switch typeName {
        case "warning":
            feedbackType = .warning
        case "error":
            feedbackType = .error
        default:
            feedbackType = .success
        }

        DispatchQueue.main.async {
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(feedbackType)
            call.resolve()
        }
    }
}

@objc(NativeMediaPlugin)
class NativeMediaPlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public let identifier = "NativeMediaPlugin"
    public let jsName = "NativeMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capturePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickPhoto", returnType: CAPPluginReturnPromise),
    ]
    private var pendingCall: CAPPluginCall?
    private var activePicker: UIImagePickerController?
    private let maxPhotoDimension: CGFloat = 1600
    private let targetUploadBytes = 560 * 1024

    @objc func capturePhoto(_ call: CAPPluginCall) {
        presentPicker(sourceType: .camera, call: call)
    }

    @objc func pickPhoto(_ call: CAPPluginCall) {
        presentPicker(sourceType: .photoLibrary, call: call)
    }

    private func presentPicker(sourceType: UIImagePickerController.SourceType, call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("Another photo action is already in progress.", "NATIVE_MEDIA_IN_PROGRESS")
                return
            }

            guard UIImagePickerController.isSourceTypeAvailable(sourceType) else {
                let code = sourceType == .camera ? "NATIVE_MEDIA_CAMERA_UNAVAILABLE" : "NATIVE_MEDIA_LIBRARY_UNAVAILABLE"
                let message = sourceType == .camera
                    ? "Camera is unavailable on this device."
                    : "Photo library is unavailable right now."
                call.reject(message, code)
                return
            }

            let picker = UIImagePickerController()
            picker.sourceType = sourceType
            picker.mediaTypes = ["public.image"]
            picker.allowsEditing = false
            picker.delegate = self
            picker.modalPresentationStyle = .fullScreen

            self.pendingCall = call
            self.activePicker = picker
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        dismissPicker(picker) {
            guard let call = self.pendingCall else { return }
            self.pendingCall = nil
            self.activePicker = nil
            call.resolve(["cancelled": true])
        }
    }

    func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        dismissPicker(picker) {
            guard let call = self.pendingCall else { return }
            self.pendingCall = nil
            self.activePicker = nil

            guard let originalImage = (info[.editedImage] ?? info[.originalImage]) as? UIImage else {
                call.reject("The selected image could not be loaded.", "NATIVE_MEDIA_INVALID_IMAGE")
                return
            }

            let resizedImage = self.resizeImageIfNeeded(originalImage)
            guard let jpegData = self.compressImage(resizedImage) else {
                call.reject("The selected image could not be prepared.", "NATIVE_MEDIA_ENCODING_FAILED")
                return
            }

            let dataUrl = "data:image/jpeg;base64,\(jpegData.base64EncodedString())"
            let timestamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")

            call.resolve([
                "dataUrl": dataUrl,
                "fileName": "strata-photo-\(timestamp).jpg",
                "cancelled": false,
            ])
        }
    }

    private func dismissPicker(_ picker: UIImagePickerController, completion: @escaping () -> Void) {
        DispatchQueue.main.async {
            picker.dismiss(animated: true, completion: completion)
        }
    }

    private func resizeImageIfNeeded(_ image: UIImage) -> UIImage {
        let size = image.size
        let longestSide = max(size.width, size.height)
        guard longestSide > maxPhotoDimension, longestSide > 0 else {
            return image
        }

        let scale = maxPhotoDimension / longestSide
        let targetSize = CGSize(width: floor(size.width * scale), height: floor(size.height * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }

    private func compressImage(_ image: UIImage) -> Data? {
        var quality: CGFloat = 0.84
        var imageData = image.jpegData(compressionQuality: quality)

        while let currentData = imageData, currentData.count > targetUploadBytes, quality > 0.42 {
            quality -= 0.08
            imageData = image.jpegData(compressionQuality: quality)
        }

        return imageData
    }
}


@objc(NativeNotificationsPlugin)
class NativeNotificationsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeNotificationsPlugin"
    public let jsName = "NativeNotifications"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerForRemoteNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBadgeCount", returnType: CAPPluginReturnPromise),
    ]

    private static var deviceToken: String?
    private static var pendingRegistrationCalls: [CAPPluginCall] = []
    private static var registrationInFlight = false

    override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRemoteNotificationRegistered(_:)),
            name: .strataRemoteNotificationsRegistered,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRemoteNotificationRegistrationFailed(_:)),
            name: .strataRemoteNotificationsRegistrationFailed,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve([
                "status": self.authorizationStatusString(settings.authorizationStatus),
                "deviceToken": Self.deviceToken as Any,
            ])
        }
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, error in
            if let error {
                call.reject("iPhone notifications could not be enabled.", "NATIVE_NOTIFICATIONS_PERMISSION_FAILED", error)
                return
            }

            UNUserNotificationCenter.current().getNotificationSettings { settings in
                call.resolve([
                    "status": self.authorizationStatusString(settings.authorizationStatus),
                    "deviceToken": Self.deviceToken as Any,
                ])
            }
        }
    }

    @objc func registerForRemoteNotifications(_ call: CAPPluginCall) {
        if let token = Self.deviceToken {
            resolveRegistration(call, token: token)
            return
        }

        Self.pendingRegistrationCalls.append(call)
        guard !Self.registrationInFlight else {
            return
        }
        Self.registrationInFlight = true

        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 12) {
            guard let index = Self.pendingRegistrationCalls.firstIndex(where: { $0 === call }) else { return }
            Self.pendingRegistrationCalls.remove(at: index)
            if Self.pendingRegistrationCalls.isEmpty {
                Self.registrationInFlight = false
            }
            call.reject("Apple did not return a device token yet.", "NATIVE_NOTIFICATIONS_TOKEN_TIMEOUT")
        }
    }

    @objc func setBadgeCount(_ call: CAPPluginCall) {
        let count = max(0, call.getInt("count") ?? 0)
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = count
            call.resolve()
        }
    }

    static func updateDeviceToken(_ tokenData: Data) {
        deviceToken = tokenData.map { String(format: "%02.2hhx", $0) }.joined()
        registrationInFlight = false
        NotificationCenter.default.post(name: .strataRemoteNotificationsRegistered, object: deviceToken)
    }

    static func failDeviceTokenRegistration(_ error: Error) {
        registrationInFlight = false
        NotificationCenter.default.post(name: .strataRemoteNotificationsRegistrationFailed, object: error)
    }

    @objc private func handleRemoteNotificationRegistered(_ notification: Notification) {
        guard let token = notification.object as? String else { return }
        let calls = Self.pendingRegistrationCalls
        Self.pendingRegistrationCalls.removeAll()
        calls.forEach { resolveRegistration($0, token: token) }
    }

    @objc private func handleRemoteNotificationRegistrationFailed(_ notification: Notification) {
        let error = notification.object as? Error
        let calls = Self.pendingRegistrationCalls
        Self.pendingRegistrationCalls.removeAll()
        calls.forEach { call in
            call.reject(
                error?.localizedDescription ?? "Remote notification registration failed.",
                "NATIVE_NOTIFICATIONS_REGISTRATION_FAILED",
                error
            )
        }
    }

    private func resolveRegistration(_ call: CAPPluginCall, token: String) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve([
                "status": self.authorizationStatusString(settings.authorizationStatus),
                "deviceToken": token,
            ])
        }
    }

    private func authorizationStatusString(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .notDetermined:
            return "notDetermined"
        case .denied:
            return "denied"
        case .authorized:
            return "authorized"
        case .provisional:
            return "provisional"
        case .ephemeral:
            return "ephemeral"
        @unknown default:
            return "unknown"
        }
    }
}

private extension Notification.Name {
    static let strataRemoteNotificationsRegistered = Notification.Name("strataRemoteNotificationsRegistered")
    static let strataRemoteNotificationsRegistrationFailed = Notification.Name("strataRemoteNotificationsRegistrationFailed")
}
