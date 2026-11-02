import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getWorldLabel } from '../engine/biomes';
import type { SaveProgress } from '../engine/types';

interface Props {
  progress: SaveProgress;
  pixelFontLoaded: boolean;
  onStartAdventure: () => void;
  onContinue: () => void;
  onOpenWorldSelect: () => void;
  onOpenSettings: () => void;
}

export const TitleScreen: React.FC<Props> = ({
  progress,
  pixelFontLoaded,
  onStartAdventure,
  onContinue,
  onOpenWorldSelect,
  onOpenSettings,
}) => {
  const insets = useSafeAreaInsets();
  const fontFamily = pixelFontLoaded ? 'PressStart2P_400Regular' : undefined;
  const hasSavedStage = progress.unlockedLevel > 0;

  return (
    <View
      style={[
        styles.overlay,
        {
          paddingLeft: Math.max(insets.left, 20),
          paddingRight: Math.max(insets.right, 20),
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: Math.max(insets.top, 10),
        },
      ]}
    >
      {/* Classic Wooden/Copper Riveted Signboard Logo */}
      <View style={styles.signBoard}>
        <View style={styles.rivetRow}>
          <View style={styles.rivet} />
          <Text style={[styles.editionTag, { fontFamily }]}>16-BIT CONSOLE EDITION</Text>
          <View style={styles.rivet} />
        </View>

        <Text style={[styles.logoSuper, { fontFamily }]}>SUPER PLOMERO</Text>
        <Text style={[styles.logoBros, { fontFamily }]}>BROS. DELUXE</Text>

        <View style={styles.rivetRowBottom}>
          <View style={styles.rivet} />
          <Text style={[styles.recordText, { fontFamily }]}>
            RÉCORD {String(progress.highScore).padStart(6, '0')}  •  ★ {progress.clearedLevels.length}/24
          </Text>
          <View style={styles.rivet} />
        </View>
      </View>

      {/* Action Buttons Row */}
      <View style={styles.menuRow}>
        {hasSavedStage && (
          <Pressable
            onPress={onContinue}
            style={({ pressed }) => [
              styles.btnPrimaryEmerald,
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={[styles.btnPrimaryText, { fontFamily }]}>
              CONTINUAR {getWorldLabel(progress.unlockedLevel)}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={onStartAdventure}
          style={({ pressed }) => [styles.btnPrimaryGold, pressed && styles.btnPressed]}
        >
          <Text style={[styles.btnDarkText, { fontFamily }]}>
            {hasSavedStage ? 'NUEVA PARTIDA' : '▶ JUGAR 1-1'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onOpenWorldSelect}
          style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed]}
        >
          <Text style={[styles.btnLightText, { fontFamily }]}>6 MUNDOS</Text>
        </Pressable>

        <Pressable
          onPress={onOpenSettings}
          style={({ pressed }) => [styles.btnIcon, pressed && styles.btnPressed]}
        >
          <Text style={[styles.btnLightText, { fontFamily }]}>⚙</Text>
        </Pressable>
      </View>

      <Text style={styles.hintFooter}>
        Desliza el pulgar en la cruceta  •  Mantén B para correr y rueda el pulgar hacia A para gran salto
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 10, 22, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  signBoard: {
    backgroundColor: '#9a3412',
    borderWidth: 4,
    borderColor: '#fed7aa',
    borderRadius: 12,
    paddingHorizontal: 26,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 6 },
    maxWidth: 540,
  },
  rivetRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rivetRowBottom: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  rivet: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#fde68a',
    borderWidth: 1,
    borderColor: '#451a03',
  },
  editionTag: {
    color: '#fde68a',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  logoSuper: {
    color: '#fef08a',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: '#141013',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  logoBros: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 5,
    textAlign: 'center',
    textShadowColor: '#141013',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  recordText: {
    color: '#ffedd5',
    fontSize: 8,
    fontWeight: '800',
    marginHorizontal: 12,
  },
  menuRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 18,
  },
  btnPrimaryGold: {
    backgroundColor: '#facc15',
    borderWidth: 3,
    borderColor: '#fef9c3',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#713f12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 },
  },
  btnPrimaryEmerald: {
    backgroundColor: '#16a34a',
    borderWidth: 3,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#052e16',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 },
  },
  btnSecondary: {
    backgroundColor: '#1e293b',
    borderWidth: 3,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    shadowColor: '#090d16',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 },
  },
  btnIcon: {
    backgroundColor: '#1e293b',
    borderWidth: 3,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  btnPressed: {
    transform: [{ translateY: 3 }],
  },
  btnDarkText: {
    color: '#422006',
    fontSize: 10,
    fontWeight: '900',
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  btnLightText: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '900',
  },
  hintFooter: {
    marginTop: 14,
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(9, 13, 22, 0.72)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
