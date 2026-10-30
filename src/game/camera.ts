import * as THREE from 'three';
import { Vector3D } from './types';

export class CameraController {
  public camera: THREE.PerspectiveCamera;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(56, aspect, 0.1, 140);
    this.camera.position.set(0, 11.4, 17.6);
    this.camera.lookAt(0, 0.9, -1.2);
  }

  public updateAspect(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  public update(dt: number, isMenu: boolean, p1Pos: Vector3D) {
    if (isMenu) {
      // 3D Preview stage framing on the right half of the screen
      const targetCamX = 0.5;
      const targetCamY = 2.4;
      const targetCamZ = 6.4;

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 4.0, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 4.0, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 4.0, dt);
      this.camera.lookAt(1.5, 1.15, 4.0);
    } else {
      // Active match: responsive wide baseline perspective
      const targetCamX = p1Pos.x * 0.12;
      const targetCamY = 11.4;
      const targetCamZ = 17.6;

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 4.0, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 4.0, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 4.0, dt);
      this.camera.lookAt(p1Pos.x * 0.08, 0.9, -1.2);
    }
  }
}
