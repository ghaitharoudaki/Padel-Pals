import * as THREE from 'three';
import { AimTargetZone, ShotType, Side, Vector3D } from '../types';
import {
  ControlAction,
  KeyBindings,
  SHOT_ACTIONS,
  SHOT_FOR_ACTION,
  buildCodeMap,
  getBindings,
  subscribeBindings,
} from './controls';

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
  /** Actions currently held down (movement, sprint, shot buttons). */
  private held = new Set<ControlAction>();
  private codeMap: Map<string, ControlAction> = buildCodeMap(getBindings());
  private unsubscribeBindings: (() => void) | null = null;
  private isCharging = false;
  /** Which shot button started the current charge and the shot it will play. */
  private chargeAction: ControlAction | null = null;
  private chargeShot: ShotType | undefined = undefined;
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
    this.unsubscribeBindings = subscribeBindings((b) => this.setBindings(b));
    this.attach();
  }

  /** Apply a new key layout. Held keys are released so nothing stays stuck. */
  public setBindings(bindings: KeyBindings) {
    this.codeMap = buildCodeMap(bindings);
    this.held.clear();
  }

  private resetCharge() {
    this.isCharging = false;
    this.chargeAction = null;
    this.chargeShot = undefined;
    this.currentChargePower = 0.65;
    this.config.onChargeChange(0.65);
  }

  private beginCharge(action: ControlAction | null, shot: ShotType | undefined) {
    this.isCharging = true;
    this.chargeAction = action;
    this.chargeShot = shot;
    this.chargeStartTime = performance.now();
    this.currentChargePower = 0.5;
    this.config.onChargeChange(this.currentChargePower);
  }

  private releaseCharge(minPower: number) {
    const shot = this.chargeShot;
    const power = Math.max(minPower, this.currentChargePower);
    this.resetCharge();
    this.triggerHit(power, shot);
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.held.clear();
      this.isCharging = false;
      this.chargeAction = null;
      this.chargeShot = undefined;
      this.currentChargePower = 0.65;
      this.virtualStick = { x: 0, z: 0 };
    }
  }

  /** Actions currently held, e.g. { moveUp: true, sprint: true }. */
  public getKeys(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    this.held.forEach((a) => (out[a] = true));
    return out;
  }

  /** Shot the current charge will play (`undefined` = context drive). */
  public getChargeShot(): ShotType | undefined {
    return this.chargeShot;
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
    if (this.held.has('moveRight')) x += 1;
    if (this.held.has('moveLeft')) x -= 1;
    if (this.held.has('moveDown')) z += 1;
    if (this.held.has('moveUp')) z -= 1;
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

    const sprint = this.held.has('sprint');
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

    if (move.x < -0.25) {
      col = 'left';
    } else if (move.x > 0.25) {
      col = 'right';
    }

    if (move.z > 0.25) {
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
   * Context shot for the drive button (no modifier keys - every special shot has its own button):
   * bajada off the back glass, smash on a high ball, topspin when charged, otherwise flat.
   */
  public determineShotType(isOverheadOrJumping: boolean, isBajadaEligible: boolean): ShotType {
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
    this.beginCharge(null, undefined);
  }

  public releaseTouchCharge(forceShot?: ShotType) {
    if (!this.isEnabled) return;
    if (forceShot) this.chargeShot = forceShot;
    this.releaseCharge(0.6);
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
      if (!this.isCharging) this.beginCharge(null, undefined);
    } else if (e.button === 2) {
      this.triggerHit(0.95, 'smash');
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this.isEnabled || this.isEmulatedMouse()) return;
    if (e.button === 0 && this.isCharging && this.chargeAction === null) {
      this.releaseCharge(0.55);
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
    // Leave browser shortcuts (Ctrl+R, Cmd+W, ...) alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const action = this.codeMap.get(e.code);
    if (!action) return;
    e.preventDefault();
    this.held.add(action);
    if (e.repeat) return;

    if (action === 'jump') {
      this.config.onJumpRequest?.();
      return;
    }

    if (SHOT_ACTIONS.includes(action)) {
      const shot = SHOT_FOR_ACTION[action];
      if (!this.isCharging) {
        this.beginCharge(action, shot);
      } else {
        // Switching buttons mid-charge changes the shot but keeps the charge (Top Spin style).
        this.chargeAction = action;
        this.chargeShot = shot;
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (!this.isEnabled) {
      this.held.clear();
      return;
    }

    const action = this.codeMap.get(e.code);
    if (!action) return;
    e.preventDefault();

    // Another key bound to the same action may still be down; that's rare enough to ignore.
    this.held.delete(action);

    if (this.isCharging && action === this.chargeAction) {
      this.releaseCharge(0.55);
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    if (this.isGameSurface(e.target)) e.preventDefault();
  };

  /** Release everything when the window loses focus so keys never get "stuck". */
  private handleBlur = () => {
    this.held.clear();
    if (this.isCharging) {
      this.resetCharge();
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
    this.unsubscribeBindings?.();
    this.unsubscribeBindings = null;
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
