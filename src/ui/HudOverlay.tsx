import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PowerState } from '../engine/types';

export interface HudSnapshot {
  score: number;
  coins: number;
  worldLabel: string;
  stageTitle: string;
  timeLeft: number;
  lives: number;
  powerState: PowerState;
  starActive: boolean;
  bossHp: number | null;
  bossMaxHp: number | null;
}

interface Props {
  hud: HudSnapshot;
  pixelFontLoaded: boolean;
  onPausePress: () => void;
}

export const HudOverlay: React.FC<Props> = ({ hud, pixelFontLoaded, onPausePress }) => {
  const insets = useSafeAreaInsets();
  const fontFamily = pixelFontLoaded ? 'PressStart2P_400Regular' : undefined;

  const powerBadge = hud.starActive
    ? { label: '★ ESTRELLA', bg: '#eab308', text: '#1c1917' }
    : hud.powerState === 2
    ? { label: '♦ FUEGO', bg: '#ea580c', text: '#ffffff' }
    : hud.powerState === 1
    ? { label: '▲ SUPER', bg: '#16a34a', text: '#ffffff' }
    : null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          paddingLeft: Math.max(insets.left, 16) + 6,
          paddingRight: Math.max(insets.right, 16) + 6,
          paddingTop: Math.max(insets.top, 8),
        },
      ]}
    >
      <View pointerEvents="none" style={styles.statsBar}>
        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { fontFamily, color: '#f87171' }]}>PLOMERO</Text>
          <Text style={[styles.statValue, { fontFamily }]}>
            {String(hud.score).padStart(6, '0')}
          </Text>
        </View>

        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { fontFamily, color: '#fde047' }]}>MONEDAS</Text>
          <View style={styles.coinRow}>
            <View style={styles.coinIcon} />
            <Text style={[styles.statValue, { fontFamily }]}>
              x{String(hud.coins).padStart(2, '0')}
            </Text>
          </View>
        </View>

        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { fontFamily, color: '#4ade80' }]}>MUNDO</Text>
          <Text style={[styles.statValue, { fontFamily }]}>{hud.worldLabel}</Text>
        </View>

        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { fontFamily, color: '#fbbf24' }]}>TIEMPO</Text>
          <Text
            style={[
              styles.statValue,
              { fontFamily },
              hud.timeLeft <= 60 && { color: '#ef4444' },
            ]}
          >
            {String(hud.timeLeft).padStart(3, '0')}
          </Text>
        </View>

        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { fontFamily, color: '#f472b6' }]}>VIDAS</Text>
          <Text style={[styles.statValue, { fontFamily }]}>
            ♥x{Math.max(0, hud.lives)}
          </Text>
        </View>

        {powerBadge && (
          <View style={[styles.powerPill, { backgroundColor: powerBadge.bg }]}>
            <Text style={[styles.powerPillText, { fontFamily, color: powerBadge.text }]}>
              {powerBadge.label}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.rightCluster} pointerEvents="box-none">
        {hud.bossHp !== null && hud.bossMaxHp !== null && hud.bossHp > 0 && (
          <View pointerEvents="none" style={styles.bossBarBox}>
            <Text style={[styles.bossLabel, { fontFamily }]}>REY KOOPA</Text>
            <View style={styles.bossTrack}>
              <View
                style={[
                  styles.bossFill,
                  { width: `${Math.max(0, (hud.bossHp / hud.bossMaxHp) * 100)}%` },
                ]}
              />
            </View>
          </View>
        )}

        <Pressable
          onPress={onPausePress}
          hitSlop={12}
          style={({ pressed }) => [styles.pauseBtn, pressed && styles.pauseBtnPressed]}
        >
          <Text style={[styles.pauseText, { fontFamily }]}>II</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 30,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(9, 13, 22, 0.64)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  statCol: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
    textShadowColor: '#000000',
    textShadowOffset: { width: 1.5, height: 1.5 },
    textShadowRadius: 0,
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  coinIcon: {
    width: 8,
    height: 11,
    borderRadius: 3,
    backgroundColor: '#facc15',
    borderWidth: 1,
    borderColor: '#fef08a',
  },
  powerPill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  powerPillText: {
    fontSize: 8,
    fontWeight: '900',
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bossBarBox: {
    backgroundColor: 'rgba(24, 5, 5, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ef4444',
    width: 112,
  },
  bossLabel: {
    color: '#fca5a5',
    fontSize: 7,
    fontWeight: '900',
    marginBottom: 3,
    textAlign: 'center',
  },
  bossTrack: {
    height: 7,
    backgroundColor: '#450a0a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  bossFill: {
    height: '100%',
    backgroundColor: '#ef4444',
  },
  pauseBtn: {
    width: 38,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtnPressed: {
    transform: [{ scale: 0.92 }],
    backgroundColor: '#334155',
  },
  pauseText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '900',
  },
});
