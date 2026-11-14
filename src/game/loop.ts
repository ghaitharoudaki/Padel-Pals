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
  /** When this returns true, the simulation keeps stepping while the tab is hidden (online host). */
  public keepAliveWhenHidden: () => boolean = () => false;
  private backgroundWorker: Worker | null = null;
  private lastFrameAt = 0;

  constructor(callbacks: LoopCallbacks, isSoftwareGl = false, renderer?: THREE.WebGLRenderer) {
    this.callbacks = callbacks;
    this.isSoftwareGl = isSoftwareGl;
    this.renderer = renderer;
  }

  /**
   * Browsers pause requestAnimationFrame in hidden tabs. A tiny worker timer (not throttled like
   * page timers) keeps fixed updates running so an online host doesn't freeze every client.
   */
  private startBackgroundTicker() {
    if (this.backgroundWorker || typeof Worker === 'undefined' || typeof Blob === 'undefined') return;
    try {
      const source = 'setInterval(function(){postMessage(0)},16);';
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      this.backgroundWorker = new Worker(url);
      URL.revokeObjectURL(url);
      this.backgroundWorker.onmessage = () => this.backgroundTick();
    } catch {
      this.backgroundWorker = null;
    }
  }

  private backgroundTick() {
    if (!this.running) return;
    const now = performance.now();
    // Only step when rAF has stalled (hidden tab) and the owner wants it.
    if (now - this.lastFrameAt < 250 || !this.keepAliveWhenHidden()) return;
    const frameTime = Math.min((now - this.lastTime) / 1000, MAX_ACCUMULATOR);
    this.lastTime = now;
    this.accumulator += frameTime;
    while (this.accumulator >= FIXED_TIMESTEP) {
      this.callbacks.fixedUpdate(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
    }
  }

  public start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;
    this.accumulator = 0;
    this.lastFrameAt = this.lastTime;
    this.startBackgroundTicker();
    this.tick();
  }

  public stop() {
    this.running = false;
    this.backgroundWorker?.terminate();
    this.backgroundWorker = null;
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
    this.lastFrameAt = now;

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

    this.frameId = requestAnimationFrame(this.tick);
  };
}
