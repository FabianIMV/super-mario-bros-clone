import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../haptics/haptics';
import type { InputState, PowerState } from '../engine/types';

interface Props {
  inputRef: React.MutableRefObject<InputState>;
  powerState: PowerState;
  controlScale: number;
  visible: boolean;
}

interface VisualPressed {
  left: boolean;
  right: boolean;
  down: boolean;
  run: boolean;
  jump: boolean;
  fire: boolean;
}

const EMPTY_VISUAL: VisualPressed = {
  left: false,
  right: false,
  down: false,
  run: false,
  jump: false,
  fire: false,
};

export const ArcadeTouchControls: React.FC<Props> = ({
  inputRef,
  powerState,
  controlScale,
  visible,
}) => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pressed, setPressed] = useState<VisualPressed>(EMPTY_VISUAL);
  const prevVisualRef = useRef<VisualPressed>(EMPTY_VISUAL);
  const kbStateRef = useRef<InputState>({
    left: false,
    right: false,
    down: false,
    jump: false,
    run: false,
    fire: false,
  });

  // Geometry anchored to iPhone 12 landscape safe zones (notch + home indicator)
  const leftMargin = Math.max(insets.left, 18) + 8;
  const rightMargin = Math.max(insets.right, 18) + 8;
  const bottomMargin = Math.max(insets.bottom, 12) + 8;

  const dpadSize = Math.round(138 * controlScale);
  const dpadCenterX = leftMargin + dpadSize * 0.5;
  const dpadCenterY = height - bottomMargin - dpadSize * 0.48;

  // Angled SNES/NES Right Thumb Cluster: B (lower-left: Sprint/Fire) -> A (upper-right: Jump)
  const btnRadius = Math.round(33 * controlScale);
  const jumpCenterX = width - rightMargin - btnRadius - 4;
  const jumpCenterY = height - bottomMargin - btnRadius - 30 * controlScale;

  const runCenterX = jumpCenterX - 68 * controlScale;
  const runCenterY = height - bottomMargin - btnRadius - 4;

  // Dedicated quick Fireball button tucked ergonomically above B when Fire Power is active (or always ready)
  const fireRadius = Math.round(25 * controlScale);
  const fireCenterX = runCenterX + 8 * controlScale;
  const fireCenterY = jumpCenterY - 56 * controlScale;

  const syncMergedInput = useCallback(
    (touchState: VisualPressed) => {
      const kb = kbStateRef.current;
      const merged: InputState = {
        left: touchState.left || kb.left,
        right: touchState.right || kb.right,
        down: touchState.down || kb.down,
        run: touchState.run || kb.run,
        jump: touchState.jump || kb.jump,
        fire: touchState.fire || kb.fire,
      };
      inputRef.current = merged;

      const prev = prevVisualRef.current;
      if (
        prev.left !== touchState.left ||
        prev.right !== touchState.right ||
        prev.down !== touchState.down ||
        prev.run !== touchState.run ||
        prev.jump !== touchState.jump ||
        prev.fire !== touchState.fire
      ) {
        // Subtle tactile click when sliding across D-Pad directions or pressing arcade caps
        if (
          (!prev.left && touchState.left) ||
          (!prev.right && touchState.right) ||
          (!prev.down && touchState.down)
        ) {
          haptics.trigger('tick');
        }
        prevVisualRef.current = touchState;
        setPressed(touchState);
      }
    },
    [inputRef]
  );

  // Desktop / Web Keyboard support for quick testing alongside iPhone touch
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const kb = kbStateRef.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') kb.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') kb.right = true;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') kb.down = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyK') {
        kb.jump = true;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyZ' || e.code === 'KeyJ') {
        kb.run = true;
        kb.fire = true;
      }
      if (e.code === 'KeyX') {
        kb.fire = true;
        kb.run = true;
      }
      syncMergedInput(prevVisualRef.current);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const kb = kbStateRef.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') kb.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') kb.right = false;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') kb.down = false;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyK') {
        kb.jump = false;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyZ' || e.code === 'KeyJ') {
        kb.run = false;
        kb.fire = false;
      }
      if (e.code === 'KeyX') {
        kb.fire = false;
        kb.run = false;
      }
      syncMergedInput(prevVisualRef.current);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [syncMergedInput]);

  useEffect(() => {
    if (!visible) {
      inputRef.current = {
        left: false,
        right: false,
        down: false,
        jump: false,
        run: false,
        fire: false,
      };
      prevVisualRef.current = EMPTY_VISUAL;
      setPressed(EMPTY_VISUAL);
    }
  }, [visible, inputRef]);

  const evaluateTouches = useCallback(
    (e: GestureResponderEvent) => {
      const touches = e.nativeEvent.touches;
      const next: VisualPressed = {
        left: false,
        right: false,
        down: false,
        run: false,
        jump: false,
        fire: false,
      };

      const dpadHalo = dpadSize * 0.85;
      // Intentional overlapping hit halo on B and A so rolling one thumb across the B-A bridge sprint-jumps!
      const actionHalo = btnRadius * 1.34;
      const fireHalo = fireRadius * 1.38;

      for (let i = 0; i < touches.length; i++) {
        const tx = touches[i].pageX;
        const ty = touches[i].pageY;

        // Left half of screen -> Slideable Arcade D-Pad
        if (tx < width * 0.48) {
          const dx = tx - dpadCenterX;
          const dy = ty - dpadCenterY;
          if (Math.hypot(dx, dy) <= dpadHalo) {
            const deadzone = 11 * controlScale;
            if (dx < -deadzone) next.left = true;
            else if (dx > deadzone) next.right = true;
            if (dy > deadzone * 1.45 && Math.abs(dy) > Math.abs(dx) * 0.72) {
              next.down = true;
            }
          }
          continue;
        }

        // Right half of screen -> Multi-touch / Thumb-roll B + A + Fire Cluster
        const distJump = Math.hypot(tx - jumpCenterX, ty - jumpCenterY);
        const distRun = Math.hypot(tx - runCenterX, ty - runCenterY);
        const distFire = Math.hypot(tx - fireCenterX, ty - fireCenterY);

        if (distJump <= actionHalo) {
          next.jump = true;
        }
        if (distRun <= actionHalo) {
          next.run = true;
          next.fire = true; // Like classic Mario, pressing B fires a fireball AND holding B sprints!
        }
        if (distFire <= fireHalo) {
          next.fire = true;
          next.run = true;
        }
      }

      syncMergedInput(next);
    },
    [
      btnRadius,
      controlScale,
      dpadCenterX,
      dpadCenterY,
      dpadSize,
      fireCenterX,
      fireCenterY,
      fireRadius,
      jumpCenterX,
      jumpCenterY,
      runCenterX,
      runCenterY,
      syncMergedInput,
      width,
    ]
  );

  if (!visible) return null;

  const armThick = Math.round(42 * controlScale);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onTouchStart={evaluateTouches}
      onTouchMove={evaluateTouches}
      onTouchEnd={evaluateTouches}
      onTouchCancel={evaluateTouches}
    >
      {/* ==================== SLIDEABLE TACTILE D-PAD ==================== */}
      <View
        pointerEvents="none"
        style={[
          styles.dpadBasePlate,
          {
            width: dpadSize,
            height: dpadSize,
            borderRadius: dpadSize * 0.5,
            left: dpadCenterX - dpadSize * 0.5,
            top: dpadCenterY - dpadSize * 0.5,
          },
        ]}
      >
        {/* Horizontal Cross Bar */}
        <View
          style={[
            styles.dpadCrossHoriz,
            {
              width: dpadSize - 16,
              height: armThick,
              top: (dpadSize - armThick) / 2,
              left: 8,
            },
          ]}
        >
          <View
            style={[
              styles.dpadSegmentLeft,
              pressed.left && styles.dpadSegmentActive,
            ]}
          >
            <Text style={[styles.dpadArrow, pressed.left && styles.dpadArrowActive]}>◀</Text>
          </View>
          <View style={styles.dpadPivot}>
            <View style={styles.dpadPivotDimple} />
          </View>
          <View
            style={[
              styles.dpadSegmentRight,
              pressed.right && styles.dpadSegmentActive,
            ]}
          >
            <Text style={[styles.dpadArrow, pressed.right && styles.dpadArrowActive]}>▶</Text>
          </View>
        </View>

        {/* Down Crouch Segment */}
        <View
          style={[
            styles.dpadCrossDown,
            pressed.down && styles.dpadSegmentActive,
            {
              width: armThick,
              height: (dpadSize - armThick) / 2 - 6,
              left: (dpadSize - armThick) / 2,
              bottom: 8,
            },
          ]}
        >
          <Text style={[styles.dpadArrowSmall, pressed.down && styles.dpadArrowActive]}>▼</Text>
        </View>
      </View>

      {/* ==================== RIGHT ARCADE CLUSTER (B + A + FIRE) ==================== */}
      {/* Subtle B-A Chord Bridge Pill showing thumb-roll zone */}
      <View
        pointerEvents="none"
        style={[
          styles.chordBridge,
          {
            width: 96 * controlScale,
            height: 44 * controlScale,
            left: (runCenterX + jumpCenterX) / 2 - 48 * controlScale,
            top: (runCenterY + jumpCenterY) / 2 - 22 * controlScale,
          },
        ]}
      />

      {/* Dedicated Fireball Trigger (glows bright orange when Fire Plomero is active!) */}
      <View
        pointerEvents="none"
        style={[
          styles.fireBtn,
          powerState === 2 ? styles.fireBtnArmed : styles.fireBtnDim,
          pressed.fire && styles.btnDepressed,
          {
            width: fireRadius * 2,
            height: fireRadius * 2,
            borderRadius: fireRadius,
            left: fireCenterX - fireRadius,
            top: fireCenterY - fireRadius,
          },
        ]}
      >
        <Text style={styles.fireBtnText}>X</Text>
        <Text style={styles.btnSubLabel}>{powerState === 2 ? 'FUEGO' : 'TURBO'}</Text>
      </View>

      {/* B Button: Sprint + Fire */}
      <View
        pointerEvents="none"
        style={[
          styles.runBtn,
          pressed.run && styles.runBtnActive,
          {
            width: btnRadius * 2,
            height: btnRadius * 2,
            borderRadius: btnRadius,
            left: runCenterX - btnRadius,
            top: runCenterY - btnRadius,
          },
        ]}
      >
        <Text style={styles.btnLetterDark}>B</Text>
        <Text style={styles.btnSubDark}>CORRER</Text>
      </View>

      {/* A Button: Primary Jump */}
      <View
        pointerEvents="none"
        style={[
          styles.jumpBtn,
          pressed.jump && styles.jumpBtnActive,
          {
            width: btnRadius * 2 + 4,
            height: btnRadius * 2 + 4,
            borderRadius: btnRadius + 2,
            left: jumpCenterX - btnRadius - 2,
            top: jumpCenterY - btnRadius - 2,
          },
        ]}
      >
        <Text style={styles.btnLetterLight}>A</Text>
        <Text style={styles.btnSubLight}>SALTAR</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dpadBasePlate: {
    position: 'absolute',
    backgroundColor: 'rgba(9, 13, 22, 0.42)',
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.28)',
  },
  dpadCrossHoriz: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 41, 59, 0.86)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#64748b',
    overflow: 'hidden',
  },
  dpadSegmentLeft: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadSegmentRight: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadPivot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  dpadPivotDimple: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#475569',
  },
  dpadCrossDown: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.86)',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: '#64748b',
  },
  dpadSegmentActive: {
    backgroundColor: '#3b82f6',
  },
  dpadArrow: {
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '900',
  },
  dpadArrowSmall: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '900',
  },
  dpadArrowActive: {
    color: '#ffffff',
  },
  chordBridge: {
    position: 'absolute',
    borderRadius: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    transform: [{ rotate: '-22deg' }],
  },
  fireBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  fireBtnArmed: {
    backgroundColor: 'rgba(249, 115, 22, 0.88)',
    borderColor: '#fde047',
  },
  fireBtnDim: {
    backgroundColor: 'rgba(51, 65, 85, 0.68)',
    borderColor: 'rgba(148, 163, 184, 0.55)',
  },
  fireBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  btnDepressed: {
    transform: [{ scale: 0.92 }],
    backgroundColor: '#fb923c',
  },
  runBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250, 204, 21, 0.84)',
    borderWidth: 3,
    borderColor: '#fef08a',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
  },
  runBtnActive: {
    transform: [{ scale: 0.92 }],
    backgroundColor: '#fde047',
  },
  jumpBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(225, 29, 46, 0.88)',
    borderWidth: 3,
    borderColor: '#fda4af',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
  jumpBtnActive: {
    transform: [{ scale: 0.92 }],
    backgroundColor: '#fb7185',
  },
  btnLetterDark: {
    color: '#422006',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 19,
  },
  btnSubDark: {
    color: '#713f12',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  btnLetterLight: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  btnSubLight: {
    color: '#ffe4e6',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  btnSubLabel: {
    color: '#fff7ed',
    fontSize: 7,
    fontWeight: '800',
  },
});
