// Pruebas de la escena 3D (modo Dimensión) en Node, sin GPU: arma la escena
// three.js para muchos mundos y revisa que todo quede dibujado y bien ubicado.
import { partitionTotalLevels } from '../src/engine/biomes';
import { PARTITION_ORDER } from '../src/engine/partitions';
import * as THREE from 'three';
import { DIM_TOTAL_LEVELS, EXP_TOTAL_LEVELS, FRONTIER_TOTAL_LEVELS, LOGICAL_HEIGHT, TILE } from '../src/engine/biomes';
import { stepWorld } from '../src/engine/physics';
import type { GamePartition, InputState, WorldState } from '../src/engine/types';
import { buildWorldState } from '../src/levels/levelBuilder';
import { World3DScene } from '../src/renderer3d/scene3d';

// Todos los modos del juego (así ningún modo nuevo queda fuera de las pruebas)
const ALL_MODES: Array<[GamePartition, number]> = PARTITION_ORDER.map((p) => [p, partitionTotalLevels(p)]);

const W = 844;
const H = 390;
const VIEW_W = W / (H / LOGICAL_HEIGHT);
const NO_INPUT: InputState = {
  left: false, right: false, up: false, down: false, jump: false, run: false, fire: false, spin: false,
};

let passed = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`   ✖ ${msg}`);
    process.exit(1);
  }
  passed++;
}

function finiteScene(scene: THREE.Scene): boolean {
  let ok = true;
  const m = new THREE.Matrix4();
  scene.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, m);
        if (m.elements.some((v) => !Number.isFinite(v))) ok = false;
      }
    }
  });
  return ok;
}

console.log('11. Validando la escena 3D (modo Dimensión)...');
const sc = new World3DScene();

// 11a. Las 16 etapas de Dimensión se arman con todo visible
for (let i = 0; i < DIM_TOTAL_LEVELS; i++) {
  const w = buildWorldState(i, undefined, 'dimension');
  for (let f = 0; f < 30; f++) stepWorld(w, NO_INPUT, VIEW_W);
  sc.sync(w, W, H);
  const s = sc.lastStats;
  assert(s.blocks > 60, `${w.worldLabel}: se dibujan los bloques (${s.blocks})`);
  assert(s.playerVisible, `${w.worldLabel}: el plomero es visible`);
  assert(finiteScene(sc.scene), `${w.worldLabel}: sin valores inválidos en la escena`);
  // El plomero queda en la pantalla, a la misma altura relativa que en 2D
  const p = sc.projectToScreen(w.player.x + w.player.width / 2, w.player.y + w.player.height / 2, W, H);
  assert(p.x > W * 0.15 && p.x < W * 0.7, `${w.worldLabel}: plomero dentro de la pantalla en X (${p.x.toFixed(0)})`);
  assert(p.y > H * 0.45 && p.y < H * 0.92, `${w.worldLabel}: plomero dentro de la pantalla en Y (${p.y.toFixed(0)})`);
}

// 11b. La escena sabe dibujar cualquier mundo (todas las mecánicas y objetivos)
let worlds = 0;
for (const [part, total] of ALL_MODES) {
  for (let i = 0; i < total; i++) {
    const w = buildWorldState(i, undefined, part);
    // Recorrer el nivel para que aparezcan sus elementos frente a la cámara
    for (const frac of [0.25, 0.5, 0.75]) {
      w.cameraX = w.totalCols * TILE * frac - VIEW_W / 2;
      w.player.x = w.cameraX + VIEW_W * 0.4;
      w.frameCount = Math.floor(frac * 400);
      sc.sync(w, W, H);
      assert(finiteScene(sc.scene), `${part} ${w.worldLabel}: escena válida al ${frac * 100}%`);
    }
    worlds++;
  }
}

// 11c. Elementos especiales: sombra, llave inglesa, jefe y objetos
{
  const chase = buildWorldState(4, undefined, 'dimension'); // T-1: persecución
  assert(chase.chase, 'T-1 tiene persecución');
  chase.chase!.x = chase.player.x - 200;
  sc.sync(chase, W, H);
  assert(finiteScene(sc.scene), 'La sombra se dibuja sin errores');

  const w = buildWorldState(1, undefined, 'dimension'); // J-2: gemas
  const before = (() => {
    sc.sync(w, W, H);
    return sc.lastStats.pickups;
  })();
  const gem = w.pickups!.find((p) => p.kind === 'gem')!;
  w.cameraX = gem.x - VIEW_W / 2;
  sc.sync(w, W, H);
  assert(sc.lastStats.pickups >= 1, `Las gemas se dibujan cerca de la cámara (antes ${before})`);

  const boss = buildWorldState(3, undefined, 'dimension');
  boss.cameraX = boss.boss!.x - VIEW_W / 2;
  boss.player.x = boss.boss!.x - 200;
  sc.sync(boss, W, H);
  assert(sc.lastStats.blocks > 40 && finiteScene(sc.scene), 'El castillo y el jefe se dibujan');

  const wr = buildWorldState(0, undefined, 'dimension');
  stepWorld(wr, { ...NO_INPUT, fire: true }, VIEW_W);
  assert(wr.wrench, 'La llave inglesa existe en Dimensión');
  sc.sync(wr, W, H);
  assert(finiteScene(sc.scene), 'La llave inglesa se dibuja');
}

// 11d. Cambiar de bioma actualiza el cielo
{
  const a = buildWorldState(0, undefined, 'dimension');
  const b = buildWorldState(8, undefined, 'dimension');
  sc.sync(a, W, H);
  const bgA = (sc.scene.background as THREE.Color).getHexString();
  sc.sync(b, W, H);
  const bgB = (sc.scene.background as THREE.Color).getHexString();
  assert(bgA !== bgB, `Cada mundo tiene su propio cielo (${bgA} vs ${bgB})`);
}

console.log(`   ✔ ${passed} comprobaciones de la escena 3D en verde (${worlds} mundos dibujados).`);
