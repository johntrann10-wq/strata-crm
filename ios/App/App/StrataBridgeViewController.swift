import Capacitor
import UIKit

class StrataBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(FieldOpsPlugin())
    }
}
