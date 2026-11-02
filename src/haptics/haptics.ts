import * as Haptics from 'expo-haptics';
import type { HapticKind } from '../engine/types';

class TapticController {
  private enabled = true;
  private lastTickMs = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  trigger(kind: HapticKind): void {
    if (!this.enabled) return;
    const now = Date.now();
    // Prevent motor saturation when picking up dense coin rows
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
