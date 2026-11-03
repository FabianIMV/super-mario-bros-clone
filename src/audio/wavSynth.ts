import type { BgmTrackId, SfxId } from '../engine/types';

const SAMPLE_RATE = 22050;

type WaveKind = 'pulse25' | 'pulse50' | 'pulse12' | 'triangle' | 'noise';

interface ToneEvent {
  wave: WaveKind;
  startSec: number;
  durSec: number;
  freqStart: number;
  freqEnd?: number;
  gain: number;
  decay?: boolean;
}

function encodePcmWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-0.98, Math.min(0.98, samples[i]));
    view.setInt16(offset, Math.round(clamped * 32767), true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function oscSample(wave: WaveKind, phase: number, noiseSeed: number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'pulse12':
      return p < 0.125 ? 1 : -1;
    case 'pulse25':
      return p < 0.25 ? 1 : -1;
    case 'pulse50':
      return p < 0.5 ? 1 : -1;
    case 'triangle': {
      // Quantized 16-step NES APU triangle wave
      const raw = p < 0.5 ? p * 4 - 1 : 3 - p * 4;
      return Math.round(raw * 8) / 8;
    }
    case 'noise': {
      const x = Math.sin(noiseSeed * 12.9898 + 78.233) * 43758.5453;
      return (x - Math.floor(x)) * 2 - 1;
    }
  }
}

function renderToneEvents(events: ToneEvent[], totalSec: number): Uint8Array {
  const totalSamples = Math.max(64, Math.ceil(totalSec * SAMPLE_RATE));
  const mix = new Float32Array(totalSamples);

  for (const ev of events) {
    const iStart = Math.max(0, Math.floor(ev.startSec * SAMPLE_RATE));
    const iEnd = Math.min(totalSamples, Math.ceil((ev.startSec + ev.durSec) * SAMPLE_RATE));
    const span = Math.max(1, iEnd - iStart);
    let phase = 0;

    for (let i = iStart; i < iEnd; i++) {
      const tNorm = (i - iStart) / span;
      const freq =
        ev.freqEnd != null
          ? ev.freqStart * Math.pow(ev.freqEnd / Math.max(20, ev.freqStart), tNorm)
          : ev.freqStart;

      phase += freq / SAMPLE_RATE;

      // Crisp 3ms attack + smooth decay envelope (eliminates speaker pops!)
      const attack = Math.min(1, (i - iStart) / (0.003 * SAMPLE_RATE));
      const release =
        ev.decay === false
          ? Math.min(1, (iEnd - i) / (0.006 * SAMPLE_RATE))
          : Math.pow(1 - tNorm, 1.35);

      const noiseStep = Math.floor(phase * 8);
      mix[i] += oscSample(ev.wave, phase, noiseStep + iStart * 0.01) * ev.gain * attack * release;
    }
  }

  return encodePcmWav(mix);
}

// MIDI note helper (A4 = 69 = 440Hz)
function midiFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function synthesizeSfxWav(id: SfxId): Uint8Array {
  switch (id) {

    // ---------------------------------------------------------------------
    // Efectos de mecánicas, objetivos, secretos y habilidades (originales)
    // ---------------------------------------------------------------------
    case 'wind_gust':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.55, freqStart: 300, freqEnd: 1500, gain: 0.16 },
          { wave: 'noise', startSec: 0.3, durSec: 0.5, freqStart: 1500, freqEnd: 400, gain: 0.12 },
          { wave: 'triangle', startSec: 0, durSec: 0.7, freqStart: 180, freqEnd: 260, gain: 0.1 },
        ],
        0.82
      );
    case 'icicle_crack':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.05, freqStart: 3000, gain: 0.2 },
          { wave: 'pulse12', startSec: 0.02, durSec: 0.12, freqStart: 1900, freqEnd: 2600, gain: 0.16 },
          { wave: 'pulse12', startSec: 0.1, durSec: 0.1, freqStart: 2300, freqEnd: 1700, gain: 0.12 },
        ],
        0.22
      );
    case 'crumble':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.32, freqStart: 420, freqEnd: 110, gain: 0.26 },
          { wave: 'triangle', startSec: 0, durSec: 0.3, freqStart: 140, freqEnd: 55, gain: 0.22 },
        ],
        0.34
      );
    case 'key_get':
      return renderToneEvents(
        [
          { wave: 'pulse25', startSec: 0, durSec: 0.07, freqStart: midiFreq(81), gain: 0.22 },
          { wave: 'pulse25', startSec: 0.06, durSec: 0.07, freqStart: midiFreq(86), gain: 0.22 },
          { wave: 'pulse25', startSec: 0.12, durSec: 0.16, freqStart: midiFreq(90), gain: 0.22 },
          { wave: 'pulse12', startSec: 0.12, durSec: 0.2, freqStart: midiFreq(98), gain: 0.1 },
        ],
        0.34
      );
    case 'vault_open':
      return renderToneEvents(
        [
          { wave: 'triangle', startSec: 0, durSec: 0.26, freqStart: 98, freqEnd: 196, gain: 0.3 },
          { wave: 'noise', startSec: 0, durSec: 0.1, freqStart: 800, gain: 0.12 },
          { wave: 'pulse50', startSec: 0.22, durSec: 0.32, freqStart: midiFreq(62), gain: 0.14 },
          { wave: 'pulse25', startSec: 0.22, durSec: 0.32, freqStart: midiFreq(66), gain: 0.14 },
          { wave: 'pulse25', startSec: 0.22, durSec: 0.32, freqStart: midiFreq(69), gain: 0.14 },
        ],
        0.56
      );
    case 'treasure': {
      const notes = [74, 78, 81, 86, 90];
      return renderToneEvents(
        [
          ...notes.map((n, i) => ({
            wave: 'pulse25' as WaveKind,
            startSec: i * 0.07,
            durSec: i === notes.length - 1 ? 0.3 : 0.08,
            freqStart: midiFreq(n),
            gain: 0.2,
          })),
          { wave: 'triangle', startSec: 0, durSec: 0.6, freqStart: midiFreq(50), gain: 0.22, decay: false },
        ],
        0.65
      );
    }
    case 'portal':
      return renderToneEvents(
        [
          { wave: 'pulse12', startSec: 0, durSec: 0.7, freqStart: 180, freqEnd: 1700, gain: 0.16 },
          { wave: 'triangle', startSec: 0, durSec: 0.7, freqStart: 90, freqEnd: 720, gain: 0.2 },
          { wave: 'pulse25', startSec: 0.5, durSec: 0.3, freqStart: midiFreq(93), freqEnd: midiFreq(81), gain: 0.12 },
        ],
        0.85
      );
    case 'wrench_throw':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.12, freqStart: 1800, freqEnd: 600, gain: 0.14 },
          { wave: 'pulse12', startSec: 0, durSec: 0.1, freqStart: 520, freqEnd: 880, gain: 0.14 },
        ],
        0.14
      );
    case 'wrench_catch':
      return renderToneEvents(
        [
          { wave: 'pulse25', startSec: 0, durSec: 0.05, freqStart: 1046, gain: 0.18 },
          { wave: 'pulse12', startSec: 0.04, durSec: 0.08, freqStart: 1568, gain: 0.14 },
        ],
        0.13
      );
    case 'wall_jump':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.03, freqStart: 2200, gain: 0.16 },
          { wave: 'pulse25', startSec: 0.01, durSec: 0.13, freqStart: 340, freqEnd: 980, gain: 0.3 },
        ],
        0.15
      );
    case 'slide':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.28, freqStart: 1100, freqEnd: 260, gain: 0.16 },
          { wave: 'triangle', startSec: 0, durSec: 0.2, freqStart: 220, freqEnd: 130, gain: 0.12 },
        ],
        0.3
      );
    case 'gem':
      return renderToneEvents(
        [
          { wave: 'pulse25', startSec: 0, durSec: 0.06, freqStart: midiFreq(88), gain: 0.2 },
          { wave: 'pulse25', startSec: 0.05, durSec: 0.06, freqStart: midiFreq(93), gain: 0.2 },
          { wave: 'pulse25', startSec: 0.1, durSec: 0.22, freqStart: midiFreq(96), gain: 0.2 },
          { wave: 'triangle', startSec: 0.1, durSec: 0.22, freqStart: midiFreq(72), gain: 0.18 },
        ],
        0.34
      );
    case 'clock':
      return renderToneEvents(
        [
          { wave: 'pulse12', startSec: 0, durSec: 0.03, freqStart: 1250, gain: 0.2 },
          { wave: 'pulse12', startSec: 0.11, durSec: 0.03, freqStart: 940, gain: 0.2 },
          { wave: 'pulse25', startSec: 0.2, durSec: 0.22, freqStart: midiFreq(91), gain: 0.16 },
        ],
        0.44
      );
    case 'chase_growl':
      return renderToneEvents(
        [
          { wave: 'pulse50', startSec: 0, durSec: 0.6, freqStart: 78, freqEnd: 52, gain: 0.22 },
          { wave: 'pulse25', startSec: 0, durSec: 0.6, freqStart: 82, freqEnd: 55, gain: 0.14 },
          { wave: 'noise', startSec: 0.05, durSec: 0.45, freqStart: 260, gain: 0.1 },
        ],
        0.66
      );
    case 'lava_rise':
      return renderToneEvents(
        [
          { wave: 'triangle', startSec: 0, durSec: 0.7, freqStart: 55, freqEnd: 150, gain: 0.3 },
          { wave: 'noise', startSec: 0.1, durSec: 0.08, freqStart: 500, gain: 0.12 },
          { wave: 'noise', startSec: 0.3, durSec: 0.08, freqStart: 650, gain: 0.12 },
          { wave: 'noise', startSec: 0.5, durSec: 0.08, freqStart: 800, gain: 0.12 },
        ],
        0.74
      );
    case 'goal_locked':
      return renderToneEvents(
        [
          { wave: 'pulse50', startSec: 0, durSec: 0.12, freqStart: 220, gain: 0.2 },
          { wave: 'pulse50', startSec: 0.14, durSec: 0.18, freqStart: 175, gain: 0.2 },
        ],
        0.34
      );
    case 'jump':
      return renderToneEvents(
        [{ wave: 'pulse25', startSec: 0, durSec: 0.17, freqStart: 220, freqEnd: 640, gain: 0.36 }],
        0.18
      );
    case 'jump_big':
      return renderToneEvents(
        [{ wave: 'pulse50', startSec: 0, durSec: 0.2, freqStart: 165, freqEnd: 520, gain: 0.36 }],
        0.21
      );
    case 'spin_jump':
      return renderToneEvents(
        [
          { wave: 'pulse25', startSec: 0, durSec: 0.08, freqStart: 320, freqEnd: 780, gain: 0.34 },
          { wave: 'pulse50', startSec: 0.08, durSec: 0.1, freqStart: 420, freqEnd: 980, gain: 0.32 },
        ],
        0.19
      );
    case 'dragon_coin':
      return renderToneEvents(
        [
          { wave: 'pulse50', startSec: 0, durSec: 0.07, freqStart: 1046.5, gain: 0.35, decay: false },
          { wave: 'pulse50', startSec: 0.07, durSec: 0.07, freqStart: 1318.5, gain: 0.35, decay: false },
          { wave: 'pulse25', startSec: 0.14, durSec: 0.28, freqStart: 1567.98, gain: 0.36 },
        ],
        0.43
      );
    case 'feather_get': {
      const notes = [65, 69, 72, 77, 81, 84];
      return renderToneEvents(
        notes.map((m, idx) => ({
          wave: 'pulse50' as const,
          startSec: idx * 0.048,
          durSec: 0.08,
          freqStart: midiFreq(m),
          gain: 0.34,
        })),
        0.38
      );
    }
    case 'cape_spin':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.12, freqStart: 1100, freqEnd: 380, gain: 0.28 },
          { wave: 'pulse25', startSec: 0, durSec: 0.11, freqStart: 540, freqEnd: 260, gain: 0.24 },
        ],
        0.13
      );
    case 'yoshi_mount':
      return renderToneEvents(
        [
          { wave: 'triangle', startSec: 0, durSec: 0.09, freqStart: 380, freqEnd: 590, gain: 0.45 },
          { wave: 'pulse50', startSec: 0.09, durSec: 0.16, freqStart: 620, freqEnd: 980, gain: 0.36 },
        ],
        0.26
      );
    case 'yoshi_tongue':
      return renderToneEvents(
        [
          { wave: 'pulse50', startSec: 0, durSec: 0.08, freqStart: 280, freqEnd: 740, gain: 0.34 },
          { wave: 'triangle', startSec: 0.06, durSec: 0.09, freqStart: 740, freqEnd: 460, gain: 0.36 },
        ],
        0.16
      );
    case 'yoshi_swallow':
      return renderToneEvents(
        [
          { wave: 'triangle', startSec: 0, durSec: 0.09, freqStart: 310, freqEnd: 140, gain: 0.45 },
          { wave: 'pulse50', startSec: 0.08, durSec: 0.1, freqStart: 220, freqEnd: 480, gain: 0.32 },
        ],
        0.19
      );
    case 'yoshi_spit':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.16, freqStart: 680, freqEnd: 210, gain: 0.38 },
          { wave: 'pulse12', startSec: 0, durSec: 0.15, freqStart: 620, freqEnd: 180, gain: 0.32 },
        ],
        0.17
      );
    case 'skid':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.07, freqStart: 950, freqEnd: 420, gain: 0.2 },
          { wave: 'pulse12', startSec: 0, durSec: 0.06, freqStart: 780, freqEnd: 520, gain: 0.14 },
        ],
        0.08
      );
    case 'coin':
      return renderToneEvents(
        [
          { wave: 'pulse25', startSec: 0, durSec: 0.075, freqStart: 987.77, gain: 0.34, decay: false },
          { wave: 'pulse25', startSec: 0.075, durSec: 0.28, freqStart: 1318.51, gain: 0.34 },
        ],
        0.36
      );
    case 'bump':
      return renderToneEvents(
        [{ wave: 'triangle', startSec: 0, durSec: 0.09, freqStart: 160, freqEnd: 65, gain: 0.48 }],
        0.1
      );
    case 'break_block':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.16, freqStart: 520, freqEnd: 130, gain: 0.42 },
          { wave: 'pulse25', startSec: 0, durSec: 0.1, freqStart: 240, freqEnd: 85, gain: 0.28 },
        ],
        0.17
      );
    case 'stomp':
      return renderToneEvents(
        [
          { wave: 'triangle', startSec: 0, durSec: 0.1, freqStart: 190, freqEnd: 480, gain: 0.44 },
          { wave: 'noise', startSec: 0, durSec: 0.04, freqStart: 700, gain: 0.22 },
        ],
        0.11
      );
    case 'kick':
      return renderToneEvents(
        [
          { wave: 'pulse25', startSec: 0, durSec: 0.06, freqStart: 260, freqEnd: 680, gain: 0.36 },
          { wave: 'pulse50', startSec: 0.05, durSec: 0.07, freqStart: 540, freqEnd: 880, gain: 0.3 },
        ],
        0.13
      );
    case 'powerup_spawn': {
      const notes = [60, 64, 67, 72, 62, 66, 69, 74];
      return renderToneEvents(
        notes.map((m, idx) => ({
          wave: 'pulse25' as const,
          startSec: idx * 0.042,
          durSec: 0.045,
          freqStart: midiFreq(m),
          gain: 0.3,
          decay: false,
        })),
        0.36
      );
    }
    case 'powerup_collect': {
      const notes = [60, 64, 67, 72, 64, 67, 72, 76, 79, 84];
      return renderToneEvents(
        notes.map((m, idx) => ({
          wave: 'pulse25' as const,
          startSec: idx * 0.046,
          durSec: 0.06,
          freqStart: midiFreq(m),
          gain: 0.34,
        })),
        0.5
      );
    }
    case 'one_up': {
      const notes = [64, 67, 76, 72, 74, 79];
      return renderToneEvents(
        notes.map((m, idx) => ({
          wave: 'pulse50' as const,
          startSec: idx * 0.075,
          durSec: 0.095,
          freqStart: midiFreq(m),
          gain: 0.36,
        })),
        0.58
      );
    }
    case 'fireball':
      return renderToneEvents(
        [{ wave: 'pulse12', startSec: 0, durSec: 0.085, freqStart: 760, freqEnd: 210, gain: 0.3 }],
        0.095
      );
    case 'power_down': {
      const notes = [74, 71, 67, 64, 60, 55];
      return renderToneEvents(
        notes.map((m, idx) => ({
          wave: 'pulse12' as const,
          startSec: idx * 0.055,
          durSec: 0.065,
          freqStart: midiFreq(m),
          gain: 0.32,
        })),
        0.38
      );
    }
    case 'checkpoint': {
      const notes = [67, 72, 76, 79];
      return renderToneEvents(
        notes.map((m, idx) => ({
          wave: 'pulse25' as const,
          startSec: idx * 0.065,
          durSec: idx === 3 ? 0.24 : 0.08,
          freqStart: midiFreq(m),
          gain: 0.34,
        })),
        0.46
      );
    }
    case 'spring':
      return renderToneEvents(
        [{ wave: 'pulse50', startSec: 0, durSec: 0.24, freqStart: 150, freqEnd: 880, gain: 0.36 }],
        0.25
      );
    case 'boss_hit':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.09, freqStart: 360, gain: 0.36 },
          { wave: 'pulse12', startSec: 0, durSec: 0.1, freqStart: 320, freqEnd: 110, gain: 0.32 },
        ],
        0.11
      );
    case 'boss_roar':
      return renderToneEvents(
        [
          { wave: 'noise', startSec: 0, durSec: 0.28, freqStart: 220, freqEnd: 95, gain: 0.38 },
          { wave: 'pulse12', startSec: 0, durSec: 0.28, freqStart: 130, freqEnd: 68, gain: 0.3 },
        ],
        0.3
      );
    case 'bridge_collapse':
      return renderToneEvents(
        [0, 1, 2, 3, 4].map((i) => ({
          wave: 'noise' as const,
          startSec: i * 0.09,
          durSec: 0.085,
          freqStart: 420 - i * 55,
          gain: 0.38,
        })),
        0.48
      );
    case 'stage_clear': {
      const melody: Array<[number, number, number]> = [
        [60, 0.0, 0.11],
        [64, 0.11, 0.11],
        [67, 0.22, 0.11],
        [72, 0.33, 0.22],
        [67, 0.55, 0.11],
        [72, 0.66, 0.45],
      ];
      return renderToneEvents(
        melody.map(([m, s, d]) => ({
          wave: 'pulse25' as const,
          startSec: s,
          durSec: d,
          freqStart: midiFreq(m),
          gain: 0.36,
        })),
        1.15
      );
    }
    case 'die': {
      // Original: caída cromática que se desinfla
      const melody: Array<[number, number, number]> = [
        [76, 0.0, 0.12],
        [75, 0.13, 0.12],
        [74, 0.26, 0.12],
        [70, 0.42, 0.18],
        [69, 0.62, 0.14],
        [64, 0.8, 0.4],
      ];
      return renderToneEvents(
        melody.map(([m, s, d]) => ({
          wave: 'pulse25' as const,
          startSec: s,
          durSec: d,
          freqStart: midiFreq(m),
          gain: 0.35,
        })),
        1.15
      );
    }
    case 'gameover': {
      const melody: Array<[number, number, number]> = [
        [67, 0.0, 0.18],
        [64, 0.2, 0.18],
        [60, 0.4, 0.22],
        [59, 0.64, 0.22],
        [57, 0.88, 0.22],
        [55, 1.12, 0.45],
      ];
      return renderToneEvents(
        melody.map(([m, s, d]) => ({
          wave: 'triangle' as const,
          startSec: s,
          durSec: d,
          freqStart: midiFreq(m),
          gain: 0.44,
        })),
        1.6
      );
    }
  }
}

// ============================================================================
// LOOPING CHIPTUNE BGM TRACKS (todas composiciones propias)
// ============================================================================
export function synthesizeBgmWav(track: BgmTrackId): Uint8Array {
  const events: ToneEvent[] = [];

  // -------------------------------------------------------------------------
  // Modo Expedición: dos pistas originales
  // -------------------------------------------------------------------------
  if (track === 'exp_overworld') {
    // Re lidio, sincopado y luminoso (64 pasos ≈ 7,7 s en bucle)
    const step = 0.12;
    const lead = [
      74, 0, 76, 78, 0, 81, 0, 78, 80, 0, 81, 0, 0, 0, 76, 0,
      74, 0, 71, 0, 73, 74, 0, 76, 0, 0, 0, 0, 69, 0, 71, 73,
      74, 0, 76, 78, 0, 83, 0, 81, 80, 0, 78, 0, 76, 0, 78, 0,
      81, 0, 0, 80, 78, 0, 76, 0, 74, 0, 0, 0, 0, 0, 0, 0,
    ];
    const bass = [50, 57, 62, 57, 52, 59, 64, 59, 47, 54, 59, 54, 45, 52, 57, 52];
    for (let i = 0; i < lead.length; i++) {
      if (lead[i] > 0) {
        events.push({ wave: 'pulse25', startSec: i * step, durSec: step * 0.9, freqStart: midiFreq(lead[i]), gain: 0.16 });
        events.push({ wave: 'pulse12', startSec: i * step + step * 0.5, durSec: step * 0.6, freqStart: midiFreq(lead[i] + 12), gain: 0.04 });
      }
      if (i % 2 === 0) {
        events.push({ wave: 'triangle', startSec: i * step, durSec: step * 1.8, freqStart: midiFreq(bass[(i >> 1) % bass.length]), gain: 0.25, decay: false });
      }
      if (i % 4 === 0) events.push({ wave: 'noise', startSec: i * step, durSec: 0.04, freqStart: 900, gain: 0.06 });
      if (i % 4 === 2) events.push({ wave: 'noise', startSec: i * step, durSec: 0.02, freqStart: 2400, gain: 0.04 });
    }
    return renderToneEvents(events, lead.length * step);
  }

  if (track === 'exp_cave') {
    // La menor misterioso con arpegios que caen (48 pasos ≈ 7,7 s en bucle)
    const step = 0.16;
    const arp = [
      69, 72, 76, 81, 76, 72, 67, 71, 74, 79, 74, 71,
      65, 69, 72, 77, 72, 69, 64, 68, 71, 76, 71, 68,
      69, 72, 76, 81, 84, 81, 67, 71, 74, 79, 83, 79,
      65, 69, 72, 77, 81, 77, 64, 68, 71, 76, 0, 0,
    ];
    const roots = [45, 43, 41, 40];
    for (let i = 0; i < arp.length; i++) {
      if (arp[i] > 0) {
        events.push({ wave: 'pulse12', startSec: i * step, durSec: step * 0.85, freqStart: midiFreq(arp[i]), gain: 0.12 });
        events.push({ wave: 'pulse12', startSec: i * step + step * 0.5, durSec: step * 0.5, freqStart: midiFreq(arp[i]), gain: 0.04 });
      }
      if (i % 6 === 0) {
        events.push({ wave: 'triangle', startSec: i * step, durSec: step * 5.6, freqStart: midiFreq(roots[(i / 6) % roots.length]), gain: 0.27, decay: false });
      }
      if (i % 12 === 9) events.push({ wave: 'noise', startSec: i * step, durSec: 0.06, freqStart: 300, gain: 0.05 });
    }
    return renderToneEvents(events, arp.length * step);
  }

  if (track === 'overworld') {
    // Original: sol mayor saltarín con respuesta en la segunda frase (64 pasos ≈ 8,3 s)
    const step = 0.13;
    const lead = [
      67, 0, 71, 74, 0, 72, 71, 0, 69, 0, 67, 0, 64, 0, 66, 67,
      0, 0, 69, 71, 72, 0, 74, 0, 71, 0, 69, 0, 0, 0, 0, 0,
      67, 0, 71, 74, 0, 79, 78, 0, 76, 0, 74, 0, 71, 0, 72, 74,
      76, 0, 74, 72, 71, 0, 69, 0, 67, 0, 0, 0, 0, 0, 0, 0,
    ];
    const bass = [
      43, 0, 50, 0, 47, 0, 50, 0, 48, 0, 55, 0, 52, 0, 55, 0,
      50, 0, 57, 0, 54, 0, 57, 0, 43, 0, 50, 0, 47, 0, 50, 0,
      43, 0, 50, 0, 47, 0, 50, 0, 48, 0, 55, 0, 52, 0, 55, 0,
      50, 0, 57, 0, 54, 0, 50, 0, 43, 0, 47, 0, 50, 0, 43, 0,
    ];
    for (let i = 0; i < lead.length; i++) {
      if (lead[i] > 0) {
        events.push({
          wave: 'pulse25',
          startSec: i * step,
          durSec: step * 0.88,
          freqStart: midiFreq(lead[i]),
          gain: 0.17,
        });
      }
      if (bass[i] > 0) {
        events.push({
          wave: 'triangle',
          startSec: i * step,
          durSec: step * 1.6,
          freqStart: midiFreq(bass[i]),
          gain: 0.25,
          decay: false,
        });
      }
      if (i % 4 === 2) {
        events.push({
          wave: 'noise',
          startSec: i * step,
          durSec: 0.035,
          freqStart: 1200,
          gain: 0.07,
        });
      }
    }
    return renderToneEvents(events, lead.length * step);
  }

  if (track === 'underground') {
    const step = 0.14;
    // Original: mi menor sincopado, eco de cueva (32 pasos)
    const motif = [
      64, 0, 67, 0, 71, 70, 0, 67, 0, 64, 0, 62, 64, 0, 0, 0,
      59, 0, 62, 0, 66, 65, 0, 62, 0, 59, 0, 57, 59, 0, 0, 0,
    ];
    for (let i = 0; i < motif.length; i++) {
      if (motif[i] > 0) {
        events.push({
          wave: 'triangle',
          startSec: i * step,
          durSec: step * 0.85,
          freqStart: midiFreq(motif[i] - 12),
          gain: 0.3,
        });
        events.push({
          wave: 'pulse50',
          startSec: i * step,
          durSec: step * 0.72,
          freqStart: midiFreq(motif[i]),
          gain: 0.13,
        });
      }
      if (i % 8 === 4) {
        events.push({
          wave: 'noise',
          startSec: i * step,
          durSec: 0.04,
          freqStart: 850,
          gain: 0.06,
        });
      }
    }
    return renderToneEvents(events, motif.length * step);
  }

  if (track === 'athletic') {
    const step = 0.125;
    const lead = [
      74, 0, 78, 0, 81, 0, 86, 85, 81, 0, 78, 0, 74, 0, 0, 0,
      76, 0, 79, 0, 83, 0, 88, 86, 85, 0, 81, 0, 79, 0, 76, 0,
      74, 0, 78, 0, 81, 0, 86, 0, 88, 0, 86, 0, 85, 0, 81, 0,
      79, 78, 76, 0, 74, 0, 81, 0, 74, 0, 0, 0, 0, 0, 0, 0,
    ];
    const bass = [
      50, 57, 54, 57, 50, 57, 54, 57, 52, 59, 55, 59, 45, 52, 49, 52,
    ];
    for (let i = 0; i < lead.length; i++) {
      if (lead[i] > 0) {
        events.push({
          wave: 'pulse25',
          startSec: i * step,
          durSec: step * 0.86,
          freqStart: midiFreq(lead[i]),
          gain: 0.16,
        });
      }
      if (i % 2 === 0) {
        const bNote = bass[(i >> 1) % bass.length];
        events.push({
          wave: 'triangle',
          startSec: i * step,
          durSec: step * 1.7,
          freqStart: midiFreq(bNote),
          gain: 0.25,
          decay: false,
        });
      }
      if (i % 4 === 2) {
        events.push({
          wave: 'noise',
          startSec: i * step,
          durSec: 0.03,
          freqStart: 1400,
          gain: 0.07,
        });
      }
    }
    return renderToneEvents(events, lead.length * step);
  }

  if (track === 'fortress') {
    const step = 0.11; // Tense fast castle ostinato
    const arp = [
      62, 65, 68, 65, 62, 65, 69, 65, 62, 65, 70, 65, 62, 65, 69, 65,
      61, 64, 67, 64, 61, 64, 69, 64, 62, 65, 68, 65, 61, 64, 67, 64,
    ];
    const bass = [38, 38, 41, 44, 37, 37, 40, 45];
    for (let i = 0; i < arp.length; i++) {
      events.push({
        wave: 'pulse12',
        startSec: i * step,
        durSec: step * 0.85,
        freqStart: midiFreq(arp[i]),
        gain: 0.15,
      });
      if (i % 4 === 0) {
        events.push({
          wave: 'triangle',
          startSec: i * step,
          durSec: step * 3.6,
          freqStart: midiFreq(bass[(i >> 2) % bass.length]),
          gain: 0.28,
          decay: false,
        });
        events.push({
          wave: 'noise',
          startSec: i * step,
          durSec: 0.055,
          freqStart: 320,
          gain: 0.11,
        });
      }
    }
    return renderToneEvents(events, arp.length * step);
  }

  if (track === 'smw_overworld') {
    // Bouncy 16-bit Dinosaur Island Calypso / Ragtime with Yoshi Bongo Percussion!
    const step = 0.125;
    const lead = [
      72, 0, 69, 0, 65, 0, 69, 72, 77, 0, 76, 74, 72, 0, 0, 0,
      74, 0, 71, 0, 67, 0, 71, 74, 79, 0, 77, 76, 74, 0, 72, 0,
      69, 0, 72, 0, 77, 0, 81, 0, 79, 0, 76, 0, 72, 0, 69, 0,
      70, 0, 74, 0, 72, 0, 69, 0, 65, 0, 69, 72, 65, 0, 0, 0,
    ];
    const bass = [
      53, 60, 57, 60, 53, 60, 57, 60, 55, 62, 59, 62, 48, 55, 52, 55,
      53, 60, 57, 60, 52, 59, 55, 59, 46, 53, 48, 55, 53, 60, 53, 48,
    ];
    for (let i = 0; i < lead.length; i++) {
      if (lead[i] > 0) {
        events.push({
          wave: 'pulse50',
          startSec: i * step,
          durSec: step * 0.85,
          freqStart: midiFreq(lead[i]),
          gain: 0.17,
        });
      }
      if (i % 2 === 0) {
        events.push({
          wave: 'triangle',
          startSec: i * step,
          durSec: step * 1.55,
          freqStart: midiFreq(bass[(i >> 1) % bass.length]),
          gain: 0.25,
          decay: false,
        });
      }
      // Syncopated Yoshi Bongo tom hits!
      if (i % 4 === 1 || i % 8 === 6) {
        events.push({
          wave: 'triangle',
          startSec: i * step,
          durSec: 0.045,
          freqStart: i % 8 === 6 ? 410 : 290,
          freqEnd: 160,
          gain: 0.16,
        });
      }
    }
    return renderToneEvents(events, lead.length * step);
  }

  if (track === 'smw_athletic') {
    const step = 0.112;
    const lead = [
      76, 0, 79, 81, 84, 0, 81, 0, 79, 0, 76, 74, 72, 0, 0, 0,
      74, 0, 77, 79, 83, 0, 79, 0, 77, 0, 74, 71, 72, 0, 76, 0,
      79, 0, 84, 0, 86, 84, 81, 0, 79, 0, 76, 0, 72, 0, 74, 0,
      76, 0, 74, 0, 72, 0, 79, 0, 72, 0, 0, 0, 0, 0, 0, 0,
    ];
    const bass = [48, 55, 52, 55, 50, 57, 55, 59];
    for (let i = 0; i < lead.length; i++) {
      if (lead[i] > 0) {
        events.push({
          wave: 'pulse25',
          startSec: i * step,
          durSec: step * 0.82,
          freqStart: midiFreq(lead[i]),
          gain: 0.17,
        });
      }
      if (i % 2 === 0) {
        events.push({
          wave: 'triangle',
          startSec: i * step,
          durSec: step * 1.6,
          freqStart: midiFreq(bass[(i >> 1) % bass.length]),
          gain: 0.25,
          decay: false,
        });
      }
      if (i % 4 === 2) {
        events.push({
          wave: 'noise',
          startSec: i * step,
          durSec: 0.03,
          freqStart: 1350,
          gain: 0.08,
        });
      }
    }
    return renderToneEvents(events, lead.length * step);
  }

  // Starman Invincibility Rush!
  const step = 0.095;
  const starLead = [
    72, 72, 72, 0, 72, 0, 72, 72, 71, 71, 71, 0, 71, 0, 71, 71,
  ];
  const starBass = [48, 55, 60, 55, 47, 53, 59, 53];
  for (let i = 0; i < starLead.length; i++) {
    if (starLead[i] > 0) {
      events.push({
        wave: 'pulse25',
        startSec: i * step,
        durSec: step * 0.8,
        freqStart: midiFreq(starLead[i]),
        gain: 0.19,
      });
    }
    if (i % 2 === 0) {
      events.push({
        wave: 'triangle',
        startSec: i * step,
        durSec: step * 1.7,
        freqStart: midiFreq(starBass[(i >> 1) % starBass.length]),
        gain: 0.27,
        decay: false,
      });
      events.push({
        wave: 'noise',
        startSec: i * step,
        durSec: 0.03,
        freqStart: 1300,
        gain: 0.08,
      });
    }
  }
  return renderToneEvents(events, starLead.length * step);
}
