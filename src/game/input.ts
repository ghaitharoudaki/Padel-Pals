import * as THREE from 'three';
import { AimTargetZone, HitQuality, ShotType, Vector3D } from './types';

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

  public getMovementInput(): { x: number; z: number; sprint: boolean } {
    if (!this.isEnabled) {
      return { x: 0, z: 0, sprint: false };
    }
    let x = this.virtualStick.x;
    let z = this.virtualStick.z;

    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) z += 1;
    if (this.keys['w'] || this.keys['arrowup']) z -= 1;

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
    const move = this.getMovementInput();
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
    this.currentAim.x += (targetPos.x - this.currentAim.x) * lerpRate;
    this.currentAim.z += (targetPos.z - this.currentAim.z) * lerpRate;
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
    if (this.keys['control'] || this.keys['ctrl']) {
      return 'drop';
    }
    if (this.keys['shift']) {
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
    const targetAim = AIM_ZONES[zone];

    const intent: SwingIntent = {
      shot: forceShot || 'flat',
      power,
      bias: { x: targetAim.x * 0.4, z: targetAim.z * 0.2 },
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
  private handleMouseDown = (e: MouseEvent) => {
    if (!this.isEnabled) return;
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
    if (!this.isEnabled) return;
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
    e.preventDefault();
  };

  private attach() {
    if (typeof window !== 'undefined') {
      window.addEventListener('mousedown', this.handleMouseDown);
      window.addEventListener('mouseup', this.handleMouseUp);
      window.addEventListener('contextmenu', this.handleContextMenu);
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
    }
  }

  public dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousedown', this.handleMouseDown);
      window.removeEventListener('mouseup', this.handleMouseUp);
      window.removeEventListener('contextmenu', this.handleContextMenu);
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
    }
  }
}
