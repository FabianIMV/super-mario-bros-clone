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
import type { GamePartition, InputState, PowerState } from '../engine/types';

interface Props {
  inputRef: React.MutableRefObject<InputState>;
  partition: GamePartition;
  powerState: PowerState;
  mountedYoshi: boolean;
  controlScale: number;
  visible: boolean;
}

interface VisualPressed {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  run: boolean;
  jump: boolean;
  fire: boolean;
  spin: boolean;
}

const EMPTY_VISUAL: VisualPressed = {
  left: false,
  right: false,
  up: false,
  down: false,
  run: false,
  jump: false,
  fire: false,
  spin: false,
};

export const ArcadeTouchControls: React.FC<Props> = ({
  inputRef,
  partition,
  powerState,
  mountedYoshi,
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
    up: false,
    down: false,
    jump: false,
    run: false,
    fire: false,
    spin: false,
  });

  // Tucked cleanly into lower corners so the entire center-left & center playfield is 100% unobstructed!
  const leftMargin = Math.max(insets.left - 16, 12);
  const rightMargin = Math.max(insets.right - 14, 12);
  const bottomMargin = Math.max(insets.bottom - 10, 6);

  const dpadSize = Math.round(118 * controlScale);
  const dpadCenterX = leftMargin + dpadSize * 0.5;
  const dpadCenterY = height - bottomMargin - dpadSize * 0.48;

  // SNES Ergonomic 4-Button Diamond in Bottom-Right Corner (B, A, Y, X)
  const btnRadius = Math.round(29 * controlScale);
  const jumpCenterX = width - rightMargin - btnRadius - 2;
  const jumpCenterY = height - bottomMargin - btnRadius - 26 * controlScale;

  const runCenterX = jumpCenterX - 60 * controlScale;
  const runCenterY = height - bottomMargin - btnRadius - 2;

  const auxRadius = Math.round(23 * controlScale);
  const spinCenterX = runCenterX - 18 * controlScale;
  const spinCenterY = runCenterY - 52 * controlScale;

  const fireCenterX = jumpCenterX - 20 * controlScale;
  const fireCenterY = jumpCenterY - 52 * controlScale;

  const syncMergedInput = useCallback(
    (touchState: VisualPressed) => {
      const kb = kbStateRef.current;
      const merged: InputState = {
        left: touchState.left || kb.left,
        right: touchState.right || kb.right,
        up: touchState.up || kb.up,
        down: touchState.down || kb.down,
        run: touchState.run || kb.run,
        jump: touchState.jump || kb.jump,
        fire: touchState.fire || kb.fire,
        spin: touchState.spin || kb.spin,
      };
      inputRef.current = merged;

      const prev = prevVisualRef.current;
      if (
        prev.left !== touchState.left ||
        prev.right !== touchState.right ||
        prev.up !== touchState.up ||
        prev.down !== touchState.down ||
        prev.run !== touchState.run ||
        prev.jump !== touchState.jump ||
        prev.fire !== touchState.fire ||
        prev.spin !== touchState.spin
      ) {
        // ULTRA-STRONG Taptic burst whenever ANY directional arrow engages!
        if (
          (!prev.left && touchState.left) ||
          (!prev.right && touchState.right) ||
          (!prev.up && touchState.up) ||
          (!prev.down && touchState.down)
        ) {
          haptics.triggerDpadArrow();
        } else if (
          (!prev.jump && touchState.jump) ||
          (!prev.run && touchState.run) ||
          (!prev.fire && touchState.fire) ||
          (!prev.spin && touchState.spin)
        ) {
          haptics.triggerActionButton();
        }
        prevVisualRef.current = touchState;
        setPressed(touchState);
      }
    },
    [inputRef]
  );

  // Desktop / Web Keyboard support
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const kb = kbStateRef.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') kb.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') kb.right = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') kb.up = true;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') kb.down = true;
      if (e.code === 'Space' || e.code === 'KeyK') kb.jump = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyZ' || e.code === 'KeyJ') {
        kb.run = true;
        kb.fire = true;
      }
      if (e.code === 'KeyX') {
        kb.fire = true;
        kb.run = true;
      }
      if (e.code === 'KeyC' || e.code === 'KeyE') {
        kb.spin = true;
        kb.run = true;
      }
      syncMergedInput(prevVisualRef.current);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const kb = kbStateRef.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') kb.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') kb.right = false;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') kb.up = false;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') kb.down = false;
      if (e.code === 'Space' || e.code === 'KeyK') kb.jump = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyZ' || e.code === 'KeyJ') {
        kb.run = false;
        kb.fire = false;
      }
      if (e.code === 'KeyX') {
        kb.fire = false;
        kb.run = false;
      }
      if (e.code === 'KeyC' || e.code === 'KeyE') {
        kb.spin = false;
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
        up: false,
        down: false,
        jump: false,
        run: false,
        fire: false,
        spin: false,
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
        up: false,
        down: false,
        run: false,
        jump: false,
        fire: false,
        spin: false,
      };

      const dpadHalo = dpadSize * 0.92;
      const actionHalo = btnRadius * 1.34;
      const auxHalo = auxRadius * 1.38;

      for (let i = 0; i < touches.length; i++) {
        const tx = touches[i].pageX;
        const ty = touches[i].pageY;

        // Left side -> Slideable 4-Way Arcade D-Pad
        if (tx < width * 0.45) {
          const dx = tx - dpadCenterX;
          const dy = ty - dpadCenterY;
          if (Math.hypot(dx, dy) <= dpadHalo) {
            const deadzone = 10 * controlScale;
            if (dx < -deadzone) next.left = true;
            else if (dx > deadzone) next.right = true;

            if (dy > deadzone * 1.35 && Math.abs(dy) > Math.abs(dx) * 0.68) {
              next.down = true;
            } else if (dy < -deadzone * 1.35 && Math.abs(dy) > Math.abs(dx) * 0.68) {
              next.up = true;
            }
          }
          continue;
        }

        // Right side -> SNES B / A / Y / X Cluster
        const distJump = Math.hypot(tx - jumpCenterX, ty - jumpCenterY);
        const distRun = Math.hypot(tx - runCenterX, ty - runCenterY);
        const distFire = Math.hypot(tx - fireCenterX, ty - fireCenterY);
        const distSpin = Math.hypot(tx - spinCenterX, ty - spinCenterY);

        if (distJump <= actionHalo) {
          next.jump = true;
        }
        if (distRun <= actionHalo) {
          next.run = true;
          if (!mountedYoshi && powerState === 2) {
            next.fire = true;
          }
        }
        if (distFire <= auxHalo) {
          next.fire = true;
          next.run = true;
        }
        if (distSpin <= auxHalo) {
          next.spin = true;
          next.run = true;
          if (partition !== 'smw') {
            next.fire = true;
          }
        }
      }

      syncMergedInput(next);
    },
    [
      auxRadius,
      btnRadius,
      controlScale,
      dpadCenterX,
      dpadCenterY,
      dpadSize,
      fireCenterX,
      fireCenterY,
      jumpCenterX,
      jumpCenterY,
      mountedYoshi,
      partition,
      powerState,
      runCenterX,
      runCenterY,
      spinCenterX,
      spinCenterY,
      syncMergedInput,
      width,
    ]
  );

  if (!visible) return null;

  const armThick = Math.round(36 * controlScale);
  const armLen = Math.round((dpadSize - armThick) / 2 - 5);

  const xLabel = mountedYoshi
    ? 'LENGUA'
    : powerState === 3
    ? 'CAPA'
    : powerState === 2
    ? 'FUEGO'
    : 'LLAVE';
  const yLabel = mountedYoshi
    ? 'LENGUA'
    : partition === 'smw'
    ? 'GIRO'
    : 'ATAQUE';

  return (
    <View
      style={StyleSheet.absoluteFill}
      onTouchStart={evaluateTouches}
      onTouchMove={evaluateTouches}
      onTouchEnd={evaluateTouches}
      onTouchCancel={evaluateTouches}
    >
      {/* ==================== COMPACT CORNER-TUCKED 4-WAY D-PAD ==================== */}
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
        {/* Up Segment (Cape Swoop / Yoshi Dismount) */}
        <View
          style={[
            styles.dpadCrossUp,
            pressed.up && styles.dpadSegmentActive,
            {
              width: armThick,
              height: armLen,
              left: (dpadSize - armThick) / 2,
              top: 6,
            },
          ]}
        >
          <Text style={[styles.dpadArrowSmall, pressed.up && styles.dpadArrowActive]}>▲</Text>
        </View>

        {/* Horizontal Cross Bar */}
        <View
          style={[
            styles.dpadCrossHoriz,
            {
              width: dpadSize - 12,
              height: armThick,
              top: (dpadSize - armThick) / 2,
              left: 6,
            },
          ]}
        >
          <View style={[styles.dpadSegmentLeft, pressed.left && styles.dpadSegmentActive]}>
            <Text style={[styles.dpadArrow, pressed.left && styles.dpadArrowActive]}>◀</Text>
          </View>
          <View style={styles.dpadPivot}>
            <View style={styles.dpadPivotDimple} />
          </View>
          <View style={[styles.dpadSegmentRight, pressed.right && styles.dpadSegmentActive]}>
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
              height: armLen,
              left: (dpadSize - armThick) / 2,
              bottom: 6,
            },
          ]}
        >
          <Text style={[styles.dpadArrowSmall, pressed.down && styles.dpadArrowActive]}>▼</Text>
        </View>
      </View>

      {/* ==================== RIGHT SNES 4-BUTTON DIAMOND ==================== */}
      <View
        pointerEvents="none"
        style={[
          styles.chordBridge,
          {
            width: 84 * controlScale,
            height: 38 * controlScale,
            left: (runCenterX + jumpCenterX) / 2 - 42 * controlScale,
            top: (runCenterY + jumpCenterY) / 2 - 19 * controlScale,
          },
        ]}
      />

      {/* Y Button: Yoshi Tongue / SMW Spin Jump */}
      {(partition === 'smw' || mountedYoshi) && (
        <View
          pointerEvents="none"
          style={[
            styles.spinBtn,
            mountedYoshi ? styles.spinBtnYoshi : styles.spinBtnSmw,
            pressed.spin && styles.btnDepressed,
            {
              width: auxRadius * 2,
              height: auxRadius * 2,
              borderRadius: auxRadius,
              left: spinCenterX - auxRadius,
              top: spinCenterY - auxRadius,
            },
          ]}
        >
          <Text style={styles.auxBtnText}>Y</Text>
          <Text style={styles.btnSubLabel}>{yLabel}</Text>
        </View>
      )}

      {/* X Button: Cape Whip / Fireball / Yoshi Tongue */}
      <View
        pointerEvents="none"
        style={[
          styles.fireBtn,
          powerState >= 2 || mountedYoshi ? styles.fireBtnArmed : styles.fireBtnDim,
          pressed.fire && styles.btnDepressed,
          {
            width: auxRadius * 2,
            height: auxRadius * 2,
            borderRadius: auxRadius,
            left: fireCenterX - auxRadius,
            top: fireCenterY - auxRadius,
          },
        ]}
      >
        <Text style={styles.auxBtnText}>X</Text>
        <Text style={styles.btnSubLabel}>{xLabel}</Text>
      </View>

      {/* B Button: Sprint + P-Meter Charge */}
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

      {/* A Button: Jump / Cape Parachute */}
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
        <Text style={styles.btnSubLight}>{powerState === 3 ? 'VOLAR' : 'SALTAR'}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dpadBasePlate: {
    position: 'absolute',
    backgroundColor: 'rgba(9, 13, 22, 0.32)',
    borderWidth: 1.5,
    borderColor: 'rgba(148, 163, 184, 0.28)',
  },
  dpadCrossHoriz: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 41, 59, 0.78)',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.65)',
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
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  dpadPivotDimple: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#475569',
  },
  dpadCrossUp: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.78)',
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: 'rgba(148, 163, 184, 0.65)',
  },
  dpadCrossDown: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.78)',
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: 'rgba(148, 163, 184, 0.65)',
  },
  dpadSegmentActive: {
    backgroundColor: '#2563eb',
  },
  dpadArrow: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '900',
  },
  dpadArrowSmall: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '900',
  },
  dpadArrowActive: {
    color: '#ffffff',
  },
  chordBridge: {
    position: 'absolute',
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    transform: [{ rotate: '-22deg' }],
  },
  spinBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  spinBtnYoshi: {
    backgroundColor: 'rgba(22, 163, 74, 0.86)',
    borderColor: '#bbf7d0',
  },
  spinBtnSmw: {
    backgroundColor: 'rgba(16, 185, 129, 0.82)',
    borderColor: '#a7f3d0',
  },
  fireBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  fireBtnArmed: {
    backgroundColor: 'rgba(37, 99, 235, 0.86)',
    borderColor: '#fde047',
  },
  fireBtnDim: {
    backgroundColor: 'rgba(51, 65, 85, 0.65)',
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  auxBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  btnDepressed: {
    transform: [{ scale: 0.91 }],
    backgroundColor: '#38bdf8',
  },
  runBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250, 204, 21, 0.82)',
    borderWidth: 2.5,
    borderColor: '#fef08a',
  },
  runBtnActive: {
    transform: [{ scale: 0.91 }],
    backgroundColor: '#fde047',
  },
  jumpBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(225, 29, 46, 0.85)',
    borderWidth: 2.5,
    borderColor: '#fda4af',
  },
  jumpBtnActive: {
    transform: [{ scale: 0.91 }],
    backgroundColor: '#fb7185',
  },
  btnLetterDark: {
    color: '#422006',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  btnSubDark: {
    color: '#713f12',
    fontSize: 7,
    fontWeight: '800',
  },
  btnLetterLight: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  btnSubLight: {
    color: '#ffe4e6',
    fontSize: 7,
    fontWeight: '800',
  },
  btnSubLabel: {
    color: '#f8fafc',
    fontSize: 6.5,
    fontWeight: '800',
  },
});
