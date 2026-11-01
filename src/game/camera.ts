import * as THREE from 'three';
import { CameraPreset, Vector3D } from './types';

export class CameraController {
  public camera: THREE.PerspectiveCamera;
  public preset: CameraPreset = 'broadcast';
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0;
  private menuOrbitAngle: number = 0.2;
  public mouseParallax: { x: number; y: number } = { x: 0, y: 0 };

  constructor(aspect: number) {
    // 54 FOV offers realistic broadcast depth and prevents fisheye warping
    this.camera = new THREE.PerspectiveCamera(54, aspect, 0.1, 150);
    this.camera.position.set(0, 8.4, 15.6);
    this.camera.lookAt(0, 1.0, -1.5);
  }

  public setMouseParallax(x: number, y: number) {
    this.mouseParallax.x = x;
    this.mouseParallax.y = y;
  }

  public setPreset(preset: CameraPreset) {
    this.preset = preset;
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

  public update(dt: number, isMenu: boolean, p1Pos: Vector3D, ballPos?: Vector3D) {
    // Update shake decay
    let offsetX = 0;
    let offsetY = 0;
    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
      offsetX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      offsetY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
    }

    if (isMenu) {
      // Live 3D court at golden hour with slowly orbiting camera and mouse parallax
      this.menuOrbitAngle += dt * 0.14;
      const targetCamX = 1.4 + Math.sin(this.menuOrbitAngle) * 1.6 + this.mouseParallax.x * 0.7 + offsetX;
      const targetCamY = 2.4 + Math.sin(this.menuOrbitAngle * 0.7) * 0.3 + this.mouseParallax.y * 0.4 + offsetY;
      const targetCamZ = 4.2 + Math.cos(this.menuOrbitAngle) * 2.2;

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 3.5, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 3.5, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 3.5, dt);
      this.camera.lookAt(1.5, 1.15, 4.0);
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
      const targetCamZ = baseCamZ;

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 4.5, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 4.5, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 4.5, dt);

      const lookTargetX = p1Pos.x * 0.1 + bX * 0.2;
      this.camera.lookAt(lookTargetX, targetLookY, targetLookZ);
    }
  }
}
