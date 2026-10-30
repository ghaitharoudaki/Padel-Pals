import * as THREE from 'three';

/**
 * Fixed-Timestep Game Loop (60 Hz physics, deterministic simulation)
 */

export const FIXED_TIMESTEP = 1 / 60; // 60 Hz physics step (16.667ms)
const MAX_ACCUMULATOR = 0.2; // Avoid spiral of death when tab is backgrounded

export interface LoopCallbacks {
  fixedUpdate: (fixedDt: number) => void;
  render: (alpha: number, dt: number) => void;
}

export class FixedTimestepLoop {
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private frameId = 0;
  private callbacks: LoopCallbacks;
  private isSoftwareGl: boolean;
  private renderer?: THREE.WebGLRenderer;
  private frameCount = 0;
  private lastFpsUpdate = 0;
  public currentFps = 60;

  constructor(callbacks: LoopCallbacks, isSoftwareGl = false, renderer?: THREE.WebGLRenderer) {
    this.callbacks = callbacks;
    this.isSoftwareGl = isSoftwareGl;
    this.renderer = renderer;
  }

  public start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;
    this.accumulator = 0;
    this.tick();
  }

  public stop() {
    this.running = false;
    if (this.frameId) {
      if (this.isSoftwareGl) {
        clearTimeout(this.frameId);
      } else {
        cancelAnimationFrame(this.frameId);
      }
      this.frameId = 0;
    }
  }

  private tick = () => {
    if (!this.running) return;

    const now = performance.now();
    const frameTime = Math.min((now - this.lastTime) / 1000, MAX_ACCUMULATOR);
    this.lastTime = now;

    // Track FPS
    this.frameCount++;
    if (now - this.lastFpsUpdate >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    this.accumulator += frameTime;

    // Run fixed 60Hz physics steps
    while (this.accumulator >= FIXED_TIMESTEP) {
      this.callbacks.fixedUpdate(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
    }

    // Alpha for rendering interpolation (0 to 1)
    const alpha = this.accumulator / FIXED_TIMESTEP;
    this.callbacks.render(alpha, frameTime);

    if (this.isSoftwareGl && this.renderer) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    if (!this.renderer) {
      this.frameId = window.setTimeout(cb, 16);
      return;
    }
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 4);
      } else {
        gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 16);
      }
    };
    this.frameId = window.setTimeout(poll, 4);
  }
}
