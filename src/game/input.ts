import * as THREE from 'three';
import { HitQuality, ShotType, Vector3D } from './types';

export interface SwingIntent {
  shot: ShotType;
  power: number;
  bias: { x: number; z: number };
  isJumpHit: boolean;
}

export interface InputManagerConfig {
  mountElement: HTMLElement;
  camera: THREE.Camera;
  onSwing: (intent: SwingIntent) => void;
  onChargeChange: (power: number) => void;
  onAimChange: (aim: Vector3D) => void;
  onToggleDebug: () => void;
  onJumpRequest?: () => void;
}

export class InputManager {
  private config: InputManagerConfig;
  private keys: Record<string, boolean> = {};
  private isCharging = false;
  private chargeStartTime = 0;
  private currentChargePower = 0.65;
  private mouseAim: Vector3D = { x: 0, y: 0, z: -6.0 };
  private raycaster = new THREE.Raycaster();
  private mouse2D = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private intersectPoint = new THREE.Vector3();

  constructor(config: InputManagerConfig) {
    this.config = config;
    this.attach();
  }

  public getKeys(): Record<string, boolean> {
    return this.keys;
  }

  public getMovementInput(): { x: number; z: number; sprint: boolean } {
    let x = 0;
    let z = 0;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) z += 1;
    if (this.keys['w'] || this.keys['arrowup']) z -= 1;

    // Normalize diagonal movement
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }

    const sprint = !!this.keys['shift'];
    return { x, z, sprint };
  }

  public getMouseAim(): Vector3D {
    return this.mouseAim;
  }

  public getIsCharging(): boolean {
    return this.isCharging;
  }

  public getChargePower(): number {
    return this.currentChargePower;
  }

  public update(now: number) {
    if (this.isCharging) {
      const elapsed = (now - this.chargeStartTime) / 1000;
      this.currentChargePower = Math.min(1.0, 0.50 + elapsed * 1.1);
      this.config.onChargeChange(this.currentChargePower);
    }
  }

  private handlePointerMove = (e: MouseEvent) => {
    const rect = this.config.mountElement.getBoundingClientRect();
    this.mouse2D.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse2D.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse2D, this.config.camera);
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectPoint)) {
      this.mouseAim = {
        x: Math.max(-4.4, Math.min(4.4, this.intersectPoint.x)),
        y: 0,
        z: Math.max(-9.2, Math.min(-1.0, this.intersectPoint.z)),
      };
      this.config.onAimChange(this.mouseAim);
    }
  };

  /**
   * Determine shot type based on modifiers:
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

  private triggerHit(power: number) {
    const biasX =
      (this.keys['d'] || this.keys['arrowright'] ? 1 : 0) -
      (this.keys['a'] || this.keys['arrowleft'] ? 1 : 0);
    const biasZ =
      (this.keys['w'] || this.keys['arrowup'] ? 1 : 0) -
      (this.keys['s'] || this.keys['arrowdown'] ? 1 : 0);

    const intent: SwingIntent = {
      shot: 'flat', // will be contextualized by App.tsx with ball height
      power,
      bias: { x: biasX, z: biasZ },
      isJumpHit: false,
    };

    this.config.onSwing(intent);
  }

  private handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      // Left click charge swing
      this.isCharging = true;
      this.chargeStartTime = performance.now();
      this.currentChargePower = 0.50;
      this.config.onChargeChange(this.currentChargePower);
    } else if (e.button === 2) {
      // Right click instant smash / spike
      this.config.onSwing({
        shot: 'smash',
        power: 0.95,
        bias: {
          x: (this.keys['d'] ? 1 : 0) - (this.keys['a'] ? 1 : 0),
          z: (this.keys['w'] ? 1 : 0) - (this.keys['s'] ? 1 : 0),
        },
        isJumpHit: true,
      });
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0 && this.isCharging) {
      this.isCharging = false;
      const power = Math.max(0.55, this.currentChargePower);
      this.triggerHit(power);
      this.currentChargePower = 0.65;
      this.config.onChargeChange(0.65);
    }
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    this.keys[key] = true;
    if (e.key === 'Shift') this.keys['shift'] = true;
    if (e.key === 'Control') this.keys['control'] = true;

    // F3 toggles debug overlay
    if (e.code === 'F3') {
      e.preventDefault();
      this.config.onToggleDebug();
      return;
    }

    // Spacebar: ONE hit button (hold to charge, release to strike)
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      this.isCharging = true;
      this.chargeStartTime = performance.now();
      this.currentChargePower = 0.50;
      this.config.onChargeChange(this.currentChargePower);
    }

    // J or E key triggers jump for smashes
    if ((key === 'j' || key === 'e') && !e.repeat) {
      e.preventDefault();
      this.config.onJumpRequest?.();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
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
    window.addEventListener('mousemove', this.handlePointerMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  public dispose() {
    window.removeEventListener('mousemove', this.handlePointerMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }
}
