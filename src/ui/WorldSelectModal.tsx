import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BIOMES, STAGES_PER_WORLD, TOTAL_WORLDS, getStageBiome, getWorldLabel } from '../engine/biomes';
import type { SaveProgress } from '../engine/types';

interface Props {
  visible: boolean;
  progress: SaveProgress;
  pixelFontLoaded: boolean;
  onSelectStage: (levelIndex: number) => void;
  onClose: () => void;
}

const WORLD_NAMES = [
  '1 • REINO PRADERA',
  '2 • DUNAS SOLARES',
  '3 • CUMBRE ESTELAR',
  '4 • GLACIAR BOREAL',
  '5 • CAÑÓN ÍGNEO',
  '6 • IMPERIO KOOPA',
];

export const WorldSelectModal: React.FC<Props> = ({
  visible,
  progress,
  pixelFontLoaded,
  onSelectStage,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [freePlay, setFreePlay] = useState(false);
  const fontFamily = pixelFontLoaded ? 'PressStart2P_400Regular' : undefined;

  if (!visible) return null;

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
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontFamily }]}>MAPA DE LOS 6 MUNDOS</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setFreePlay((v) => !v)}
              style={[
                styles.freePlayChip,
                freePlay && { backgroundColor: '#16a34a', borderColor: '#86efac' },
              ]}
            >
              <Text style={[styles.chipText, { fontFamily }]}>
                {freePlay ? '★ LIBRE ON' : 'MODO LIBRE'}
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
          {Array.from({ length: TOTAL_WORLDS }, (_, wIdx) => {
            const primaryBiome = BIOMES[getStageBiome(wIdx * STAGES_PER_WORLD)];
            return (
              <View key={wIdx} style={styles.worldCard}>
                <View style={styles.worldHeaderRow}>
                  <View
                    style={[styles.worldSwatch, { backgroundColor: primaryBiome.groundCap }]}
                  />
                  <Text style={[styles.worldTitle, { fontFamily }]}>
                    {WORLD_NAMES[wIdx]}
                  </Text>
                </View>

                <View style={styles.stageRow}>
                  {Array.from({ length: STAGES_PER_WORLD }, (_, sIdx) => {
                    const levelIdx = wIdx * STAGES_PER_WORLD + sIdx;
                    const unlocked = freePlay || levelIdx <= progress.unlockedLevel;
                    const cleared = progress.clearedLevels.includes(levelIdx);
                    const isBoss = sIdx === 3;

                    return (
                      <Pressable
                        key={sIdx}
                        disabled={!unlocked}
                        onPress={() => onSelectStage(levelIdx)}
                        style={({ pressed }) => [
                          styles.stageBtn,
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
                          {getWorldLabel(levelIdx)}
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
    backgroundColor: 'rgba(6, 10, 22, 0.82)',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    color: '#fde047',
    fontSize: 12,
    fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freePlayChip: {
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#64748b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipText: {
    color: '#f8fafc',
    fontSize: 8,
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
