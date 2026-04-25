import AuthenticationServices
import Capacitor
import Foundation
import UIKit

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

