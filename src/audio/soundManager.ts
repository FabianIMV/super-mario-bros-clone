import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import type { BgmTrackId, SfxId } from '../engine/types';
import { synthesizeBgmWav, synthesizeSfxWav } from './wavSynth';

const ALL_SFX: SfxId[] = [
  'jump',
  'jump_big',
  'spin_jump',
  'skid',
  'coin',
  'dragon_coin',
  'bump',
  'break_block',
  'stomp',
  'kick',
  'powerup_spawn',
  'powerup_collect',
  'feather_get',
  'cape_spin',
  'yoshi_mount',
  'yoshi_tongue',
  'yoshi_swallow',
  'yoshi_spit',
  'one_up',
  'fireball',
  'power_down',
  'checkpoint',
  'spring',
  'boss_hit',
  'boss_roar',
  'bridge_collapse',
  'stage_clear',
  'die',
  'gameover',
  'wind_gust',
  'icicle_crack',
  'crumble',
  'key_get',
  'vault_open',
  'treasure',
  'portal',
  'wrench_throw',
  'wrench_catch',
  'wall_jump',
  'slide',
  'gem',
  'clock',
  'chase_growl',
  'lava_rise',
  'goal_locked',
];

const ALL_BGM: BgmTrackId[] = [
  'overworld',
  'underground',
  'athletic',
  'fortress',
  'starman',
  'smw_overworld',
  'smw_athletic',
  'exp_overworld',
  'exp_cave',
  'dim_theme',
];

// Rapid-fire sound effects use a small round-robin player pool to prevent cutoffs
const POOL_SIZES: Partial<Record<SfxId, number>> = {
  coin: 3,
  dragon_coin: 2,
  jump: 2,
  jump_big: 2,
  spin_jump: 2,
  cape_spin: 2,
  yoshi_tongue: 2,
  stomp: 2,
  bump: 2,
  break_block: 2,
  fireball: 2,
  kick: 2,
  wrench_throw: 2,
  wrench_catch: 2,
  wall_jump: 2,
  gem: 2,
  clock: 2,
};

class RetroSoundManager {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private sfxPools = new Map<SfxId, { players: AudioPlayer[]; cursor: number }>();
  private bgmPlayers = new Map<BgmTrackId, AudioPlayer>();
  private currentBgm: BgmTrackId | null = null;
  private soundEnabled = true;
  private musicEnabled = true;
  private paused = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'mixWithOthers',
        });

        const cacheDir = new Directory(Paths.cache, 'super_plomero_audio_v3');
        if (!cacheDir.exists) {
          cacheDir.create({ idempotent: true });
        }

        for (const id of ALL_SFX) {
          const wavFile = new File(cacheDir, `sfx_${id}.wav`);
          if (!wavFile.exists) {
            wavFile.create({ overwrite: true });
            wavFile.write(synthesizeSfxWav(id));
          }
          const poolCount = POOL_SIZES[id] ?? 1;
          const players: AudioPlayer[] = [];
          for (let i = 0; i < poolCount; i++) {
            const p = createAudioPlayer(
              { uri: wavFile.uri },
              { keepAudioSessionActive: true, updateInterval: 1000 }
            );
            p.volume = 0.72;
            players.push(p);
          }
          this.sfxPools.set(id, { players, cursor: 0 });
        }

        for (const track of ALL_BGM) {
          const bgmFile = new File(cacheDir, `bgm_${track}.wav`);
          if (!bgmFile.exists) {
            bgmFile.create({ overwrite: true });
            bgmFile.write(synthesizeBgmWav(track));
          }
          const p = createAudioPlayer(
            { uri: bgmFile.uri },
            { keepAudioSessionActive: true, updateInterval: 1000 }
          );
          p.loop = true;
          p.volume = 0.42;
          this.bgmPlayers.set(track, p);
        }

        this.initialized = true;
      } catch {
        // Gracefully ignore audio init errors on unsupported simulators/environments
      }
    })();

    return this.initPromise;
  }

  setPreferences(soundEnabled: boolean, musicEnabled: boolean): void {
    this.soundEnabled = soundEnabled;
    this.musicEnabled = musicEnabled;
    if (!musicEnabled) {
      this.stopAllBgmPlayers();
    } else if (this.currentBgm && !this.paused) {
      this.playBgm(this.currentBgm);
    }
  }

  playSfx(id: SfxId): void {
    if (!this.soundEnabled || !this.initialized) return;
    const pool = this.sfxPools.get(id);
    if (!pool || pool.players.length === 0) return;

    const player = pool.players[pool.cursor];
    pool.cursor = (pool.cursor + 1) % pool.players.length;

    try {
      void player.seekTo(0).then(() => {
        player.play();
      });
    } catch {
      // Ignore transient playback race
    }
  }

  playBgm(track: BgmTrackId | null): void {
    this.currentBgm = track;
    this.stopAllBgmPlayers();
    if (!track || !this.musicEnabled || !this.initialized || this.paused) return;

    const player = this.bgmPlayers.get(track);
    if (!player) return;
    try {
      void player.seekTo(0).then(() => {
        player.loop = true;
        player.play();
      });
    } catch {
      // Ignore transient playback race
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.initialized || !this.currentBgm) return;
    const player = this.bgmPlayers.get(this.currentBgm);
    if (!player) return;
    try {
      if (paused) {
        player.pause();
      } else if (this.musicEnabled) {
        player.play();
      }
    } catch {
      // Ignore
    }
  }

  private stopAllBgmPlayers(): void {
    for (const p of this.bgmPlayers.values()) {
      try {
        if (p.playing) p.pause();
      } catch {
        // Ignore
      }
    }
  }
}

export const soundManager = new RetroSoundManager();
