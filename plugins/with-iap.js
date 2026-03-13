const { withXcodeProject } = require("expo/config-plugins");

/**
 * Custom Expo config plugin to add In-App Purchase capability to the iOS project.
 * Required for StoreKit / RevenueCat to work on iOS.
 *
 * This adds the "com.apple.InAppPurchase" system capability to the Xcode project,
 * which is equivalent to enabling "In-App Purchase" in Xcode > Signing & Capabilities.
 */
module.exports = function withIAP(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;

    // Get the main target
    const targetKey = xcodeProject.getFirstTarget()?.uuid;
    if (targetKey) {
      // Add In-App Purchase capability
      xcodeProject.addTargetAttribute("SystemCapabilities", {
        "com.apple.InAppPurchase": { enabled: 1 },
      }, targetKey);
    }

    return config;
  });
};
