import AuthenticationServices
import Capacitor
import Foundation
import UIKit
import UserNotifications

@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 13.0, *) {
            call.resolve(["value": true])
            return
        }

        call.resolve(["value": false])
    }

    @objc func authorize(_ call: CAPPluginCall) {
        guard #available(iOS 13.0, *) else {
            call.reject("Sign in with Apple requires iOS 13 or later.", "APPLE_SIGN_IN_UNAVAILABLE")
            return
        }

        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("Another Apple sign-in request is already in progress.", "APPLE_SIGN_IN_IN_PROGRESS")
                return
            }

            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.fullName, .email]

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self

            self.pendingCall = call
            controller.performRequests()
        }
    }
}

@available(iOS 13.0, *)
extension AppleSignInPlugin: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        pendingCall = nil

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("Apple sign-in returned an unexpected credential.", "APPLE_SIGN_IN_INVALID_CREDENTIAL")
            return
        }

        guard let identityTokenData = credential.identityToken,
              let identityToken = String(data: identityTokenData, encoding: .utf8),
              !identityToken.isEmpty else {
            call.reject("Apple sign-in did not return an identity token.", "APPLE_SIGN_IN_MISSING_TOKEN")
            return
        }

        let authorizationCode = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        let email = credential.email?.trimmingCharacters(in: .whitespacesAndNewlines)
        let givenName = credential.fullName?.givenName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let familyName = credential.fullName?.familyName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let fullName = formattedFullName(from: credential.fullName)
        let isPrivateEmail = email?.lowercased().hasSuffix("privaterelay.appleid.com") ?? false

        call.resolve([
            "user": credential.user,
            "identityToken": identityToken,
            "authorizationCode": authorizationCode as Any,
            "email": email as Any,
            "givenName": givenName as Any,
            "familyName": familyName as Any,
            "fullName": fullName as Any,
            "isPrivateEmail": isPrivateEmail
        ])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        pendingCall = nil

        let authorizationError = error as? ASAuthorizationError
        switch authorizationError?.code {
        case .canceled:
            call.reject("Apple sign-in was canceled.", "APPLE_SIGN_IN_CANCELED", error)
        case .failed:
            call.reject("Apple sign-in failed. Please try again.", "APPLE_SIGN_IN_FAILED", error)
        case .invalidResponse:
            call.reject("Apple sign-in returned an invalid response.", "APPLE_SIGN_IN_INVALID_RESPONSE", error)
        case .notHandled:
            call.reject("Apple sign-in could not be completed right now.", "APPLE_SIGN_IN_NOT_HANDLED", error)
        default:
            call.reject("Apple sign-in could not be completed.", "APPLE_SIGN_IN_FAILED", error)
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }

        if let foregroundScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
           let window = foregroundScene.windows.first(where: { $0.isKeyWindow }) ?? foregroundScene.windows.first {
            return window
        }

        return ASPresentationAnchor()
    }

    private func formattedFullName(from components: PersonNameComponents?) -> String? {
        guard let components else { return nil }
        let formatter = PersonNameComponentsFormatter()
        let fullName = formatter.string(from: components).trimmingCharacters(in: .whitespacesAndNewlines)
        return fullName.isEmpty ? nil : fullName
    }
}

@objc(FieldOpsPlugin)
public class FieldOpsPlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public let identifier = "FieldOpsPlugin"
    public let jsName = "FieldOps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "haptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getNotificationPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleLocalNotification", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBadgeCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickImage", returnType: CAPPluginReturnPromise)
    ]

    private var pendingImageCall: CAPPluginCall?
    private let isoFormatter = ISO8601DateFormatter()

    @objc func openUrl(_ call: CAPPluginCall) {
        guard let rawUrl = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
              let url = URL(string: rawUrl),
              !rawUrl.isEmpty else {
            call.reject("A valid URL is required.", "FIELD_OPS_INVALID_URL")
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { success in
                call.resolve(["opened": success])
            }
        }
    }

    @objc func share(_ call: CAPPluginCall) {
        let items = call.getArray("items", String.self)?.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } ?? []
        guard !items.isEmpty else {
            call.reject("Share requires at least one item.", "FIELD_OPS_SHARE_EMPTY")
            return
        }

        DispatchQueue.main.async {
            let activityController = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let subject = call.getString("subject"), !subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                activityController.setValue(subject, forKey: "subject")
            }
            if let popover = activityController.popoverPresentationController {
                popover.sourceView = self.bridge?.viewController?.view
                let bounds = self.bridge?.viewController?.view.bounds ?? CGRect(x: 0, y: 0, width: 1, height: 1)
                popover.sourceRect = CGRect(x: bounds.midX, y: bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            activityController.completionWithItemsHandler = { _, completed, _, error in
                if let error {
                    call.reject("Sharing failed.", "FIELD_OPS_SHARE_FAILED", error)
                    return
                }
                call.resolve(["completed": completed])
            }
            self.present(controller: activityController, for: call)
        }
    }

    @objc func haptic(_ call: CAPPluginCall) {
        let style = (call.getString("style") ?? "light").lowercased()
        DispatchQueue.main.async {
            switch style {
            case "medium":
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "heavy":
                UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            case "success":
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "warning":
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case "error":
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            default:
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
            call.resolve()
        }
    }

    @objc func getNotificationPermissions(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let isGranted = self.notificationAuthorizationGranted(settings.authorizationStatus)
            call.resolve([
                "status": self.notificationAuthorizationStatus(settings.authorizationStatus),
                "granted": isGranted
            ])
        }
    }

    @objc func requestNotificationPermissions(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, error in
            if let error {
                call.reject("Notification permission request failed.", "FIELD_OPS_NOTIFICATION_PERMISSION_FAILED", error)
                return
            }
            self.getNotificationPermissions(call)
        }
    }

    @objc func scheduleLocalNotification(_ call: CAPPluginCall) {
        guard let identifier = call.getString("identifier")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !identifier.isEmpty,
              let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !title.isEmpty else {
            call.reject("Notification identifier and title are required.", "FIELD_OPS_NOTIFICATION_INVALID")
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = call.getString("body")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if let badgeCount = call.getInt("badgeCount") {
            content.badge = NSNumber(value: max(0, badgeCount))
        }
        content.sound = .default

        let trigger: UNNotificationTrigger
        if let isoDate = call.getString("isoDate"),
           let targetDate = isoFormatter.date(from: isoDate),
           targetDate.timeIntervalSinceNow > 1 {
            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: targetDate)
            trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        } else {
            trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        }

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.add(request) { error in
            if let error {
                call.reject("Could not schedule the local notification.", "FIELD_OPS_NOTIFICATION_SCHEDULE_FAILED", error)
                return
            }
            call.resolve(["scheduled": true])
        }
    }

    @objc func setBadgeCount(_ call: CAPPluginCall) {
        let count = max(0, call.getInt("count") ?? 0)
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = count
            call.resolve()
        }
    }

    @objc func pickImage(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingImageCall == nil else {
                call.reject("Another image picker is already open.", "FIELD_OPS_PICKER_IN_PROGRESS")
                return
            }

            let source = (call.getString("source") ?? "library").lowercased()
            let picker = UIImagePickerController()
            picker.delegate = self
            picker.allowsEditing = false

            if source == "camera" {
                guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                    call.reject("Camera is not available on this device.", "FIELD_OPS_CAMERA_UNAVAILABLE")
                    return
                }
                picker.sourceType = .camera
                picker.cameraCaptureMode = .photo
                picker.modalPresentationStyle = .fullScreen
            } else {
                guard UIImagePickerController.isSourceTypeAvailable(.photoLibrary) else {
                    call.reject("Photo library is not available on this device.", "FIELD_OPS_LIBRARY_UNAVAILABLE")
                    return
                }
                picker.sourceType = .photoLibrary
            }

            self.pendingImageCall = call
            self.present(controller: picker, for: call)
        }
    }

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        let call = pendingImageCall
        pendingImageCall = nil
        DispatchQueue.main.async {
            picker.dismiss(animated: true) {
                call?.reject("Image selection was canceled.", "FIELD_OPS_PICKER_CANCELED")
            }
        }
    }

    public func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]
    ) {
        let call = pendingImageCall
        pendingImageCall = nil

        guard let call else {
            DispatchQueue.main.async {
                picker.dismiss(animated: true)
            }
            return
        }

        guard let image = info[.originalImage] as? UIImage,
              let payload = serializedImagePayload(from: image, info: info) else {
            DispatchQueue.main.async {
                picker.dismiss(animated: true) {
                    call.reject("Could not process that photo.", "FIELD_OPS_IMAGE_PROCESSING_FAILED")
                }
            }
            return
        }

        DispatchQueue.main.async {
            picker.dismiss(animated: true) {
                call.resolve(payload)
            }
        }
    }

    private func present(controller: UIViewController, for call: CAPPluginCall) {
        guard let presenter = bridge?.viewController else {
            call.reject("The native presentation context is unavailable.", "FIELD_OPS_NO_VIEW_CONTROLLER")
            return
        }
        presenter.present(controller, animated: true)
    }

    private func notificationAuthorizationStatus(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional:
            return "granted"
        case .denied:
            return "denied"
        case .notDetermined:
            return "prompt"
        case .ephemeral:
            return "granted"
        @unknown default:
            return "prompt"
        }
    }

    private func notificationAuthorizationGranted(_ status: UNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized, .provisional:
            return true
        case .ephemeral:
            return true
        default:
            return false
        }
    }

    private func serializedImagePayload(
        from image: UIImage,
        info: [UIImagePickerController.InfoKey : Any]
    ) -> [String: Any]? {
        let prepared = preparedImageData(from: image)
        guard let finalImage = prepared.image,
              let finalData = prepared.data else {
            return nil
        }

        let base64 = finalData.base64EncodedString()
        let filename = (info[.imageURL] as? URL)?.lastPathComponent ?? "intake-\(Int(Date().timeIntervalSince1970)).jpg"

        return [
            "dataUrl": "data:image/jpeg;base64,\(base64)",
            "fileName": filename,
            "mimeType": "image/jpeg",
            "width": Int(finalImage.size.width),
            "height": Int(finalImage.size.height),
            "byteSize": finalData.count
        ]
    }

    private func preparedImageData(from image: UIImage) -> (image: UIImage?, data: Data?) {
        let normalized = normalizedImage(image)
        let maxByteSize = 680_000
        let dimensions: [CGFloat] = [1600, 1400, 1200, 1000]
        let qualities: [CGFloat] = [0.82, 0.72, 0.62, 0.52]

        var fallbackImage: UIImage? = normalized
        var fallbackData: Data? = normalized.jpegData(compressionQuality: qualities.first ?? 0.82)

        for dimension in dimensions {
            let resizedImage = resizedImage(normalized, maxDimension: dimension)
            for quality in qualities {
                guard let jpegData = resizedImage.jpegData(compressionQuality: quality) else { continue }
                fallbackImage = resizedImage
                fallbackData = jpegData
                if jpegData.count <= maxByteSize {
                    return (resizedImage, jpegData)
                }
            }
        }

        return (fallbackImage, fallbackData)
    }

    private func resizedImage(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let normalized = normalizedImage(image)
        let currentSize = normalized.size
        let longestSide = max(currentSize.width, currentSize.height)
        guard longestSide > maxDimension else { return normalized }

        let scale = maxDimension / longestSide
        let targetSize = CGSize(width: max(1, currentSize.width * scale), height: max(1, currentSize.height * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
        return renderer.image { _ in
            normalized.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }

    private func normalizedImage(_ image: UIImage) -> UIImage {
        guard image.imageOrientation != .up else { return image }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        let renderer = UIGraphicsImageRenderer(size: image.size, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }
}
