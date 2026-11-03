// ============================================================================
// ESCENA 3D DEL MODO DIMENSIÓN (three.js, low-poly)
// Dibuja el mismo WorldState que el renderer 2D, pero con volumen, luces y
// cámara en perspectiva. No sabe nada de GL: solo arma y actualiza la escena,
// así que se puede probar en Node. glRenderer.ts la dibuja con expo-gl.
//
// Coordenadas: 1 unidad = 1 bloque. x del mundo → +X, y del mundo → −Y.
// Todo se crea una vez; cada frame solo se actualizan matrices y colores
// (mallas instanciadas), así el costo no crece con el largo del nivel.
// ============================================================================
import * as THREE from 'three';
import { BIOMES, GROUND_ROW, LOGICAL_HEIGHT, TILE, WORLD_VERTICAL_LIFT } from '../engine/biomes';
import { lavaTideRise, platformGlow } from '../engine/mechanics';
import { isGoalLocked } from '../engine/objectives';
import type { BiomeId, Enemy, WorldState } from '../engine/types';

const U = 1 / TILE; // píxeles del mundo → unidades 3D
const VIEW_ROWS = LOGICAL_HEIGHT / TILE; // 14 filas visibles
const FOV = 32;
const CAM_DIST = VIEW_ROWS / (2 * Math.tan((FOV * Math.PI) / 360));

const toX = (px: number): number => px * U;
const toY = (px: number): number => -px * U;

/** Malla instanciada con color por instancia y un cursor para llenarla cada frame. */
class Batch {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, readonly capacity: number) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin(): void {
    this.n = 0;
  }

  add(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string | number,
    rx = 0,
    ry = 0,
    rz = 0
  ): void {
    if (this.n >= this.capacity) return;
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(rx, ry, rz);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.n, this.dummy.matrix);
    this.mesh.setColorAt(this.n, this.color.set(color));
    this.n += 1;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get count(): number {
    return this.n;
  }
}

const ENEMY_COLORS: Record<string, string> = {
  goomba: '#a0522d',
  galoomba: '#c2410c',
  koopa_green: '#16a34a',
  koopa_red: '#dc2626',
  paratroopa: '#ef4444',
  piranha: '#22c55e',
  spiny: '#e11d48',
  rex: '#7c3aed',
  chuck: '#2563eb',
  bullet_bill: '#1f2937',
};

export interface SceneStats {
  blocks: number;
  enemies: number;
  coins: number;
  pickups: number;
  playerVisible: boolean;
}

export class World3DScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 200);

  private biomeId: BiomeId | null = null;
  private readonly skyMat: THREE.MeshBasicMaterial;
  private readonly sky: THREE.Mesh;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;

  // Lotes (todos con color por instancia)
  private readonly blocks: Batch;
  private readonly glowBlocks: Batch;
  private readonly cylinders: Batch;
  private readonly spheres: Batch;
  private readonly glowSpheres: Batch;
  private readonly cones: Batch;
  private readonly gems: Batch;
  private readonly rings: Batch;
  private readonly ghost: Batch;
  private readonly bits: Batch;

  // Plomero (grupo propio para animarlo con detalle)
  private readonly hero = new THREE.Group();
  private readonly heroLegs: THREE.Mesh;
  private readonly heroBody: THREE.Mesh;
  private readonly heroHead: THREE.Mesh;
  private readonly heroCap: THREE.Mesh;
  private readonly heroBrim: THREE.Mesh;
  private readonly heroCape: THREE.Mesh;
  private readonly legMat: THREE.MeshLambertMaterial;
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly capMat: THREE.MeshLambertMaterial;

  private readonly stars: THREE.Points;
  private readonly projectVec = new THREE.Vector3();

  lastStats: SceneStats = { blocks: 0, enemies: 0, coins: 0, pickups: 0, playerVisible: false };

  constructor() {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    const sph = new THREE.SphereGeometry(0.5, 14, 10);
    const cone = new THREE.ConeGeometry(0.5, 1, 10);
    const oct = new THREE.OctahedronGeometry(0.5, 0);
    const torus = new THREE.TorusGeometry(0.4, 0.12, 8, 18);

    const lambert = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    const glow = () => new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.blocks = new Batch(box, lambert(), 2600);
    this.glowBlocks = new Batch(box, glow(), 400);
    this.cylinders = new Batch(cyl, lambert(), 500);
    this.spheres = new Batch(sph, lambert(), 900);
    this.glowSpheres = new Batch(sph, glow(), 200);
    this.cones = new Batch(cone, lambert(), 300);
    this.gems = new Batch(oct, lambert(), 60);
    this.rings = new Batch(torus, lambert(), 80);
    this.ghost = new Batch(
      box,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }),
      40
    );
    this.bits = new Batch(box, glow(), 500);
    for (const b of [
      this.blocks,
      this.glowBlocks,
      this.cylinders,
      this.spheres,
      this.glowSpheres,
      this.cones,
      this.gems,
      this.rings,
      this.ghost,
      this.bits,
    ]) {
      this.scene.add(b.mesh);
    }

    // Cielo: un plano lejano con degradado vertical
    const skyGeo = new THREE.PlaneGeometry(400, 120);
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
    this.skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.position.set(0, -6, -60);
    this.scene.add(this.sky);

    // Estrellas para los mundos nocturnos
    const starPos: number[] = [];
    for (let i = 0; i < 260; i++) {
      starPos.push(((i * 97.13) % 400) - 200, -((i * 37.7) % 60) + 18, -55);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35 }));
    this.scene.add(this.stars);

    // Luces
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.25);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.position.set(-4, 8, 10);
    this.scene.add(this.hemi, this.sun);

    // Plomero
    this.legMat = new THREE.MeshLambertMaterial({ color: '#1d4ed8' });
    this.bodyMat = new THREE.MeshLambertMaterial({ color: '#dc2626' });
    this.capMat = new THREE.MeshLambertMaterial({ color: '#dc2626' });
    const skin = new THREE.MeshLambertMaterial({ color: '#fcd9b6' });
    this.heroLegs = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.4, 12), this.legMat);
    this.heroBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, 0.4, 12), this.bodyMat);
    this.heroHead = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), skin);
    this.heroCap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.capMat);
    this.heroBrim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.3), this.capMat);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), skin);
    const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.26), new THREE.MeshLambertMaterial({ color: '#3f2a14' }));
    this.heroCape = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.6, 0.5),
      new THREE.MeshLambertMaterial({ color: '#facc15' })
    );
    this.hero.add(this.heroLegs, this.heroBody, this.heroHead, this.heroCap, this.heroBrim, nose, moustache, this.heroCape);
    nose.name = 'nose';
    moustache.name = 'moustache';
    this.scene.add(this.hero);
  }

  /** Ajusta cielo, luces y niebla al bioma (solo cuando cambia). */
  private applyBiome(id: BiomeId): void {
    if (this.biomeId === id) return;
    this.biomeId = id;
    const b = BIOMES[id];
    const top = new THREE.Color(b.skyTop);
    const bottom = new THREE.Color(b.skyBottom);
    const colors = this.sky.geometry.getAttribute('color') as THREE.BufferAttribute;
    // PlaneGeometry: vértices 0,1 arriba; 2,3 abajo
    for (let i = 0; i < 4; i++) {
      const c = i < 2 ? top : bottom;
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
    this.scene.background = bottom.clone();
    this.scene.fog = new THREE.Fog(bottom.getHex(), CAM_DIST + 12, CAM_DIST + 70);
    this.hemi.color.set(b.cloudFill);
    this.hemi.groundColor.set(b.groundDark);
    this.stars.visible = b.hasStars || b.underground;
  }

  /** Proyecta un punto del mundo (px) a la pantalla (px), para textos superpuestos. */
  projectToScreen(px: number, py: number, screenW: number, screenH: number): { x: number; y: number } {
    this.projectVec.set(toX(px), toY(py), 0.6).project(this.camera);
    return { x: (this.projectVec.x * 0.5 + 0.5) * screenW, y: (-this.projectVec.y * 0.5 + 0.5) * screenH };
  }

  /** Actualiza la escena para dibujar `world` en una pantalla de screenW × screenH. */
  sync(world: WorldState, screenW: number, screenH: number): void {
    const b = BIOMES[world.biomeId];
    this.applyBiome(world.biomeId);
    const scale = screenH / LOGICAL_HEIGHT;
    const viewW = screenW / scale;
    const frame = world.frameCount;

    // --- Cámara: mismo encuadre que el 2D, con un poco de inclinación ---
    const cx = toX(world.cameraX + viewW / 2);
    const cy = toY(LOGICAL_HEIGHT / 2 - WORLD_VERTICAL_LIFT);
    const shake = world.screenShake > 0 ? Math.sin(frame * 1.9) * world.screenShake * U : 0;
    this.camera.aspect = screenW / Math.max(1, screenH);
    // La cámara mira levemente hacia abajo, pero el centro de la vista queda
    // donde lo pone el 2D, así el suelo no baja hasta los controles táctiles
    this.camera.position.set(cx + shake, cy + 1.6, CAM_DIST);
    this.camera.lookAt(cx, cy - 0.9, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(); // para projectToScreen antes de dibujar
    this.sky.position.x = cx;
    this.stars.position.x = cx * 0.9;

    const all = [
      this.blocks,
      this.glowBlocks,
      this.cylinders,
      this.spheres,
      this.glowSpheres,
      this.cones,
      this.gems,
      this.rings,
      this.ghost,
      this.bits,
    ];
    for (const batch of all) batch.begin();

    const startCol = Math.max(0, Math.floor(world.cameraX / TILE) - 6);
    const endCol = Math.min(world.totalCols - 1, Math.ceil((world.cameraX + viewW) / TILE) + 6);
    const inView = (px: number, w = TILE) => px + w > (startCol - 2) * TILE && px < (endCol + 2) * TILE;

    // --- Decorado de fondo: colinas y nubes en profundidad (paralaje real) ---
    for (const s of world.sceneries) {
      const sx = toX(s.x);
      if (Math.abs(sx - cx) > 40) continue;
      if (s.kind === 'cloud') {
        this.spheres.add(sx, toY(s.y) + 2, -14, 3.2 * s.scale, 1.1 * s.scale, 1.4, b.cloudFill);
        this.spheres.add(sx + 1.4 * s.scale, toY(s.y) + 2.3, -14.2, 2.2 * s.scale, 1 * s.scale, 1.2, b.cloudFill);
      } else if (s.kind === 'hill' || s.kind === 'dune' || s.kind === 'pine') {
        const color = s.kind === 'pine' ? b.nearHill : b.distantHill;
        this.cones.add(sx, -GROUND_ROW + 1.6 * s.scale, -7 - s.scale * 2, 3.4 * s.scale, 3.2 * s.scale, 3.4 * s.scale, color);
      } else if (s.kind === 'bush') {
        this.spheres.add(sx, -GROUND_ROW + 0.3, -2.4, 1.6 * s.scale, 0.9, 1, b.bushFill);
      } else {
        // pilares / estandartes de cuevas y castillos
        this.cylinders.add(sx, -6, -6, 1.1, 14, 1.1, b.hardDark);
      }
    }

    // --- Bloques ---
    const lavaRise = lavaTideRise(world);
    for (let col = startCol; col <= endCol; col++) {
      for (let row = 0; row < 15; row++) {
        const blk = world.blockGrid.get(row * 1024 + col);
        if (!blk || blk.type === 'hidden') continue;
        const x = col + 0.5;
        const y = -(row + 0.5) - (blk.bounceY ?? 0) * U;
        switch (blk.type) {
          case 'ground_top':
            this.blocks.add(x, y - 0.05, -0.5, 1, 0.9, 3, b.groundMain);
            this.blocks.add(x, y + 0.42, -0.5, 1.02, 0.2, 3.04, b.groundCap);
            break;
          case 'ground_deep':
            this.blocks.add(x, y, -0.5, 1, 1, 3, b.groundShadow);
            this.blocks.add(x, y - 1, -0.5, 1, 1, 3, b.groundDark);
            break;
          case 'brick':
            this.blocks.add(x, y, 0, 0.96, 0.96, 0.96, b.brickMain);
            break;
          case 'hard':
            this.blocks.add(x, y, 0, 0.98, 0.98, 0.98, b.hardMain);
            break;
          case 'question':
            // Bloque con volumen e iluminación, y un "?" luminoso al frente
            this.blocks.add(x, y, 0, 0.94, 0.94, 0.94, '#f59e0b');
            this.glowBlocks.add(x, y + 0.12, 0.48, 0.26, 0.08, 0.03, Math.floor(frame / 12) % 2 === 0 ? '#fff7ed' : '#fde68a');
            this.glowBlocks.add(x + 0.1, y + 0.02, 0.48, 0.07, 0.18, 0.03, '#fff7ed');
            this.glowBlocks.add(x, y - 0.25, 0.48, 0.08, 0.08, 0.03, '#fff7ed');
            break;
          case 'empty':
            this.blocks.add(x, y, 0, 0.94, 0.94, 0.94, '#78350f');
            break;
          case 'rotating':
            this.blocks.add(x, y, 0, 0.94, 0.94, 0.94, '#facc15', 0, blk.spinTimer > 0 ? blk.spinTimer * 0.4 : 0, 0);
            break;
          case 'bridge': {
            const shakeX = blk.crumbleTimer ? Math.sin(frame * 2.1) * 0.06 : 0;
            this.blocks.add(x + shakeX, y + 0.3, 0, 1, 0.3, 1.4, blk.crumble ? '#a16207' : '#b45309');
            break;
          }
          case 'lock':
            this.blocks.add(x, y, 0, 0.94, 0.94, 0.94, '#78350f');
            if (row === 10) this.glowBlocks.add(x, y, 0.5, 0.35, 0.4, 0.05, '#facc15');
            break;
        }
      }
    }

    // --- Lava (y marea) ---
    for (const col of world.lavaCols) {
      if (col < startCol || col > endCol) continue;
      const rise = lavaRise > 0 && !world.boss?.bridgeCols.includes(col) ? lavaRise * U : 0;
      const top = -GROUND_ROW - 0.35 + rise;
      this.glowBlocks.add(col + 0.5, top - 1.2, -0.5, 1, 2.4, 3, (col + Math.floor(frame / 10)) % 2 === 0 ? '#f97316' : '#ea580c');
    }

    // --- Tuberías, resortes y hongos ---
    for (const p of world.pipes) {
      if (!inView(p.x, p.width)) continue;
      const h = p.height * U;
      this.cylinders.add(toX(p.x + p.width / 2), toY(p.y) - h / 2, 0, 1.6, h, 1.6, b.pipeMain);
      this.cylinders.add(toX(p.x + p.width / 2), toY(p.y) - 0.25, 0, 1.95, 0.5, 1.95, b.pipeLight);
    }
    for (const sp of world.springs) {
      if (!inView(sp.x)) continue;
      const squash = sp.compressTimer > 0 ? 0.6 : 1;
      const x = toX(sp.x + sp.width / 2);
      if (sp.kind === 'mushroom') {
        this.cylinders.add(x, -GROUND_ROW + 0.25, 0, 0.35, 0.5, 0.35, '#fef3c7');
        this.spheres.add(x, -GROUND_ROW + 0.55 * squash, 0, 1.1, 0.55 * squash, 1.1, '#dc2626');
      } else {
        this.cylinders.add(x, -GROUND_ROW + 0.4 * squash, 0, 0.7, 0.8 * squash, 0.7, '#94a3b8');
        this.cylinders.add(x, -GROUND_ROW + 0.82 * squash, 0, 0.85, 0.12, 0.85, '#ef4444');
      }
    }

    // --- Plataformas (y luciérnagas) ---
    for (const pl of world.platforms) {
      if (!inView(pl.x, pl.width)) continue;
      const glow = platformGlow(pl, frame);
      const x = toX(pl.x + pl.width / 2);
      const y = toY(pl.y) - 0.2;
      if (pl.blink && glow === 0) {
        this.ghost.add(x, y, 0, pl.width * U, 0.3, 1.2, '#bef264');
        continue;
      }
      this.blocks.add(x, y, 0, pl.width * U, 0.4, 1.3, glow < 1 ? '#57534e' : '#b45309');
      if (pl.blink) {
        for (let k = 0; k < Math.round(pl.width / 16); k++) {
          this.glowSpheres.add(toX(pl.x + 8 + k * 16), y + 0.45 + Math.sin(frame * 0.12 + k) * 0.08, 0.3, 0.12, 0.12, 0.12, '#d9f99d');
        }
      }
    }

    // --- Zonas de gravedad baja ---
    for (const z of world.lowGravZones ?? []) {
      if (!inView(z.x0, z.x1 - z.x0)) continue;
      this.ghost.add(toX((z.x0 + z.x1) / 2), -6.5, 0, (z.x1 - z.x0) * U, 12, 3, '#a78bfa');
    }

    // --- Monedas ---
    let coinCount = 0;
    for (const c of world.coinsList) {
      if (c.collected || !inView(c.x)) continue;
      const bob = Math.sin(frame * 0.08 + c.phase) * 0.06;
      const spin = frame * 0.08 + c.phase;
      this.cylinders.add(toX(c.x + c.width / 2), toY(c.y + c.height / 2) + bob, 0, 0.55, 0.12, 0.55, '#fbbf24', Math.PI / 2, spin, 0);
      // Brillo central para que se lean como monedas desde lejos
      this.glowSpheres.add(toX(c.x + c.width / 2), toY(c.y + c.height / 2) + bob, 0.08, 0.28 * Math.abs(Math.cos(spin)) + 0.04, 0.32, 0.05, '#fef3c7');
      coinCount++;
    }

    // --- Objetos: gemas, relojes, llaves, cofres y portales ---
    let pickupCount = 0;
    for (const pk of world.pickups ?? []) {
      if (pk.collected || !inView(pk.x)) continue;
      pickupCount++;
      const x = toX(pk.x + pk.width / 2);
      const y = toY(pk.y + pk.height / 2) + Math.sin(frame * 0.09 + pk.phase) * 0.08;
      switch (pk.kind) {
        case 'gem':
          this.gems.add(x, y, 0, 0.55, 0.8, 0.55, '#e879f9', 0, frame * 0.05, 0);
          break;
        case 'clock':
          this.cylinders.add(x, y, 0, 0.7, 0.18, 0.7, '#facc15', Math.PI / 2, 0, 0);
          this.cylinders.add(x, y, 0.05, 0.5, 0.2, 0.5, '#fefce8', Math.PI / 2, 0, 0);
          break;
        case 'key':
          this.rings.add(x - 0.15, y, 0, 0.5, 0.5, 0.5, '#facc15', 0, frame * 0.05, 0);
          this.blocks.add(x + 0.2, y, 0, 0.45, 0.12, 0.12, '#facc15');
          break;
        case 'treasure':
          this.blocks.add(x, y, 0, 0.75, 0.6, 0.55, '#92400e');
          this.glowBlocks.add(x, y + 0.08, 0.02, 0.77, 0.08, 0.57, '#facc15');
          break;
        case 'portal':
          this.rings.add(x, y, 0, 1.6, 2.2, 1.6, '#a855f7', 0, 0, frame * 0.04);
          this.glowSpheres.add(x, y, 0, 0.6, 1.2, 0.2, '#e9d5ff');
          break;
      }
    }

    // --- Power-ups ---
    for (const pw of world.powerups) {
      if (!inView(pw.x, pw.width)) continue;
      const x = toX(pw.x + pw.width / 2);
      const y = toY(pw.y + pw.height / 2);
      if (pw.kind === 'mushroom' || pw.kind === 'one_up') {
        this.cylinders.add(x, y - 0.15, 0, 0.45, 0.35, 0.45, '#fef3c7');
        this.spheres.add(x, y + 0.08, 0, 0.85, 0.55, 0.85, pw.kind === 'one_up' ? '#16a34a' : '#dc2626');
      } else if (pw.kind === 'flower') {
        this.cylinders.add(x, y - 0.2, 0, 0.1, 0.4, 0.1, '#16a34a');
        this.glowSpheres.add(x, y + 0.12, 0, 0.6, 0.6, 0.25, Math.floor(frame / 6) % 2 ? '#f97316' : '#facc15');
      } else if (pw.kind === 'star') {
        this.gems.add(x, y, 0, 0.75, 0.75, 0.35, '#fde047', 0, frame * 0.15, 0);
      } else {
        this.blocks.add(x, y, 0, 0.6, 0.15, 0.35, '#fde68a', 0, 0, Math.sin(frame * 0.1) * 0.4);
      }
    }

    // --- Carámbanos ---
    for (const ic of world.icicles ?? []) {
      if (ic.state === 'gone' || !inView(ic.x)) continue;
      const jitter = ic.state === 'shake' ? Math.sin(frame * 2.7) * 0.05 : 0;
      this.cones.add(toX(ic.x + ic.width / 2) + jitter, toY(ic.y + ic.height / 2), 0, 0.5, ic.height * U, 0.5, '#bae6fd', Math.PI, 0, 0);
    }

    // --- Enemigos ---
    let enemyCount = 0;
    for (const en of world.enemies) {
      if (!inView(en.x, en.width)) continue;
      this.addEnemy(en, frame);
      enemyCount++;
    }

    // --- Jefe, hacha y fuego ---
    const boss = world.boss;
    if (boss && !(boss.defeated && !boss.fallingInLava)) {
      const bx = toX(boss.x + boss.width / 2);
      const by = toY(boss.y + boss.height / 2);
      const flash = boss.hurtFlashTimer > 0 && Math.floor(frame / 3) % 2 === 0;
      this.spheres.add(bx, by - 0.2, 0, 1.9, 1.7, 1.6, flash ? '#ffffff' : '#15803d');
      this.spheres.add(bx + boss.facing * 0.7, by + 0.75, 0.2, 0.95, 0.9, 0.9, flash ? '#ffffff' : '#facc15');
      for (let k = 0; k < 5; k++) {
        this.cones.add(bx - 0.8 + k * 0.4, by + 0.65, -0.3, 0.25, 0.45, 0.25, '#f5f5f4');
      }
      this.glowSpheres.add(bx + boss.facing * 1.0, by + 0.95, 0.6, 0.14, 0.14, 0.14, '#ef4444');
    }
    if (boss && !boss.axeGrabbed && inView(boss.axeX)) {
      this.cylinders.add(toX(boss.axeX) + 0.5, toY(boss.axeY) + 0.3, 0, 0.12, 1.1, 0.12, '#78350f');
      this.glowBlocks.add(toX(boss.axeX) + 0.7, toY(boss.axeY) + 0.7, 0, 0.5, 0.45, 0.12, '#fde047');
    }
    for (const f of world.bossFires) {
      this.glowSpheres.add(toX(f.x + f.width / 2), toY(f.y + f.height / 2), 0.2, f.width * U, f.height * U, 0.5, '#fb923c');
    }
    for (const fb of world.fireballs) {
      this.glowSpheres.add(toX(fb.x + 6), toY(fb.y + 6), 0.2, 0.42, 0.42, 0.42, Math.floor(frame / 3) % 2 ? '#fb923c' : '#fde047');
    }

    // --- Llave inglesa ---
    if (world.wrench) {
      const w = world.wrench;
      this.blocks.add(toX(w.x + w.width / 2), toY(w.y + w.height / 2), 0.3, 0.16, 0.7, 0.16, '#cbd5e1', 0, 0, w.spin);
    }

    // --- Meta (bandera / cinta), checkpoint y candado ---
    const fp = world.flagpole;
    if (fp && inView(fp.x)) {
      const px = toX(fp.x + fp.width / 2);
      this.cylinders.add(px, toY(fp.y + fp.height / 2), 0, 0.14, fp.height * U, 0.14, '#e2e8f0');
      this.spheres.add(px, toY(fp.y) + 0.1, 0, 0.35, 0.35, 0.35, '#facc15');
      this.blocks.add(px - 0.5, toY(fp.flagY) - 0.3, 0, 0.9, 0.6, 0.06, '#22c55e');
      // Castillo
      const castleX = toX(fp.castleX) + 2;
      this.blocks.add(castleX, -GROUND_ROW + 1.5, -1, 4, 3, 3, b.hardMain);
      this.blocks.add(castleX, -GROUND_ROW + 3.6, -1, 2.6, 1.4, 2.4, b.hardMain);
      this.blocks.add(castleX, -GROUND_ROW + 0.8, 0.52, 1, 1.6, 0.1, '#1c1917');
      if (isGoalLocked(world)) {
        this.ghost.add(px, -7, 0, 0.5, 10, 1, '#a855f7');
        this.glowBlocks.add(px, -9, 0.6, 0.7, 0.6, 0.2, '#facc15');
      }
    }
    const cp = world.checkpoint;
    if (cp && inView(cp.x)) {
      const x = toX(cp.x + 10);
      this.cylinders.add(x, toY(cp.y + cp.height / 2), 0, 0.1, cp.height * U, 0.1, '#cbd5e1');
      this.blocks.add(x + 0.4, toY(cp.y) - (cp.activated ? 0.3 : 1.1), 0, 0.7, 0.45, 0.05, cp.activated ? '#38bdf8' : '#ef4444');
    }

    // --- Sombra que persigue ---
    if (world.chase) {
      const edge = toX(world.chase.x);
      this.blocks.add(edge - 20, -7, 0, 40, 20, 6, '#12061f');
      for (let k = 0; k < 12; k++) {
        const wave = Math.sin(frame * 0.15 + k) * 0.3;
        this.glowBlocks.add(edge + 0.2 + wave, -1 - k * 1.1, 2.6, 0.12, 0.6, 0.1, '#a855f7');
      }
      const ey = Math.max(-GROUND_ROW + 2, Math.min(-3, toY(world.player.y)));
      if (frame % 150 > 6) {
        this.glowSpheres.add(edge - 0.9, ey, 3.1, 0.35, 0.22, 0.1, '#f0abfc');
        this.glowSpheres.add(edge - 0.35, ey, 3.1, 0.35, 0.22, 0.1, '#f0abfc');
      }
    }

    // --- Partículas ---
    for (const pt of world.particles) {
      if (!inView(pt.x, 8)) continue;
      const s = Math.max(0.06, pt.size * U);
      if (pt.kind === 'wind') {
        this.bits.add(toX(pt.x), toY(pt.y), 1.2, 0.8, 0.05, 0.05, '#ffffff');
      } else {
        this.bits.add(toX(pt.x), toY(pt.y), 0.6, s, s, s, pt.kind === 'coin_pop' ? '#facc15' : pt.color.startsWith('#') ? pt.color : '#ffffff');
      }
    }

    // --- Plomero ---
    const playerVisible = this.syncHero(world, frame);

    for (const batch of all) batch.end();
    this.lastStats = {
      blocks: this.blocks.count + this.glowBlocks.count,
      enemies: enemyCount,
      coins: coinCount,
      pickups: pickupCount,
      playerVisible,
    };
  }

  private addEnemy(en: Enemy, frame: number): void {
    const color = ENEMY_COLORS[en.type] ?? '#a0522d';
    const x = toX(en.x + en.width / 2);
    const y = toY(en.y + en.height / 2);
    const w = en.width * U;
    const h = en.height * U;
    const flip = en.state === 'knocked' ? Math.PI : 0;
    const face = en.facing === 1 ? 1 : -1;
    const step = Math.sin(frame * 0.3 + en.id) * 0.06;

    if (en.state === 'squashed') {
      this.spheres.add(x, toY(en.y + en.height) + 0.1, 0, w, 0.2, w, color);
      return;
    }
    if (en.type === 'bullet_bill') {
      this.cylinders.add(x, y, 0, h * 0.9, w * 1.2, h * 0.9, color, 0, 0, Math.PI / 2);
      this.spheres.add(x - face * w * 0.6, y, 0, h * 0.9, h * 0.9, h * 0.9, color);
      this.glowSpheres.add(x - face * w * 0.55, y + 0.12, 0.4, 0.12, 0.12, 0.12, '#ffffff');
      return;
    }
    if (en.type === 'piranha') {
      this.cylinders.add(x, y - h * 0.25, 0, 0.12, h * 0.6, 0.12, '#15803d');
      this.spheres.add(x, y + h * 0.2, 0, w * 1.1, h * 0.55, w * 0.9, '#dc2626');
      this.spheres.add(x, y + h * 0.2, 0.3, 0.12, 0.12, 0.12, '#ffffff');
      return;
    }
    const shell = en.state === 'shell_idle' || en.state === 'shell_slide' || en.state === 'shell_wake';
    if (shell) {
      this.spheres.add(x, y, 0, w * 1.05, h * 0.75, w * 1.05, color, 0, frame * (en.state === 'shell_slide' ? 0.5 : 0), flip);
      this.spheres.add(x, y - h * 0.25, 0, w * 0.9, h * 0.3, w * 0.9, '#fef3c7', 0, 0, flip);
      return;
    }
    // Cuerpo, ojos y patas (low-poly)
    const isKoopa = en.type === 'koopa_green' || en.type === 'koopa_red' || en.type === 'paratroopa';
    this.spheres.add(x, y - h * 0.08 + step * 0.3, 0, w * 1.05, h * (isKoopa ? 0.6 : 0.85), w, color, flip, 0, 0);
    if (isKoopa) {
      this.spheres.add(x + face * w * 0.32, y + h * 0.32, 0.1, w * 0.55, h * 0.4, w * 0.55, '#fde68a', flip);
    }
    const eyeY = isKoopa ? y + h * 0.38 : y + h * 0.12;
    const eyeX = x + face * w * (isKoopa ? 0.42 : 0.22);
    this.spheres.add(eyeX - 0.1, eyeY, 0.36, 0.16, 0.22, 0.1, '#ffffff', flip);
    this.spheres.add(eyeX + 0.1, eyeY, 0.36, 0.16, 0.22, 0.1, '#ffffff', flip);
    this.spheres.add(eyeX - 0.08 + face * 0.03, eyeY, 0.42, 0.07, 0.11, 0.05, '#111827', flip);
    this.spheres.add(eyeX + 0.12 + face * 0.03, eyeY, 0.42, 0.07, 0.11, 0.05, '#111827', flip);
    this.spheres.add(x - w * 0.25, y - h * 0.45 + step, 0.1, w * 0.4, 0.18, 0.4, '#3f2a14', flip);
    this.spheres.add(x + w * 0.25, y - h * 0.45 - step, 0.1, w * 0.4, 0.18, 0.4, '#3f2a14', flip);
    if (en.type === 'paratroopa') {
      const flap = Math.sin(frame * 0.4) * 0.4;
      this.blocks.add(x - face * w * 0.5, y + h * 0.1, -0.1, 0.08, 0.5, 0.35, '#ffffff', flap, 0, 0);
    }
    if (en.type === 'spiny') {
      for (let k = 0; k < 4; k++) {
        this.cones.add(x - w * 0.36 + k * w * 0.24, y + h * 0.4, 0, 0.16, 0.3, 0.16, '#f5f5f4');
      }
    }
    if (en.type === 'chuck') {
      this.spheres.add(x, y + h * 0.42, 0, w * 0.75, h * 0.35, w * 0.75, '#e5e7eb');
    }
  }

  private syncHero(world: WorldState, frame: number): boolean {
    const p = world.player;
    const blink = p.invulnTimer > 0 && Math.floor(frame / 3) % 2 === 0;
    this.hero.visible = !p.enteringCastle && !blink;
    if (!this.hero.visible) return false;

    const h = p.height * U;
    const x = toX(p.x + p.width / 2);
    const feet = toY(p.y + p.height);
    this.hero.position.set(x, feet, 0.2);
    // Mirar hacia donde avanza, con un leve giro hacia la cámara
    this.hero.rotation.set(0, p.facing === 1 ? Math.PI / 2 - 0.45 : -Math.PI / 2 + 0.45, 0);
    if ((p.slideTimer ?? 0) > 0) this.hero.rotation.z = p.facing === 1 ? -0.9 : 0.9;
    else if (p.wallDir) this.hero.rotation.z = p.wallDir * 0.25;

    const star = p.starTimer > 0;
    const starColor = `hsl(${(frame * 12) % 360}, 90%, 60%)`;
    const fire = p.powerState === 2;
    this.bodyMat.color.set(star ? starColor : fire ? '#ffffff' : '#dc2626');
    this.capMat.color.set(star ? starColor : fire ? '#ffffff' : '#dc2626');
    this.legMat.color.set(fire ? '#dc2626' : '#1d4ed8');

    // Proporciones según el tamaño (chico, grande o agachado)
    const unit = h / 1.0;
    const legH = unit * 0.34;
    const bodyH = unit * 0.32;
    const headR = Math.min(0.32, unit * 0.27);
    this.heroLegs.scale.set(1, legH / 0.4, 1);
    this.heroLegs.position.set(0, legH / 2, 0);
    this.heroBody.scale.set(1, bodyH / 0.4, 1);
    this.heroBody.position.set(0, legH + bodyH / 2, 0);
    const headY = legH + bodyH + headR * 0.9;
    this.heroHead.scale.setScalar(headR / 0.27);
    this.heroHead.position.set(0, headY, 0);
    this.heroCap.scale.setScalar(headR / 0.27);
    this.heroCap.position.set(0, headY + headR * 0.15, 0);
    this.heroBrim.position.set(0, headY + headR * 0.25, headR * 0.9);
    const nose = this.hero.getObjectByName('nose');
    const moustache = this.hero.getObjectByName('moustache');
    nose?.position.set(0, headY - headR * 0.05, headR * 1.0);
    moustache?.position.set(0, headY - headR * 0.4, headR * 0.85);
    // Brazos de la carrera: balanceo del cuerpo
    const running = p.onGround && Math.abs(p.vx) > 0.4;
    this.heroBody.rotation.x = running ? Math.sin(p.animTimer * 1.5) * 0.12 : 0;
    // Capa (World) detrás de la espalda
    this.heroCape.visible = p.powerState === 3;
    this.heroCape.position.set(0, legH + bodyH * 0.6, -0.35);
    this.heroCape.rotation.x = p.onGround ? 0.1 : -0.6;
    return true;
  }
}
