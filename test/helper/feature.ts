import { Feature, FeatureStatus } from '../../src/status.ts';

interface Featureable {
  get status(): Feature;
}

const waitForFeatureStatus = (feature: Feature, expectedStatus: FeatureStatus) => {
  return new Promise<void>((resolve, reject) => {
    if (feature.currentStatus === expectedStatus) {
      resolve();
      return;
    }

    const { off } = feature.onStatusChange((change) => {
      if (change.status === expectedStatus) {
        resolve();
        off();
      }
    });
    setTimeout(() => {
      reject(new Error(`Timed out waiting for feature status ${expectedStatus}`));
    }, 3000);
  });
};

// Convenience methods for waiting for a feature to reach a specific status
export const waitForFeatureConnected = (feature: Featureable) =>
  waitForFeatureStatus(feature.status, FeatureStatus.Connected);

export const waitForFeatureFailed = (feature: Featureable) =>
  waitForFeatureStatus(feature.status, FeatureStatus.Failed);
