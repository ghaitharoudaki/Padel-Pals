import * as THREE from 'three';
import { CameraPreset, Side, Vector3D } from './types';

export class CameraController {
  public camera: THREE.PerspectiveCamera;
  public preset: CameraPreset = 'broadcast';
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0;
  private menuOrbitAngle: number = 0.1;
  public mouseParallax: { x: number; y: number } = { x: 0, y: 0 };
  private isPushingIn: boolean = false;
  private pushInProgress: number = 0;
  private pushInDuration: number = 0.45;
  private pushInCallback: (() => void) | null = null;

  constructor(aspect: number) {
    // 54 FOV offers realistic broadcast depth and prevents fisheye warping
    this.camera = new THREE.PerspectiveCamera(54, aspect, 0.1, 150);
    this.camera.position.set(0.55, 1.65, 6.90);
    this.camera.lookAt(0.85, 1.05, 4.0);
  }

  public setMouseParallax(x: number, y: number) {
    this.mouseParallax.x = x;
    this.mouseParallax.y = y;
  }

  public setPreset(preset: CameraPreset) {
    this.preset = preset;
  }

  /**
   * Start smooth camera push-in towards the court when pressing PLAY
   */
  public startPlayPushIn(onComplete?: () => void) {
    this.isPushingIn = true;
    this.pushInProgress = 0;
    this.pushInCallback = onComplete || null;
  }

  public snapToMatchPreset() {
    this.isPushingIn = false;
    this.pushInProgress = 0;
    this.pushInCallback = null;

    let baseCamY = 8.4;
    let baseCamZ = 15.6;
    let targetLookY = 1.0;
    let targetLookZ = -1.2;

    if (this.preset === 'high') {
      baseCamY = 12.2;
      baseCamZ = 18.0;
      targetLookY = 0.8;
      targetLookZ = -1.5;
    } else if (this.preset === 'close') {
      baseCamY = 5.8;
      baseCamZ = 13.0;
      targetLookY = 1.2;
      targetLookZ = -1.0;
    }

    this.camera.position.set(0, baseCamY, baseCamZ);
    this.camera.lookAt(0, targetLookY, targetLookZ);
  }

  public snapToMenuOrbit() {
    this.isPushingIn = false;
    this.pushInProgress = 0;
    this.pushInCallback = null;
    this.menuOrbitAngle = 0.1;
    this.camera.position.set(0.55, 1.65, 6.90);
    this.camera.lookAt(0.85, 1.05, 4.0);
  }

  public updateAspect(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Trigger screen impulse / camera shake on smashes and sweetspot hits
   */
  public triggerShake(intensity: number = 0.35, duration: number = 0.22) {
    this.shakeIntensity = intensity;
    this.shakeDecay = duration > 0 ? intensity / duration : 10;
  }

  public update(
    dt: number,
    isMenu: boolean,
    p1Pos: Vector3D,
    ballPos?: Vector3D,
    playerSide: Side = 'south'
  ) {
    // Update shake decay
    let offsetX = 0;
    let offsetY = 0;
    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
      offsetX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      offsetY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
    }

    if (isMenu) {
      if (this.isPushingIn) {
        // Smooth camera push-in surge towards the court
        this.pushInProgress += dt;
        const progress = Math.min(1.0, this.pushInProgress / this.pushInDuration);
        const ease = progress * progress * (3.0 - 2.0 * progress); // smoothstep

        const startX = 0.55;
        const startY = 1.65;
        const startZ = 6.90;
        const endX = 0.0;
        const endY = 2.4;
        const endZ = 3.6;

        this.camera.position.x = THREE.MathUtils.lerp(startX, endX, ease);
        this.camera.position.y = THREE.MathUtils.lerp(startY, endY, ease);
        this.camera.position.z = THREE.MathUtils.lerp(startZ, endZ, ease);

        const lookX = THREE.MathUtils.lerp(0.85, 0.0, ease);
        const lookY = THREE.MathUtils.lerp(1.05, 1.1, ease);
        const lookZ = THREE.MathUtils.lerp(4.0, 0.0, ease);
        this.camera.lookAt(lookX, lookY, lookZ);

        if (this.pushInProgress >= this.pushInDuration && this.pushInCallback) {
          const cb = this.pushInCallback;
          this.pushInCallback = null;
          this.isPushingIn = false;
          cb();
        }
      } else {
        // Slow, soothing orbit/sway around the character and court at golden hour
        this.menuOrbitAngle += dt * 0.055;
        const swayX = Math.sin(this.menuOrbitAngle) * 0.35;
        const swayY = Math.sin(this.menuOrbitAngle * 0.75) * 0.12;
        const swayZ = Math.cos(this.menuOrbitAngle) * 0.28;

        const parallaxX = this.mouseParallax.x * 0.22;
        const parallaxY = this.mouseParallax.y * 0.16;

        const targetCamX = 0.55 + swayX + parallaxX + offsetX;
        const targetCamY = 1.65 + swayY + parallaxY + offsetY;
        const targetCamZ = 6.90 + swayZ;

        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 4.0, dt);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 4.0, dt);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 4.0, dt);
        this.camera.lookAt(0.85, 1.05, 4.0);
      }
    } else {
      // Active match framing based on camera preset:
      // 'broadcast' = Elevated TV broadcast view behind baseline, smoothly following ball
      // 'high' = High tactical stadium overview
      // 'close' = Close dynamic action view
      let baseCamY = 8.4;
      let baseCamZ = 15.6;
      let targetLookY = 1.0;
      let targetLookZ = -1.2;

      if (this.preset === 'high') {
        baseCamY = 12.2;
        baseCamZ = 18.0;
        targetLookY = 0.8;
        targetLookZ = -1.5;
      } else if (this.preset === 'close') {
        baseCamY = 5.8;
        baseCamZ = 13.0;
        targetLookY = 1.2;
        targetLookZ = -1.0;
      }

      // Smoothly follow ball and player horizontally
      const bX = ballPos ? ballPos.x : 0;
      const targetCamX = p1Pos.x * 0.15 + bX * 0.25 + offsetX;
      const targetCamY = baseCamY + offsetY;
      const sideSign = playerSide === 'south' ? 1 : -1;
      const targetCamZ = baseCamZ * sideSign;

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 4.5, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 4.5, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 4.5, dt);

      const lookTargetX = p1Pos.x * 0.1 + bX * 0.2;
      this.camera.lookAt(lookTargetX, targetLookY, targetLookZ * sideSign);
    }
  }
}
