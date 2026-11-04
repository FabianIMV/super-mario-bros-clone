import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GamePartition, GameSettings, WorldStatus } from '../engine/types';

interface PauseProps {
  visible: boolean;
  mode: 'pause' | 'settings';
  partition: GamePartition;
  settings: GameSettings;
  pixelFontLoaded: boolean;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onSwitchPartition: () => void;
  onResume: () => void;
  onRestartStage: () => void;
  onOpenWorldSelect: () => void;
  onExitToTitle: () => void;
}

export const PauseModal: React.FC<PauseProps> = ({
  visible,
  mode,
  partition,
  settings,
  pixelFontLoaded,
  onUpdateSettings,
  onSwitchPartition,
  onResume,
  onRestartStage,
  onOpenWorldSelect,
  onExitToTitle,
}) => {
  const insets = useSafeAreaInsets();
  const fontFamily = pixelFontLoaded ? 'PressStart2P_400Regular' : undefined;

  if (!visible) return null;

  const isSmw = partition === 'smw';
  const isFrontier = partition === 'frontier';

  const toggleItems: Array<{ key: keyof GameSettings; label: string }> = [
    { key: 'soundEnabled', label: 'EFECTOS SFX' },
    { key: 'musicEnabled', label: 'MÚSICA 16-BIT' },
    { key: 'hapticsEnabled', label: 'VIBRACIÓN FUERTE' },
    { key: 'crtScanlines', label: 'FILTRO CRT' },
    { key: 'doubleJumpAssist', label: 'BOTAS 2X SALTO' },
  ];

  return (
    <View
      style={[
        styles.backdrop,
        {
          paddingLeft: Math.max(insets.left, 18),
          paddingRight: Math.max(insets.right, 18),
        },
      ]}
    >
      <View
        style={[
          styles.card,
          isSmw && { borderColor: '#4ade80' },
          partition === 'expedition' && { borderColor: '#a78bfa' },
          partition === 'frontier' && { borderColor: '#38bdf8' },
        ]}
      >
        <Text style={[styles.title, { fontFamily }]}>
          {mode === 'pause'
            ? isSmw
              ? 'PAUSA • PLOMERO WORLD'
              : partition === 'expedition'
              ? 'PAUSA • EXPEDICIÓN'
              : isFrontier
              ? 'PAUSA • MUNDO 5 · FRONTERA'
              : partition === 'dimension'
              ? 'PAUSA • DIMENSIÓN 3D'
              : 'PAUSA • PLOMERO BROS'
            : 'AJUSTES ARCADE'}
        </Text>

        <View style={styles.togglesGrid}>
          {toggleItems.map((item) => {
            const active = Boolean(settings[item.key]);
            return (
              <Pressable
                key={item.key}
                onPress={() => onUpdateSettings({ [item.key]: !active })}
                style={[styles.toggleChip, active && styles.toggleChipActive]}
              >
                <Text style={[styles.toggleLabel, { fontFamily }]}>{item.label}</Text>
                <Text
                  style={[
                    styles.toggleState,
                    { fontFamily, color: active ? '#4ade80' : '#94a3b8' },
                  ]}
                >
                  {active ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => {
              const nextScale =
                settings.controlScale < 0.99 ? 1.0 : settings.controlScale < 1.12 ? 1.15 : 0.88;
              onUpdateSettings({ controlScale: nextScale });
            }}
            style={styles.toggleChip}
          >
            <Text style={[styles.toggleLabel, { fontFamily }]}>TAMAÑO MANDOS</Text>
            <Text style={[styles.toggleState, { fontFamily, color: '#fde047' }]}>
              {Math.round(settings.controlScale * 100)}%
            </Text>
          </Pressable>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={onResume}
            style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}
          >
            <Text style={[styles.btnGoldText, { fontFamily }]}>
              {mode === 'pause' ? '▶ REANUDAR' : '✓ LISTO'}
            </Text>
          </Pressable>

          {mode === 'pause' && (
            <>
              <Pressable
                onPress={onRestartStage}
                style={({ pressed }) => [styles.btnSlate, pressed && styles.pressed]}
              >
                <Text style={[styles.btnLightText, { fontFamily }]}>REINICIAR</Text>
              </Pressable>

              <Pressable
                onPress={onOpenWorldSelect}
                style={({ pressed }) => [styles.btnSlate, pressed && styles.pressed]}
              >
                <Text style={[styles.btnLightText, { fontFamily }]}>MUNDOS</Text>
              </Pressable>

              <Pressable
                onPress={onSwitchPartition}
                style={({ pressed }) => [styles.btnEmerald, pressed && styles.pressed]}
              >
                <Text style={[styles.btnLightText, { fontFamily }]}>
                  {partition === 'classic'
                    ? '🦕 IR A WORLD'
                    : partition === 'smw'
                    ? '🧭 IR A EXPEDICIÓN'
                    : partition === 'expedition'
                    ? '🧊 IR A DIMENSIÓN 3D'
                    : partition === 'frontier'
                    ? '🧊 IR A DIMENSIÓN 3D'
                    : '🍄 IR A BROS'}
                </Text>
              </Pressable>

              <Pressable
                onPress={onExitToTitle}
                style={({ pressed }) => [styles.btnCrimson, pressed && styles.pressed]}
              >
                <Text style={[styles.btnLightText, { fontFamily }]}>TÍTULO</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
};

interface StatusBannerProps {
  partition: GamePartition;
  status: WorldStatus;
  worldLabel: string;
  stageTitle: string;
  lives: number;
  score: number;
  highScore: number;
  pixelFontLoaded: boolean;
  onRetry: () => void;
  onExitToTitle: () => void;
}

export const StageStatusOverlay: React.FC<StatusBannerProps> = ({
  partition,
  status,
  worldLabel,
  stageTitle,
  lives,
  score,
  highScore,
  pixelFontLoaded,
  onRetry,
  onExitToTitle,
}) => {
  const fontFamily = pixelFontLoaded ? 'PressStart2P_400Regular' : undefined;
  const isSmw = partition === 'smw';
  const isFrontier = partition === 'frontier';

  if (status === 'stage_intro') {
    return (
      <View style={styles.introOverlay}>
        <Text
          style={[
            styles.introEdition,
            {
              fontFamily,
              color: isSmw
                ? '#4ade80'
                : partition === 'expedition'
                ? '#c4b5fd'
                : isFrontier
                ? '#7dd3fc'
                : partition === 'dimension'
                ? '#a5f3fc'
                : '#f87171',
            },
          ]}
        >
          {isSmw
            ? '🦕 SUPER PLOMERO WORLD'
            : partition === 'expedition'
            ? '🧭 PLOMERO EXPEDICIÓN'
            : isFrontier
            ? '🌊 PLOMERO MUNDO 5'
            : partition === 'dimension'
            ? '🧊 PLOMERO DIMENSIÓN 3D'
            : '🍄 SUPER PLOMERO BROS'}
        </Text>
        <Text style={[styles.introWorld, { fontFamily }]}>
          {partition === 'classic' ? `MUNDO ${worldLabel}` : `ETAPA ${worldLabel}`}
        </Text>
        <Text style={styles.introSubtitle}>{stageTitle.toUpperCase()}</Text>
        <View style={styles.introLivesRow}>
          <View style={[styles.heroBadge, isSmw && { backgroundColor: '#16a34a' }]}>
            <Text style={[styles.heroBadgeLetter, { fontFamily }]}>P</Text>
          </View>
          <Text style={[styles.introLivesText, { fontFamily }]}>×  {lives}</Text>
        </View>
      </View>
    );
  }

  if (status === 'gameover' || status === 'victory') {
    const isWin = status === 'victory';
    return (
      <View style={styles.backdrop}>
        <View style={[styles.card, { borderColor: isWin ? '#4ade80' : '#ef4444' }]}>
          <Text
            style={[
              styles.title,
              { fontFamily, color: isWin ? '#4ade80' : '#f87171', fontSize: 14 },
            ]}
          >
            {isWin
              ? isSmw
                ? '¡CAMPEÓN DE PLOMERO WORLD!'
                : partition === 'expedition'
                ? '¡EXPEDICIÓN COMPLETADA!'
                : isFrontier
                ? '¡MUNDO 5 COMPLETADO!'
                : partition === 'dimension'
                ? '¡DIMENSIÓN CONQUISTADA!'
                : '¡CAMPEÓN DE LOS 6 REINOS!'
              : 'FIN DE LA PARTIDA'}
          </Text>

          <Text style={styles.summaryText}>
            {isWin
              ? isSmw
                ? '¡Liberaste la Isla Dinosaurio y los 20 niveles junto a Yoshi y la Capa Dorada!'
                : partition === 'expedition'
                ? '¡Cruzaste los 5 mundos de Expedición, incluido el Mundo 5 de Marea Espejo y Valle Vítreo: 28 niveles!'
                : isFrontier
                ? '¡Cruzaste Marea Espejo y Valle Vítreo: 8 etapas 2D!'
                : partition === 'dimension'
                ? '¡Cruzaste los 8 mundos de la Dimensión hasta el Núcleo Cósmico: 32 niveles en 3D!'
                : '¡Derrotaste al Rey Koopa en la Fortaleza Final y liberaste los 24 niveles!'
              : 'Has agotado tus vidas en esta incursión.'}
          </Text>

          <View style={styles.scoreBoard}>
            <Text style={[styles.scoreLine, { fontFamily }]}>
              PUNTOS {String(score).padStart(6, '0')}
            </Text>
            <Text style={[styles.scoreLineGold, { fontFamily }]}>
              RÉCORD {String(Math.max(score, highScore)).padStart(6, '0')}
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}
            >
              <Text style={[styles.btnGoldText, { fontFamily }]}>
                {isWin ? '▶ NUEVA GIRA' : '▶ REINTENTAR'}
              </Text>
            </Pressable>
            <Pressable
              onPress={onExitToTitle}
              style={({ pressed }) => [styles.btnSlate, pressed && styles.pressed]}
            >
              <Text style={[styles.btnLightText, { fontFamily }]}>MENÚ TÍTULO</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 10, 22, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
  },
  card: {
    width: '100%',
    maxWidth: 590,
    backgroundColor: '#0f172a',
    borderWidth: 3,
    borderColor: '#facc15',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },
  title: {
    color: '#fde047',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  togglesGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  toggleChip: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  toggleChipActive: {
    borderColor: '#38bdf8',
    backgroundColor: '#172554',
  },
  toggleLabel: {
    color: '#e2e8f0',
    fontSize: 8,
    fontWeight: '800',
  },
  toggleState: {
    fontSize: 8,
    fontWeight: '900',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 7,
  },
  btnGold: {
    backgroundColor: '#facc15',
    borderWidth: 2.5,
    borderColor: '#fef9c3',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  btnGoldText: {
    color: '#422006',
    fontSize: 8,
    fontWeight: '900',
  },
  btnSlate: {
    backgroundColor: '#334155',
    borderWidth: 2.5,
    borderColor: '#94a3b8',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  btnEmerald: {
    backgroundColor: '#15803d',
    borderWidth: 2.5,
    borderColor: '#86efac',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  btnCrimson: {
    backgroundColor: '#b91c1c',
    borderWidth: 2.5,
    borderColor: '#fca5a5',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  btnLightText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  introOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#060913',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 55,
  },
  introEdition: {
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 10,
  },
  introWorld: {
    color: '#fde047',
    fontSize: 18,
    fontWeight: '900',
  },
  introSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  introLivesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 22,
  },
  heroBadge: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#dc2626',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeLetter: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  introLivesText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  summaryText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  scoreBoard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginBottom: 14,
    gap: 6,
    alignItems: 'center',
  },
  scoreLine: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '900',
  },
  scoreLineGold: {
    color: '#fde047',
    fontSize: 10,
    fontWeight: '900',
  },
});
