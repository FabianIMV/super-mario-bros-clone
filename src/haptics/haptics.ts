import * as Haptics from 'expo-haptics';
import type { HapticKind } from '../engine/types';

class TapticController {
  private enabled = true;
  private lastTickMs = 0;
  private lastArrowMs = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Maximum-intensity multi-pulse Taptic slam for D-Pad directional arrows on iPhone 12!
   * Fires an immediate Heavy + Warning burst followed by resonant Heavy & Rigid follow-throughs.
   */
  triggerDpadArrow(): void {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.lastArrowMs < 24) return;
    this.lastArrowMs = now;

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTimeout(() => {
        if (!this.enabled) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }, 32);
      setTimeout(() => {
        if (!this.enabled) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
      }, 64);
    } catch {
      // Ignore on web / unsupported platforms
    }
  }

  /**
   * Strong crisp punch for arcade face buttons (A, B, X, Y).
   */
  triggerActionButton(): void {
    if (!this.enabled) return;
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Ignore on web / unsupported platforms
    }
  }

  trigger(kind: HapticKind): void {
    if (!this.enabled) return;
    const now = Date.now();
    if (kind === 'tick' && now - this.lastTickMs < 42) return;
    this.lastTickMs = now;

    try {
      switch (kind) {
        case 'tick':
          void Haptics.selectionAsync();
          break;
        case 'light':
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'heavy':
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case 'rigid':
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
          break;
        case 'success':
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'warning':
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          break;
        case 'error':
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
      }
    } catch {
      // Gracefully ignore on web / unsupported platforms
    }
  }
}

export const haptics = new TapticController();
