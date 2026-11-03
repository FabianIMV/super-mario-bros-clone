// ============================================================================
// Puente entre expo-gl y three.js para el modo Dimensión.
// three.js espera un <canvas>; en React Native le damos un objeto mínimo que
// expone el contexto GL de expo-gl. Si algo falla al crear o dibujar, quien
// lo usa (GameView) vuelve al renderer 2D de Skia: el juego nunca se rompe.
// ============================================================================
import * as THREE from 'three';
import type { WorldState } from '../engine/types';
import { World3DScene } from './scene3d';

/** Lo mínimo de expo-gl que usamos (evita importar tipos nativos en Node). */
export interface ExpoGLContext extends WebGLRenderingContext {
  endFrameEXP(): void;
}

export class GL3DRenderer {
  readonly scene3d = new World3DScene();
  private readonly renderer: THREE.WebGLRenderer;

  constructor(private readonly gl: ExpoGLContext) {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const fakeCanvas = {
      width,
      height,
      style: {},
      clientWidth: width,
      clientHeight: height,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      getContext: () => gl,
    } as unknown as HTMLCanvasElement;

    this.renderer = new THREE.WebGLRenderer({
      canvas: fakeCanvas,
      context: gl,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
  }

  /** Dibuja el mundo. screenW/screenH en puntos (para el encuadre). */
  render(world: WorldState, screenW: number, screenH: number): void {
    this.scene3d.sync(world, screenW, screenH);
    this.renderer.render(this.scene3d.scene, this.scene3d.camera);
    this.gl.endFrameEXP();
  }

  projectToScreen(px: number, py: number, screenW: number, screenH: number): { x: number; y: number } {
    return this.scene3d.projectToScreen(px, py, screenW, screenH);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
