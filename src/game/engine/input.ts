import * as THREE from 'three';
import { AimTargetZone, HitQuality, ShotType, Side, Vector3D } from '../types';

export interface SwingIntent {
  shot: ShotType;
  power: number;
  bias: { x: number; z: number };
  targetZone: AimTargetZone;
  targetAim: Vector3D;
  isJumpHit: boolean;
}

export interface InputManagerConfig {
  mountElement?: HTMLElement | null;
  camera: THREE.Camera;
  onSwing: (intent: SwingIntent) => void;
  onChargeChange: (power: number) => void;
  onAimChange: (aim: Vector3D) => void;
  onToggleDebug: () => void;
  onJumpRequest?: () => void;
}

/**
 * 3x2 Opponent Court Aiming Grid Coordinates (North Side, Z < 0)
 * Left / Center / Right  x  Short / Deep
 * Default when no direction is pressed: Center-Deep
 */
export const AIM_ZONES: Record<AimTargetZone, Vector3D> = {
  left_deep: { x: -2.5, y: 0, z: -7.5 },
  center_deep: { x: 0.0, y: 0, z: -7.5 }, // Default safe deep drive
  right_deep: { x: 2.5, y: 0, z: -7.5 },
  left_short: { x: -2.5, y: 0, z: -3.2 },
  center_short: { x: 0.0, y: 0, z: -3.2 },
  right_short: { x: 2.5, y: 0, z: -3.2 },
};

export class InputManager {
  private config: InputManagerConfig;
  public isEnabled = false;
  private keys: Record<string, boolean> = {};
  private isCharging = false;
  private chargeStartTime = 0;
  private currentChargePower = 0.65;

  // Snapped directional aim & smooth interpolated floor marker
  private targetZone: AimTargetZone = 'center_deep';
  private currentAim: Vector3D = { x: 0, y: 0, z: -7.5 };

  // Virtual touch stick & buttons for mobile support
  private virtualStick = { x: 0, z: 0 };
  private playerSide: Side = 'south';

  constructor(config: InputManagerConfig) {
    this.config = config;
    this.attach();
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.keys = {};
      this.isCharging = false;
      this.currentChargePower = 0.65;
      this.virtualStick = { x: 0, z: 0 };
    }
  }

  public getKeys(): Record<string, boolean> {
    return this.keys;
  }

  public setVirtualStick(x: number, z: number) {
    this.virtualStick.x = x;
    this.virtualStick.z = z;
  }

  public setPlayerSide(side: Side) {
    if (side === this.playerSide) return;
    this.playerSide = side;
    this.currentAim.z *= -1;
    this.currentAim.x *= -1;
  }

  /** Screen-relative stick: x = right, z = down/back (towards the camera). */
  private getRawStick(): { x: number; z: number } {
    let x = this.virtualStick.x;
    let z = this.virtualStick.z;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) z += 1;
    if (this.keys['w'] || this.keys['arrowup']) z -= 1;
    return { x, z };
  }

  /** World-space movement for the local player (camera sits behind the player's baseline). */
  public getMovementInput(): { x: number; z: number; sprint: boolean } {
    if (!this.isEnabled) {
      return { x: 0, z: 0, sprint: false };
    }
    let { x, z } = this.getRawStick();
    if (this.playerSide === 'north') {
      // Camera looks down +Z from behind the north baseline, so both axes are mirrored.
      x *= -1;
      z *= -1;
    }

    // Normalize diagonal movement
    const len = Math.hypot(x, z);
    if (len > 1.0) {
      x /= len;
      z /= len;
    }

    const sprint = !!this.keys['shift'];
    return { x, z, sprint };
  }

  /**
   * Determine 3x2 Grid Target Zone from held directional inputs:
   * Horizontal: Left (A / Left) | Center (none) | Right (D / Right)
   * Depth: Short (S / Down / Stick back) | Deep (W / Up / none -> Default Deep)
   */
  public getTargetZone(): AimTargetZone {
    const move = this.isEnabled ? this.getRawStick() : { x: 0, z: 0 };
    let col: 'left' | 'center' | 'right' = 'center';
    let row: 'short' | 'deep' = 'deep'; // Default is center-deep

    if (move.x < -0.25 || this.keys['a'] || this.keys['arrowleft']) {
      col = 'left';
    } else if (move.x > 0.25 || this.keys['d'] || this.keys['arrowright']) {
      col = 'right';
    }

    if (move.z > 0.25 || this.keys['s'] || this.keys['arrowdown']) {
      row = 'short';
    } else {
      row = 'deep'; // W, Up Arrow, or neutral defaults to deep
    }

    return `${col}_${row}` as AimTargetZone;
  }

  public getAim(): Vector3D {
    return { ...this.currentAim };
  }

  public getIsCharging(): boolean {
    return this.isCharging;
  }

  public getChargePower(): number {
    return this.currentChargePower;
  }

  /**
   * Called every frame in game loop:
   * - Evaluates target zone from directional inputs
   * - Smoothly snaps target marker between zones
   * - Emits onAimChange to update court floor visual target
   */
  public update(now: number, dt: number = 0.016) {
    if (!this.isEnabled) return;

    if (this.isCharging) {
      const elapsed = (now - this.chargeStartTime) / 1000;
      this.currentChargePower = Math.min(1.0, 0.50 + elapsed * 1.15);
      this.config.onChargeChange(this.currentChargePower);
    }

    // Determine discrete 3x2 target zone
    this.targetZone = this.getTargetZone();
    const targetPos = AIM_ZONES[this.targetZone];

    // Smooth snappy interpolation between court zones
    const lerpRate = Math.min(1.0, dt * 14.0);
    const sideTargetX = this.playerSide === 'south' ? targetPos.x : -targetPos.x;
    this.currentAim.x += (sideTargetX - this.currentAim.x) * lerpRate;
    const sideTargetZ = this.playerSide === 'south' ? targetPos.z : -targetPos.z;
    this.currentAim.z += (sideTargetZ - this.currentAim.z) * lerpRate;
    this.currentAim.y = 0;

    this.config.onAimChange(this.currentAim);
  }

  /**
   * Determine shot type based on key shortcuts:
   * - Shift held: Lob
   * - Ctrl held: Drop shot
   * - Jump / overhead: Smash
   */
  public determineShotType(isOverheadOrJumping: boolean, isBajadaEligible: boolean): ShotType {
    // Q = lob, F = drop shot. (Shift is sprint and Ctrl+W would close the tab, so neither is used.)
    if (this.keys['f']) {
      return 'drop';
    }
    if (this.keys['q']) {
      return 'lob';
    }
    if (isBajadaEligible) {
      return 'bajada';
    }
    if (isOverheadOrJumping) {
      return 'smash';
    }
    return this.currentChargePower > 0.75 ? 'topspin' : 'flat';
  }

  public triggerHit(power: number, forceShot?: ShotType) {
    if (!this.isEnabled) return;
    const zone = this.getTargetZone();
    // Use currentAim coordinates so the shot target matches the visual floor reticle exactly
    const targetAim = { ...this.currentAim };

    const intent: SwingIntent = {
      shot: forceShot || 'flat',
      power,
      bias: { x: 0, z: 0 },
      targetZone: zone,
      targetAim,
      isJumpHit: false,
    };

    this.config.onSwing(intent);
  }

  // Mobile / Touch controls API
  public startTouchCharge() {
    if (!this.isEnabled) return;
    this.isCharging = true;
    this.chargeStartTime = performance.now();
    this.currentChargePower = 0.50;
    this.config.onChargeChange(this.currentChargePower);
  }

  public releaseTouchCharge(forceShot?: ShotType) {
    if (!this.isEnabled) return;
    this.isCharging = false;
    const power = Math.max(0.60, this.currentChargePower);
    this.triggerHit(power, forceShot);
    this.currentChargePower = 0.65;
    this.config.onChargeChange(0.65);
  }

  public triggerTouchLob() {
    if (!this.isEnabled) return;
    this.triggerHit(0.75, 'lob');
  }

  // Mouse click handling: Left click charges / hits, right click instant smash
  // Mouse position does NOT aim the ball
  private isGameSurface(target: EventTarget | null): boolean {
    const mount = this.config.mountElement;
    if (!mount || !(target instanceof Node)) return true;
    return mount.contains(target);
  }

  /** Browsers emulate mouse events after a touch; touch play uses the on-screen buttons instead. */
  private lastTouchAt = 0;
  private handleTouchStart = () => {
    this.lastTouchAt = performance.now();
  };
  private isEmulatedMouse(): boolean {
    return performance.now() - this.lastTouchAt < 1000;
  }

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.isEnabled || !this.isGameSurface(e.target) || this.isEmulatedMouse()) return;
    if (e.button === 0) {
      this.isCharging = true;
      this.chargeStartTime = performance.now();
      this.currentChargePower = 0.50;
      this.config.onChargeChange(this.currentChargePower);
    } else if (e.button === 2) {
      this.triggerHit(0.95, 'smash');
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this.isEnabled || this.isEmulatedMouse()) return;
    if (e.button === 0 && this.isCharging) {
      this.isCharging = false;
      const power = Math.max(0.55, this.currentChargePower);
      this.triggerHit(power);
      this.currentChargePower = 0.65;
      this.config.onChargeChange(0.65);
    }
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'F3') {
      e.preventDefault();
      this.config.onToggleDebug();
      return;
    }

    if (!this.isEnabled) return;
    const targetEl = e.target as HTMLElement | null;
    if (targetEl && (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA' || targetEl.isContentEditable)) {
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }

    const key = e.key.toLowerCase();
    this.keys[key] = true;
    if (e.key === 'Shift') this.keys['shift'] = true;
    if (e.key === 'Control') this.keys['control'] = true;

    // Spacebar: hit button (hold to charge, release to strike)
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      this.isCharging = true;
      this.chargeStartTime = performance.now();
      this.currentChargePower = 0.50;
      this.config.onChargeChange(this.currentChargePower);
    }

    // J or E triggers jump for smash
    if ((key === 'j' || key === 'e') && !e.repeat) {
      e.preventDefault();
      this.config.onJumpRequest?.();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (!this.isEnabled) {
      this.keys = {};
      return;
    }

    const key = e.key.toLowerCase();
    this.keys[key] = false;
    if (e.key === 'Shift') this.keys['shift'] = false;
    if (e.key === 'Control') this.keys['control'] = false;

    if (e.code === 'Space') {
      e.preventDefault();
      if (this.isCharging) {
        this.isCharging = false;
        const power = Math.max(0.55, this.currentChargePower);
        this.triggerHit(power);
        this.currentChargePower = 0.65;
        this.config.onChargeChange(0.65);
      }
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    if (this.isGameSurface(e.target)) e.preventDefault();
  };

  /** Release everything when the window loses focus so keys never get "stuck". */
  private handleBlur = () => {
    this.keys = {};
    if (this.isCharging) {
      this.isCharging = false;
      this.currentChargePower = 0.65;
      this.config.onChargeChange(0.65);
    }
    this.virtualStick = { x: 0, z: 0 };
  };

  private attach() {
    if (typeof window !== 'undefined') {
      window.addEventListener('mousedown', this.handleMouseDown);
      window.addEventListener('mouseup', this.handleMouseUp);
      window.addEventListener('contextmenu', this.handleContextMenu);
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
      window.addEventListener('blur', this.handleBlur);
      window.addEventListener('touchstart', this.handleTouchStart, { capture: true, passive: true });
    }
  }

  public dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousedown', this.handleMouseDown);
      window.removeEventListener('mouseup', this.handleMouseUp);
      window.removeEventListener('contextmenu', this.handleContextMenu);
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('blur', this.handleBlur);
      window.removeEventListener('touchstart', this.handleTouchStart, { capture: true });
    }
  }
}
