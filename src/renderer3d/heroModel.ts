// ============================================================================
// MODELO 3D DEL PLOMERO (low-poly articulado)
// Zapatos, piernas y overol con tirantes y botones, camisa y brazos con
// guantes, cabeza con orejas, ojos, nariz y bigote, y gorra con visera y
// emblema. Brazos y piernas giran desde hombro y cadera para animar
// carrera, salto, barrida y deslizamiento por la pared.
// Medidas en "unidades de modelo": de pies (y=0) a la punta de la gorra ≈ 1.
// ============================================================================
import * as THREE from 'three';
import type { Player } from '../engine/types';

export interface HeroPalette {
  shirt: string;
  overalls: string;
  cap: string;
}

const SKIN = '#f6c9a0';
const SHOE = '#5a3317';
const GLOVE = '#ffffff';
const HAIR = '#3b2412';
const BUTTON = '#facc15';
const OUTLINE = '#140c1f';

export class HeroModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group(); // todo lo que se inclina
  private readonly hipL = new THREE.Group();
  private readonly hipR = new THREE.Group();
  private readonly shoulderL = new THREE.Group();
  private readonly shoulderR = new THREE.Group();
  private readonly headPivot = new THREE.Group();
  private readonly cape: THREE.Mesh;

  private readonly shirtMat: THREE.MeshToonMaterial;
  private readonly overallMat: THREE.MeshToonMaterial;
  private readonly capMat: THREE.MeshToonMaterial;

  constructor(gradientMap: THREE.Texture) {
    const toon = (color: string) => new THREE.MeshToonMaterial({ color, gradientMap });
    const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide, toneMapped: false });
    this.shirtMat = toon('#ef2b2d');
    this.overallMat = toon('#2b59d9');
    this.capMat = toon('#ef2b2d');
    const skin = toon(SKIN);
    const shoe = toon(SHOE);
    const glove = toon(GLOVE);
    const hair = toon(HAIR);
    const button = toon(BUTTON);
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const pupil = new THREE.MeshBasicMaterial({ color: '#1e3a8a', toneMapped: false });

    /** Malla con contorno oscuro (casco invertido un poco más grande). */
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, outline = true): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      if (outline) {
        const shell = new THREE.Mesh(geo, outlineMat);
        shell.scale.setScalar(1.1);
        m.add(shell);
      }
      return m;
    };

    // --- Piernas (pivote en la cadera) con zapatos ---
    for (const [hip, side] of [
      [this.hipL, -1],
      [this.hipR, 1],
    ] as Array<[THREE.Group, number]>) {
      hip.position.set(side * 0.1, 0.34, 0);
      const leg = part(new THREE.CapsuleGeometry(0.075, 0.16, 4, 8), this.overallMat);
      leg.position.y = -0.14;
      const foot = part(new THREE.SphereGeometry(0.1, 10, 8), shoe);
      foot.scale.set(1, 0.65, 1.45);
      foot.position.set(0, -0.3, 0.05);
      hip.add(leg, foot);
      this.body.add(hip);
    }

    // --- Torso: overol (barriga redonda) + camisa en el pecho ---
    const belly = part(new THREE.SphereGeometry(0.21, 14, 12), this.overallMat);
    belly.scale.set(1.12, 0.95, 1.0);
    belly.position.y = 0.45;
    const chest = part(new THREE.SphereGeometry(0.18, 14, 10), this.shirtMat);
    chest.scale.set(1.05, 0.7, 0.85);
    chest.position.y = 0.6;
    // Tirantes y botones del overol (solo por delante)
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.04), this.overallMat);
      strap.position.set(side * 0.09, 0.62, 0.15);
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), button);
      btn.position.set(side * 0.09, 0.54, 0.19);
      this.body.add(strap, btn);
    }
    this.body.add(belly, chest);

    // --- Brazos (pivote en el hombro) con guantes ---
    for (const [shoulder, side] of [
      [this.shoulderL, -1],
      [this.shoulderR, 1],
    ] as Array<[THREE.Group, number]>) {
      shoulder.position.set(side * 0.2, 0.64, 0);
      const arm = part(new THREE.CapsuleGeometry(0.055, 0.14, 4, 8), this.shirtMat);
      arm.position.y = -0.1;
      const hand = part(new THREE.SphereGeometry(0.075, 10, 8), glove);
      hand.position.y = -0.23;
      shoulder.add(arm, hand);
      this.body.add(shoulder);
    }

    // --- Cabeza ---
    // Proporciones "chibi": cabeza grande para que se lea a la distancia del juego
    this.headPivot.position.y = 0.84;
    this.headPivot.scale.setScalar(1.22);
    const head = part(new THREE.SphereGeometry(0.2, 16, 14), skin);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin);
    nose.position.set(0, -0.02, 0.2);
    const moustache = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), hair);
    moustache.rotation.z = Math.PI / 2;
    moustache.position.set(0, -0.08, 0.17);
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), hair);
    hairBack.scale.set(1, 0.7, 0.8);
    hairBack.position.set(0, -0.02, -0.06);
    this.headPivot.add(head, nose, moustache, hairBack);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), white);
      eye.scale.set(0.8, 1.2, 0.5);
      eye.position.set(side * 0.07, 0.05, 0.175);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), pupil);
      iris.position.set(side * 0.07, 0.05, 0.198);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin);
      ear.scale.set(0.6, 1, 0.8);
      ear.position.set(side * 0.2, 0, 0);
      this.headPivot.add(eye, iris, ear);
    }
    // Gorra: casquete + visera + emblema blanco
    const capDome = part(new THREE.SphereGeometry(0.215, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.capMat);
    capDome.position.y = 0.04;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), this.capMat);
    brim.position.set(0, 0.05, 0.13);
    brim.scale.set(1.1, 1, 1);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), white);
    emblem.position.set(0, 0.14, 0.18);
    emblem.rotation.x = -0.45;
    this.headPivot.add(capDome, brim, emblem);
    this.body.add(this.headPivot);

    // --- Capa (World) ---
    this.cape = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.03), toon('#facc15'));
    this.cape.position.set(0, 0.5, -0.2);
    this.body.add(this.cape);

    this.root.add(this.body);
  }

  /**
   * Coloca y anima el modelo.
   * @param heightUnits altura visible deseada en unidades 3D
   */
  update(p: Player, frame: number, x: number, feetY: number, heightUnits: number, palette: HeroPalette): void {
    this.shirtMat.color.set(palette.shirt);
    this.capMat.color.set(palette.cap);
    this.overallMat.color.set(palette.overalls);

    // Escala: el modelo mide ~1; el ancho se mantiene proporcionado al alto "de pie"
    const standing = p.mountedYoshi ? 52 : p.powerState > 0 ? 46 : 30;
    const base = (heightUnits * standing) / Math.max(1, p.height);
    const squash = p.height / standing; // agachado o barriéndose
    this.root.position.set(x, feetY, 0.2);
    this.root.scale.set(base, base * Math.max(0.55, squash), base);
    this.root.rotation.set(0, p.facing === 1 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5, 0);

    // Reiniciar pose
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.headPivot.rotation.set(0, 0, 0);
    this.hipL.rotation.set(0, 0, 0);
    this.hipR.rotation.set(0, 0, 0);
    this.shoulderL.rotation.set(0, 0, 0.15);
    this.shoulderR.rotation.set(0, 0, -0.15);

    const sliding = (p.slideTimer ?? 0) > 0;
    const speed = Math.min(1, Math.abs(p.vx) / 5.8);
    if (sliding) {
      // Barrida: cuerpo hacia atrás, piernas al frente
      this.body.rotation.x = -0.9;
      this.body.position.z = -0.1;
      this.hipL.rotation.x = -1.2;
      this.hipR.rotation.x = -1.0;
      this.shoulderL.rotation.x = -2.2;
      this.shoulderR.rotation.x = -2.0;
    } else if (p.wallDir) {
      // Deslizándose por la pared: una mano contra la pared, piernas recogidas
      this.shoulderR.rotation.set(-2.6, 0, -0.3);
      this.shoulderL.rotation.set(-0.4, 0, 0.5);
      this.hipL.rotation.x = -0.6;
      this.hipR.rotation.x = 0.3;
      this.headPivot.rotation.y = 0.4;
    } else if (!p.onGround) {
      // Salto: brazo arriba (puño al cielo) y piernas separadas
      const rising = p.vy < 0;
      this.shoulderR.rotation.x = rising ? -2.8 : -1.6;
      this.shoulderL.rotation.x = rising ? 0.6 : -0.8;
      this.hipL.rotation.x = -0.7;
      this.hipR.rotation.x = 0.45;
      this.body.rotation.x = rising ? 0.08 : -0.05;
    } else if (speed > 0.06) {
      // Carrera: brazos y piernas opuestos, cuerpo inclinado y rebote
      const t = p.animTimer * 1.7;
      const swing = Math.sin(t) * (0.5 + 0.6 * speed);
      this.hipL.rotation.x = swing;
      this.hipR.rotation.x = -swing;
      this.shoulderL.rotation.x = -swing * 0.9;
      this.shoulderR.rotation.x = swing * 0.9;
      this.body.rotation.x = 0.12 + 0.12 * speed;
      this.body.position.y = Math.abs(Math.cos(t)) * 0.035 * speed;
    } else {
      // Quieto: respiración suave
      const breath = Math.sin(frame * 0.06) * 0.012;
      this.body.position.y = breath;
      this.shoulderL.rotation.z = 0.15 + breath;
      this.shoulderR.rotation.z = -0.15 - breath;
    }
    if (p.throwPoseTimer > 0) this.shoulderR.rotation.x = -1.7; // lanzando llave o fuego

    this.cape.visible = p.powerState === 3;
    this.cape.rotation.x = p.onGround ? 0.15 : -0.7 - Math.sin(frame * 0.3) * 0.15;
  }
}
