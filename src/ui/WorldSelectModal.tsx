import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BIOMES,
  DIM_WORLDS,
  DIM_WORLD_NAMES,
  ECHO_WORLDS,
  ECHO_WORLD_NAMES,
  EXP_WORLDS,
  EXP_WORLD_NAMES,
  FORTUNE_WORLDS,
  FORTUNE_WORLD_NAMES,
  FRONTIER_WORLDS,
  FRONTIER_WORLD_NAMES,
  MIRAGE_WORLDS,
  MIRAGE_WORLD_NAMES,
  SMW_WORLDS,
  STAGES_PER_WORLD,
  TOTAL_WORLDS,
  getStageBiome,
  getWorldLabel,
} from '../engine/biomes';
import type { GamePartition, SaveProgress } from '../engine/types';
import { SMW_WORLD_NAMES } from '../levels/smwLevelBuilder';
import { PARTITION_INFO, PARTITION_ORDER, getPartitionProgress } from '../engine/partitions';

interface Props {
  visible: boolean;
  partition: GamePartition;
  progress: SaveProgress;
  pixelFontLoaded: boolean;
  onSelectPartition: (partition: GamePartition) => void;
  onSelectStage: (levelIndex: number, partition: GamePartition) => void;
  onClose: () => void;
}

const CLASSIC_WORLD_NAMES = [
  '1 • REINO PRADERA',
  '2 • DUNAS SOLARES',
  '3 • CUMBRE ESTELAR',
  '4 • GLACIAR BOREAL',
  '5 • CAÑÓN ÍGNEO',
  '6 • IMPERIO KOOPA',
];

export const WorldSelectModal: React.FC<Props> = ({
  visible,
  partition,
  progress,
  pixelFontLoaded,
  onSelectPartition,
  onSelectStage,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [freePlay, setFreePlay] = useState(false);
  const fontFamily = pixelFontLoaded ? 'PressStart2P_400Regular' : undefined;

  if (!visible) return null;

  const isSmw = partition === 'smw';
  const isExp = partition === 'expedition';
  const isFrontier = partition === 'frontier';
  const isFortune = partition === 'fortune';
  const isMirage = partition === 'mirage';
  const isEcho = partition === 'echo';
  const isDim = partition === 'dimension';
  const worldCount = isSmw
    ? SMW_WORLDS
    : isExp
    ? EXP_WORLDS
    : isFrontier
    ? FRONTIER_WORLDS
    : isFortune
    ? FORTUNE_WORLDS
    : isMirage
    ? MIRAGE_WORLDS
    : isEcho
    ? ECHO_WORLDS
    : isDim
    ? DIM_WORLDS
    : TOTAL_WORLDS;
  const worldNames = isSmw
    ? SMW_WORLD_NAMES
    : isExp
    ? EXP_WORLD_NAMES
    : isFrontier
    ? FRONTIER_WORLD_NAMES
    : isFortune
    ? FORTUNE_WORLD_NAMES
    : isMirage
    ? MIRAGE_WORLD_NAMES
    : isEcho
    ? ECHO_WORLD_NAMES
    : isDim
    ? DIM_WORLD_NAMES
    : CLASSIC_WORLD_NAMES;
  const pp = getPartitionProgress(progress, partition);
  const unlockedIdx = pp.unlocked;
  const clearedList = pp.cleared;
  const accent = PARTITION_INFO[partition].accent;

  return (
    <View
      style={[
        styles.backdrop,
        {
          paddingLeft: Math.max(insets.left, 16) + 8,
          paddingRight: Math.max(insets.right, 16) + 8,
          paddingTop: Math.max(insets.top, 8) + 4,
          paddingBottom: Math.max(insets.bottom, 10) + 4,
        },
      ]}
    >
      <View
        style={[
          styles.panel,
          partition !== 'classic' && { borderColor: accent },
          isFrontier && styles.panelFrontier,
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text
              style={[
                styles.title,
                { fontFamily },
                isSmw && { color: '#86efac' },
                isExp && { color: '#c4b5fd' },
                isFrontier && { color: '#bae6fd' },
                isDim && { color: '#a5f3fc' },
              ]}
            >
              {isSmw
                ? 'ISLA DINOSAURIO (20)'
                : isExp
                ? 'EXPEDICIÓN (28)'
                : isFortune
                ? 'FORTUNA (16)'
                : isMirage
                ? 'ESPECTRO (16)'
                : isEcho
                ? 'ECO (16)'
                : isFrontier
                ? 'FRONTERA (8)'
                : isDim
                ? 'DIMENSIÓN 3D (32)'
                : '6 MUNDOS CLÁSICOS (24)'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {PARTITION_ORDER.map((part) => (
              <Pressable
                key={part}
                onPress={() => onSelectPartition(part)}
                style={[
                  styles.partChip,
                  part === partition && { backgroundColor: PARTITION_INFO[part].accent },
                ]}
              >
                <Text style={[styles.chipText, { fontFamily }]}>
                  {part === 'classic'
                    ? '🍄 BROS'
                    : part === 'smw'
                    ? '🦕 WORLD'
                    : part === 'expedition'
                    ? '🧭 EXPED.'
                    : part === 'frontier'
                    ? '🌊 MUNDO 5'
                    : part === 'fortune'
                    ? '🎰 MUNDO 6'
                    : part === 'mirage'
                    ? '👻 MUNDO 7'
                    : part === 'echo'
                    ? '🪞 MUNDO 8'
                    : '🧊 3D'}
                </Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => setFreePlay((v) => !v)}
              style={[
                styles.freePlayChip,
                freePlay && { backgroundColor: '#16a34a', borderColor: '#86efac' },
              ]}
            >
              <Text style={[styles.chipText, { fontFamily }]}>
                {freePlay ? '★ LIBRE ON' : 'LIBRE'}
              </Text>
            </Pressable>

            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeText, { fontFamily }]}>✕</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {Array.from({ length: worldCount }, (_, wIdx) => {
            const worldStart = wIdx * STAGES_PER_WORLD;
            const stageCount = STAGES_PER_WORLD;
            const primaryBiome = BIOMES[getStageBiome(worldStart, partition)];
            return (
              <View
                key={`${partition}_${wIdx}`}
                style={[styles.worldCard, isFrontier && styles.worldCardFrontier]}
              >
                <View style={styles.worldHeaderRow}>
                  <View
                    style={[styles.worldSwatch, { backgroundColor: primaryBiome.groundCap }]}
                  />
                  <Text style={[styles.worldTitle, { fontFamily }]}>
                    {worldNames[wIdx]}
                  </Text>
                </View>

                <View style={styles.stageRow}>
                  {Array.from({ length: stageCount }, (_, sIdx) => {
                    const levelIdx = worldStart + sIdx;
                    const unlocked = freePlay || levelIdx <= unlockedIdx;
                    const cleared = clearedList.includes(levelIdx);
                    const isBoss = sIdx === 3;

                    return (
                      <Pressable
                        key={sIdx}
                        disabled={!unlocked}
                        onPress={() => onSelectStage(levelIdx, partition)}
                        style={({ pressed }) => [
                          styles.stageBtn,
                          isSmw && styles.stageBtnSmw,
                          isFrontier && styles.stageBtnFrontier,
                          isBoss && styles.stageBtnBoss,
                          !unlocked && styles.stageBtnLocked,
                          cleared && styles.stageBtnCleared,
                          pressed && unlocked && { transform: [{ scale: 0.94 }] },
                        ]}
                      >
                        <Text
                          style={[
                            styles.stageBtnLabel,
                            { fontFamily },
                            !unlocked && { color: '#64748b' },
                          ]}
                        >
                          {getWorldLabel(levelIdx, partition)}
                        </Text>
                        <Text style={styles.stageBadge}>
                          {!unlocked ? '🔒' : cleared ? '★' : isBoss ? '👑' : '▶'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 10, 22, 0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  panel: {
    width: '100%',
    maxWidth: 740,
    maxHeight: '96%',
    backgroundColor: '#0f172a',
    borderWidth: 3,
    borderColor: '#facc15',
    borderRadius: 14,
    padding: 12,
  },
  panelFrontier: {
    backgroundColor: '#071a2b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  titleBlock: {
    flexShrink: 1,
  },
  title: {
    color: '#fde047',
    fontSize: 10,
    fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  partChip: {
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#475569',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  partChipClassicActive: {
    backgroundColor: '#b91c1c',
    borderColor: '#fde047',
  },
  partChipSmwActive: {
    backgroundColor: '#15803d',
    borderColor: '#86efac',
  },
  freePlayChip: {
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#64748b',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipText: {
    color: '#f8fafc',
    fontSize: 7,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    borderWidth: 2,
    borderColor: '#fca5a5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  worldCard: {
    width: '49%',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#334155',
    padding: 9,
  },
  worldCardFrontier: {
    backgroundColor: '#0c2a43',
    borderColor: '#155e75',
  },
  worldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  worldSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  worldTitle: {
    color: '#f1f5f9',
    fontSize: 8,
    fontWeight: '900',
  },
  stageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  stageBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#93c5fd',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  stageBtnSmw: {
    backgroundColor: '#0284c7',
    borderColor: '#7dd3fc',
  },
  stageBtnFrontier: {
    backgroundColor: '#075985',
    borderColor: '#7dd3fc',
  },
  stageBtnBoss: {
    backgroundColor: '#991b1b',
    borderColor: '#fca5a5',
  },
  stageBtnCleared: {
    backgroundColor: '#15803d',
    borderColor: '#86efac',
  },
  stageBtnLocked: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
  },
  stageBtnLabel: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
  },
  stageBadge: {
    fontSize: 10,
    marginTop: 2,
    color: '#fde047',
  },
});
