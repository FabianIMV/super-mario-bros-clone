import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getWorldLabel } from '../engine/biomes';
import type { GamePartition, SaveProgress } from '../engine/types';

interface Props {
  partition: GamePartition;
  progress: SaveProgress;
  pixelFontLoaded: boolean;
  onSelectPartition: (partition: GamePartition) => void;
  onStartAdventure: () => void;
  onContinue: () => void;
  onOpenWorldSelect: () => void;
  onOpenSettings: () => void;
}

export const TitleScreen: React.FC<Props> = ({
  partition,
  progress,
  pixelFontLoaded,
  onSelectPartition,
  onStartAdventure,
  onContinue,
  onOpenWorldSelect,
  onOpenSettings,
}) => {
  const insets = useSafeAreaInsets();
  const fontFamily = pixelFontLoaded ? 'PressStart2P_400Regular' : undefined;

  const isSmw = partition === 'smw';
  const unlockedIdx = isSmw ? progress.smwUnlockedLevel : progress.unlockedLevel;
  const clearedCount = isSmw ? progress.smwClearedLevels.length : progress.clearedLevels.length;
  const highScore = isSmw ? progress.smwHighScore : progress.highScore;
  const totalCount = isSmw ? 20 : 24;
  const hasSavedStage = unlockedIdx > 0;

  return (
    <View
      style={[
        styles.overlay,
        {
          paddingLeft: Math.max(insets.left, 20),
          paddingRight: Math.max(insets.right, 20),
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: Math.max(insets.top, 8),
        },
      ]}
    >
      {/* Dual-Cartridge Partition Switcher */}
      <View style={styles.partitionBar}>
        <Pressable
          onPress={() => onSelectPartition('classic')}
          style={[
            styles.partitionTab,
            !isSmw && styles.partitionTabClassicActive,
          ]}
        >
          <Text
            style={[
              styles.partitionTabText,
              { fontFamily },
              !isSmw && styles.partitionTabTextActive,
            ]}
          >
            🍄 PLOMERO BROS (24)
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onSelectPartition('smw')}
          style={[
            styles.partitionTab,
            isSmw && styles.partitionTabSmwActive,
          ]}
        >
          <Text
            style={[
              styles.partitionTabText,
              { fontFamily },
              isSmw && styles.partitionTabTextActive,
            ]}
          >
            🦕 PLOMERO WORLD (20)
          </Text>
        </Pressable>
      </View>

      {/* Cartridge Signboard Logo */}
      <View style={[styles.signBoard, isSmw && styles.signBoardSmw]}>
        <View style={styles.rivetRow}>
          <View style={styles.rivet} />
          <Text style={[styles.editionTag, { fontFamily }]}>
            {isSmw ? '16-BIT ISLA DINOSAURIO • YOSHI & CAPA' : '16-BIT CONSOLE EDITION • CLÁSICO'}
          </Text>
          <View style={styles.rivet} />
        </View>

        <Text style={[styles.logoSuper, { fontFamily }]}>SUPER PLOMERO</Text>
        <Text style={[styles.logoBros, { fontFamily }, isSmw && { color: '#bbf7d0' }]}>
          {isSmw ? 'WORLD • 20 NIVELES' : 'BROS. DELUXE'}
        </Text>

        <View style={styles.rivetRowBottom}>
          <View style={styles.rivet} />
          <Text style={[styles.recordText, { fontFamily }]}>
            RÉCORD {String(highScore).padStart(6, '0')}  •  ★ {clearedCount}/{totalCount}
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
              CONTINUAR {getWorldLabel(unlockedIdx, partition)}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={onStartAdventure}
          style={({ pressed }) => [styles.btnPrimaryGold, pressed && styles.btnPressed]}
        >
          <Text style={[styles.btnDarkText, { fontFamily }]}>
            {hasSavedStage ? 'NUEVA PARTIDA' : isSmw ? '▶ JUGAR Y-1' : '▶ JUGAR 1-1'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onOpenWorldSelect}
          style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed]}
        >
          <Text style={[styles.btnLightText, { fontFamily }]}>
            {isSmw ? '5 MUNDOS' : '6 MUNDOS'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onOpenSettings}
          style={({ pressed }) => [styles.btnIcon, pressed && styles.btnPressed]}
        >
          <Text style={[styles.btnLightText, { fontFamily }]}>⚙</Text>
        </Pressable>
      </View>

      <Text style={styles.hintFooter}>
        {isSmw
          ? 'Yoshi: pulsa Y para Lengua/Fuego  •  Capa: corre con B hasta llenar [P] y salta con A para volar'
          : 'Desliza el pulgar en la cruceta  •  Mantén B para correr y rueda el pulgar hacia A para gran salto'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 10, 22, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  partitionBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    borderColor: '#475569',
    marginBottom: 10,
    gap: 6,
  },
  partitionTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  partitionTabClassicActive: {
    backgroundColor: '#dc2626',
  },
  partitionTabSmwActive: {
    backgroundColor: '#16a34a',
  },
  partitionTabText: {
    color: '#94a3b8',
    fontSize: 8.5,
    fontWeight: '900',
  },
  partitionTabTextActive: {
    color: '#ffffff',
  },
  signBoard: {
    backgroundColor: '#9a3412',
    borderWidth: 4,
    borderColor: '#fed7aa',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 11,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 6 },
    maxWidth: 560,
  },
  signBoardSmw: {
    backgroundColor: '#065f46',
    borderColor: '#fde047',
  },
  rivetRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  rivetRowBottom: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
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
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginHorizontal: 8,
  },
  logoSuper: {
    color: '#fef08a',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: '#141013',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  logoBros: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
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
    marginTop: 14,
  },
  btnPrimaryGold: {
    backgroundColor: '#facc15',
    borderWidth: 3,
    borderColor: '#fef9c3',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
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
    paddingHorizontal: 15,
    paddingVertical: 11,
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
    paddingHorizontal: 14,
    paddingVertical: 11,
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
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  btnPressed: {
    transform: [{ translateY: 3 }],
  },
  btnDarkText: {
    color: '#422006',
    fontSize: 9.5,
    fontWeight: '900',
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '900',
  },
  btnLightText: {
    color: '#f8fafc',
    fontSize: 9.5,
    fontWeight: '900',
  },
  hintFooter: {
    marginTop: 11,
    color: '#e2e8f0',
    fontSize: 10.5,
    fontWeight: '700',
    backgroundColor: 'rgba(9, 13, 22, 0.76)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
