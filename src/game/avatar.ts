import * as THREE from 'three';
import {
  EyeType,
  EyebrowType,
  HairStyle,
  HeadwearType,
  JerseyStyle,
  MouthType,
  PlayerAppearance,
  PlayerCustomization,
  RacketPattern,
  ShotType,
  Side,
  SwingSide,
} from './types';

export interface AvatarController {
  group: THREE.Group;
  racketGroup: THREE.Group;
  applyAppearance: (app: PlayerAppearance) => void;
  updateKinematics: (
    dt: number,
    velocity: { x: number; z: number },
    swingProgress: number,
    isSwinging: boolean,
    shotType: ShotType,
    targetFacingAngle: number,
    ballPos?: { x: number; y: number; z: number },
    swingSide?: SwingSide
  ) => void;
  updateMenuIdle: (
    dt: number,
    timeSeconds: number,
    ballBouncePhase: number,
    mouseParallax: { x: number; y: number }
  ) => void;
  triggerHitPop: () => void;
  triggerDustPuff: () => void;
  playStateAnimation: (state: 'celebrate' | 'sad' | 'idle' | 'ready') => void;
  setVisible: (visible: boolean) => void;
  appearance: PlayerAppearance;
}

// Global cached toon gradient map texture (4-step cel-shading)
let sharedToonGradient: THREE.Texture | null = null;

function createFallbackTexture(): THREE.CanvasTexture {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    return new THREE.CanvasTexture(c);
  }
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) as unknown as THREE.CanvasTexture;
  tex.needsUpdate = true;
  return tex;
}

export function getSharedToonGradient(): THREE.Texture {
  if (sharedToonGradient) return sharedToonGradient;
  if (typeof document === 'undefined') {
    const data = new Uint8Array([82, 82, 91, 255, 113, 113, 122, 255, 161, 161, 170, 255, 255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 4, 1);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    sharedToonGradient = tex;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  // 4 discrete cel tone steps: shadow, mid1, mid2, bright highlight
  const steps = ['#52525b', '#71717a', '#a1a1aa', '#ffffff'];
  steps.forEach((c, idx) => {
    ctx.fillStyle = c;
    ctx.fillRect(idx, 0, 1, 1);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  sharedToonGradient = tex;
  return tex;
}

/**
 * Creates cartoon inverted-hull black outline shell matching "Just Volleyball" comic style
 */
export function createOutline(geometry: THREE.BufferGeometry, scale = 1.065): THREE.Mesh {
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x09090b,
    side: THREE.BackSide,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geometry, outlineMat);
  mesh.scale.set(scale, scale, scale);
  mesh.renderOrder = 1;
  return mesh;
}

/**
 * Procedural Padel Racket Face & Hole Texture (NO Strings, Perforated Face Pattern)
 */
function createRacketFaceTexture(color: string, pattern: RacketPattern): THREE.CanvasTexture {
  if (typeof document === 'undefined') return createFallbackTexture();
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base head color
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 512);

  // Pattern overlays
  if (pattern === 'carbon') {
    // 12K carbon weave texture
    ctx.fillStyle = 'rgba(15, 15, 18, 0.45)';
    for (let x = 0; x < 512; x += 16) {
      for (let y = 0; y < 512; y += 16) {
        if ((x / 16 + y / 16) % 2 === 0) {
          ctx.fillRect(x, y, 16, 16);
        }
      }
    }
  } else if (pattern === 'lightning') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(180, 80);
    ctx.lineTo(290, 230);
    ctx.lineTo(210, 270);
    ctx.lineTo(340, 440);
    ctx.stroke();
  } else if (pattern === 'checker') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let x = 0; x < 512; x += 32) {
      for (let y = 0; y < 512; y += 32) {
        if ((x / 32 + y / 32) % 2 === 0) {
          ctx.fillRect(x, y, 32, 32);
        }
      }
    }
  } else if (pattern === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }

  // Inner sweet spot circular guide line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 256, 180, 0, Math.PI * 2);
  ctx.stroke();

  // Drilled perforated padel holes (standard padel drilled 5-column diamond grid)
  const holeRadius = 14;
  const spacing = 46;
  for (let ix = -3; ix <= 3; ix++) {
    for (let iy = -3; iy <= 3; iy++) {
      const cx = 256 + ix * spacing;
      const cy = 256 + iy * spacing;
      const distFromCenter = Math.hypot(ix * spacing, iy * spacing);
      if (distFromCenter < 170) {
        // Dark hole interior
        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
        ctx.fill();
        // Inner depth bevel
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Builds authentic solid padel racket (NO strings, teardrop shape, perforated face, thick comic outline)
 */
export function buildPadelRacket(
  racketColor: string = '#dc2626',
  pattern: RacketPattern = 'carbon'
): { group: THREE.Group; updateRacket: (color: string, pat: RacketPattern) => void } {
  const racket = new THREE.Group();
  const toonGrad = getSharedToonGradient();

  // 1. Teardrop Frame
  const frameGeo = new THREE.TorusGeometry(0.25, 0.03, 14, 28);
  const frameMat = new THREE.MeshToonMaterial({
    color: racketColor,
    gradientMap: toonGrad,
  });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.scale.set(0.92, 1.18, 1);
  frame.position.set(0, 0.44, 0);
  racket.add(frame);
  const frameOutline = createOutline(frameGeo, 1.08);
  frameOutline.scale.set(0.92 * 1.08, 1.18 * 1.08, 1.08);
  frameOutline.position.set(0, 0.44, 0);
  racket.add(frameOutline);

  // 2. Solid Core Face (no strings, perforated texture)
  const faceGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.024, 28);
  let faceTex = createRacketFaceTexture(racketColor, pattern);
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    roughness: 0.4,
  });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.rotation.x = Math.PI / 2;
  face.scale.set(0.90, 1, 1.15);
  face.position.set(0, 0.44, 0);
  racket.add(face);

  // 3. Throat Bridge
  const throatGeo = new THREE.BoxGeometry(0.12, 0.09, 0.032);
  const throatMat = new THREE.MeshToonMaterial({ color: 0x18181b, gradientMap: toonGrad });
  const throat = new THREE.Mesh(throatGeo, throatMat);
  throat.position.set(0, 0.20, 0);
  racket.add(throat);
  const throatOutline = createOutline(throatGeo, 1.08);
  throatOutline.position.set(0, 0.20, 0);
  racket.add(throatOutline);

  // 4. White Grip Handle
  const gripGeo = new THREE.CylinderGeometry(0.026, 0.028, 0.26, 14);
  const gripMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.position.set(0, 0.06, 0);
  racket.add(grip);
  const gripOutline = createOutline(gripGeo, 1.08);
  gripOutline.position.set(0, 0.06, 0);
  racket.add(gripOutline);

  // 5. Wristband / Butt Cap
  const buttGeo = new THREE.CylinderGeometry(0.032, 0.034, 0.024, 14);
  const buttMat = new THREE.MeshToonMaterial({ color: 0x09090b, gradientMap: toonGrad });
  const butt = new THREE.Mesh(buttGeo, buttMat);
  butt.position.set(0, -0.07, 0);
  racket.add(butt);

  racket.scale.set(1.15, 1.15, 1.15);

  const updateRacket = (newColor: string, newPattern: RacketPattern) => {
    frameMat.color.set(newColor);
    faceTex.dispose();
    faceTex = createRacketFaceTexture(newColor, newPattern);
    faceMat.map = faceTex;
    faceMat.needsUpdate = true;
  };

  return { group: racket, updateRacket };
}

/**
 * Procedural Face Decal Texture (Swappable Eyes, Eyebrows, Mouth with crisp anime expression)
 */
function createFaceTexture(
  eyeType: EyeType,
  eyebrowType: EyebrowType,
  mouthType: MouthType,
  isBlinking = false
): THREE.CanvasTexture {
  if (typeof document === 'undefined') return createFallbackTexture();
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 512);

  // Left & Right Eye Positions
  const leftEyeX = 175;
  const rightEyeX = 337;
  const eyeY = 240;

  const drawEye = (x: number, isRight: boolean) => {
    ctx.save();
    ctx.translate(x, eyeY);
    if (isRight) ctx.scale(-1, 1);

    if (isBlinking) {
      // Cute natural curved closed anime eyelid
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 14, 36, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (eyeType === 'half_lidded') {
      // Just Volleyball / Reference image signature half-lidded anime smirk eye
      // Sclera (White base)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-50, 10);
      ctx.quadraticCurveTo(0, 48, 50, 10);
      ctx.quadraticCurveTo(0, -20, -50, 10);
      ctx.closePath();
      ctx.fill();

      // Thick cartoon black border
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 10;
      ctx.stroke();

      // Pupil / Iris
      ctx.fillStyle = '#3f1d0b'; // Dark amber/chestnut anime iris
      ctx.beginPath();
      ctx.arc(4, 12, 24, 0, Math.PI * 2);
      ctx.fill();

      // Inner black pupil
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(4, 12, 14, 0, Math.PI * 2);
      ctx.fill();

      // Sparkle / Catchlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-2, 4, 7, 0, Math.PI * 2);
      ctx.fill();

      // Heavy half-lidded upper eyelid fold
      ctx.fillStyle = '#fed7aa'; // Matches skin tone to lid down
      ctx.beginPath();
      ctx.moveTo(-55, -24);
      ctx.lineTo(55, -24);
      ctx.lineTo(55, 6);
      ctx.quadraticCurveTo(0, -6, -55, 6);
      ctx.closePath();
      ctx.fill();

      // Upper bold eyelid line
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(-54, 6);
      ctx.quadraticCurveTo(0, -8, 54, 6);
      ctx.stroke();
    } else if (eyeType === 'confident' || eyeType === 'fierce') {
      // Wide athletic determined eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 4, 46, 32, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 10;
      ctx.stroke();

      ctx.fillStyle = eyeType === 'fierce' ? '#b91c1c' : '#1d4ed8';
      ctx.beginPath();
      ctx.arc(4, 4, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(4, 4, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -3, 6, 0, Math.PI * 2);
      ctx.fill();

      // Sharp upper slant line
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-48, -14);
      ctx.lineTo(48, eyeType === 'fierce' ? 6 : -6);
      ctx.stroke();
    } else if (eyeType === 'chill') {
      // Relaxed closed arc
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(0, 10, 36, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      // Anime standard round
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 4, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 10;
      ctx.stroke();

      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(0, 4, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-8, -4, 8, 0, Math.PI * 2);
      ctx.arc(8, 10, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  drawEye(leftEyeX, false);
  drawEye(rightEyeX, true);

  // Eyebrows
  const drawEyebrow = (x: number, isRight: boolean) => {
    ctx.save();
    ctx.translate(x, eyeY - 55);
    if (isRight) ctx.scale(-1, 1);

    ctx.strokeStyle = '#09090b';
    ctx.lineCap = 'round';

    if (eyebrowType === 'angled') {
      // Angled sharp smirk brow
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(-45, 14);
      ctx.lineTo(10, -8);
      ctx.lineTo(46, -2);
      ctx.stroke();
    } else if (eyebrowType === 'thick') {
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(-45, 10);
      ctx.lineTo(45, -4);
      ctx.stroke();
    } else if (eyebrowType === 'soft') {
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 14, 44, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-42, 0);
      ctx.lineTo(42, 0);
      ctx.stroke();
    }

    ctx.restore();
  };

  drawEyebrow(leftEyeX, false);
  drawEyebrow(rightEyeX, true);

  // Mouth
  ctx.save();
  ctx.translate(256, 365);
  ctx.strokeStyle = '#09090b';
  ctx.fillStyle = '#991b1b';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (mouthType === 'smirk') {
    // Signature Just Volleyball side smirk
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-28, 4);
    ctx.quadraticCurveTo(0, 16, 36, -14);
    ctx.stroke();
    // Smirk corner tick
    ctx.beginPath();
    ctx.moveTo(34, -18);
    ctx.lineTo(42, -8);
    ctx.stroke();
  } else if (mouthType === 'open') {
    // Excited open grin
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-42, -10);
    ctx.quadraticCurveTo(0, 48, 42, -10);
    ctx.closePath();
    ctx.fillStyle = '#be123c';
    ctx.fill();
    ctx.stroke();
    // White upper tooth bar
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-26, -10, 52, 12);
  } else if (mouthType === 'determined') {
    // Gritted mouth line
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.lineTo(36, 0);
    ctx.stroke();
  } else {
    // Gentle smile
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(0, -10, 36, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Procedural Jersey & Shorts Texture (Style, Numbers, Stripes)
 */
function createJerseyTexture(
  primaryColor: string,
  secondaryColor: string,
  style: JerseyStyle,
  number: number
): THREE.CanvasTexture {
  if (typeof document === 'undefined') return createFallbackTexture();
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Primary base
  ctx.fillStyle = primaryColor;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle fabric ribbing
  ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
  for (let y = 0; y < 512; y += 4) {
    ctx.fillRect(0, y, 512, 2);
  }

  if (style === 'captain') {
    // Reference image style: thick dark side stripes & shoulder cuffs
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(0, 0, 44, 512);
    ctx.fillRect(512 - 44, 0, 44, 512);

    // Collar trim
    ctx.fillRect(0, 0, 512, 32);
  } else if (style === 'stripes') {
    // Classic athletic vertical pin-stripes
    ctx.fillStyle = secondaryColor;
    for (let x = 64; x < 512; x += 96) {
      ctx.fillRect(x, 0, 28, 512);
    }
  } else if (style === 'split') {
    // Half-and-half dual split jersey
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(256, 0, 256, 512);
  } else {
    // Classic: clean athletic chest stripe
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(0, 200, 512, 40);
  }

  // Player Number on chest & back
  const numStr = String(Math.max(0, Math.min(99, number)));
  ctx.font = '900 160px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillText(numStr, 259, 273);

  // Crisp number foreground
  ctx.fillStyle = '#ffffff';
  ctx.fillText(numStr, 256, 270);

  // Number comic border
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 10;
  ctx.strokeText(numStr, 256, 270);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Procedural 3D Hair Generator (8 distinct styles: spiky, short, long, ponytail, bun, mohawk, curly, bald)
 */
export function createHairMesh(
  style: HairStyle,
  primaryColor: string,
  secondaryColor: string = '#451a03'
): THREE.Group {
  const hairGroup = new THREE.Group();
  if (style === 'bald') return hairGroup;

  const toonGrad = getSharedToonGradient();
  const hairMat = new THREE.MeshToonMaterial({
    color: primaryColor,
    gradientMap: toonGrad,
  });

  const coneGeo = new THREE.ConeGeometry(1, 1, 7);

  if (style === 'spiky') {
    // Signature spiky anime hair matching Reference image (blonde with dark gradient tips)
    const baseGeo = new THREE.SphereGeometry(0.38, 18, 18, 0, Math.PI * 2, 0, Math.PI * 0.72);
    const baseMesh = new THREE.Mesh(baseGeo, hairMat);
    baseMesh.position.set(0, 0.08, -0.03);
    hairGroup.add(baseMesh);
    hairGroup.add(createOutline(baseGeo, 1.07));

    const spikes = [
      // Top crown flares
      { pos: [0.0, 0.50, -0.02], rot: [-0.15, 0, 0], scale: [0.18, 0.46, 0.18] },
      { pos: [-0.18, 0.46, 0.06], rot: [0.35, 0.2, 0.6], scale: [0.16, 0.42, 0.16] },
      { pos: [0.18, 0.46, 0.06], rot: [0.35, -0.2, -0.6], scale: [0.16, 0.42, 0.16] },
      // Side flares
      { pos: [-0.34, 0.20, 0.02], rot: [0.1, 0.1, 1.25], scale: [0.16, 0.38, 0.16] },
      { pos: [0.34, 0.20, 0.02], rot: [0.1, -0.1, -1.25], scale: [0.16, 0.38, 0.16] },
      // Back volume
      { pos: [0.0, 0.32, -0.32], rot: [-0.85, 0, 0], scale: [0.18, 0.44, 0.18] },
      { pos: [-0.22, 0.18, -0.26], rot: [-0.65, -0.4, 0.9], scale: [0.16, 0.38, 0.16] },
      { pos: [0.22, 0.18, -0.26], rot: [-0.65, 0.4, -0.9], scale: [0.16, 0.38, 0.16] },
      // Lower hanging bangs
      { pos: [-0.18, -0.06, -0.25], rot: [-1.0, -0.2, 0.4], scale: [0.14, 0.34, 0.14] },
      { pos: [0.18, -0.06, -0.25], rot: [-1.0, 0.2, -0.4], scale: [0.14, 0.34, 0.14] },
      // Front bangs tufts
      { pos: [-0.14, 0.30, 0.28], rot: [0.85, -0.2, 0.3], scale: [0.13, 0.28, 0.13] },
      { pos: [0.14, 0.30, 0.28], rot: [0.85, 0.2, -0.3], scale: [0.13, 0.28, 0.13] },
      { pos: [0.0, 0.36, 0.27], rot: [0.90, 0, 0], scale: [0.13, 0.30, 0.13] },
    ];

    spikes.forEach(s => {
      const mesh = new THREE.Mesh(coneGeo, hairMat);
      mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
      mesh.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
      mesh.scale.set(s.scale[0], s.scale[1], s.scale[2]);
      hairGroup.add(mesh);

      const outline = createOutline(coneGeo, 1.09);
      outline.position.set(s.pos[0], s.pos[1], s.pos[2]);
      outline.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
      outline.scale.set(s.scale[0] * 1.09, s.scale[1] * 1.09, s.scale[2] * 1.09);
      hairGroup.add(outline);
    });
  } else if (style === 'short') {
    // Sporty clean crop
    const domeGeo = new THREE.SphereGeometry(0.38, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.65);
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.set(0, 0.08, -0.02);
    hairGroup.add(dome);
    hairGroup.add(createOutline(domeGeo, 1.07));

    // Front edge fringe
    const fringeGeo = new THREE.BoxGeometry(0.38, 0.08, 0.12);
    const fringe = new THREE.Mesh(fringeGeo, hairMat);
    fringe.position.set(0, 0.24, 0.26);
    hairGroup.add(fringe);
    hairGroup.add(createOutline(fringeGeo, 1.08));
  } else if (style === 'long') {
    // Long layered locks down shoulders
    const domeGeo = new THREE.SphereGeometry(0.38, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7);
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.set(0, 0.08, -0.02);
    hairGroup.add(dome);
    hairGroup.add(createOutline(domeGeo, 1.07));

    const strandGeo = new THREE.CylinderGeometry(0.08, 0.04, 0.55, 10);
    [-0.28, 0.28, -0.15, 0.15].forEach((sx, idx) => {
      const strand = new THREE.Mesh(strandGeo, hairMat);
      strand.position.set(sx, -0.14, idx < 2 ? 0.08 : -0.22);
      strand.rotation.z = sx > 0 ? -0.15 : 0.15;
      hairGroup.add(strand);
      const out = createOutline(strandGeo, 1.08);
      out.position.copy(strand.position);
      out.rotation.copy(strand.rotation);
      hairGroup.add(out);
    });
  } else if (style === 'ponytail') {
    // High athletic bouncy ponytail
    const domeGeo = new THREE.SphereGeometry(0.38, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7);
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.set(0, 0.08, -0.02);
    hairGroup.add(dome);
    hairGroup.add(createOutline(domeGeo, 1.07));

    const tailGeo = new THREE.ConeGeometry(0.18, 0.55, 12);
    const tail = new THREE.Mesh(tailGeo, hairMat);
    tail.position.set(0, 0.32, -0.42);
    tail.rotation.x = -Math.PI / 3;
    hairGroup.add(tail);
    const tailOut = createOutline(tailGeo, 1.08);
    tailOut.position.copy(tail.position);
    tailOut.rotation.copy(tail.rotation);
    hairGroup.add(tailOut);
  } else if (style === 'bun') {
    // Top knot athlete bun
    const domeGeo = new THREE.SphereGeometry(0.38, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7);
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.set(0, 0.08, -0.02);
    hairGroup.add(dome);
    hairGroup.add(createOutline(domeGeo, 1.07));

    const bunGeo = new THREE.SphereGeometry(0.18, 14, 14);
    const bun = new THREE.Mesh(bunGeo, hairMat);
    bun.position.set(0, 0.48, -0.08);
    hairGroup.add(bun);
    const bunOut = createOutline(bunGeo, 1.08);
    bunOut.position.copy(bun.position);
    hairGroup.add(bunOut);
  } else if (style === 'mohawk') {
    // Center athletic punk ridge
    for (let i = 0; i < 6; i++) {
      const ridgeGeo = new THREE.BoxGeometry(0.12, 0.28, 0.16);
      const ridge = new THREE.Mesh(ridgeGeo, hairMat);
      const zOffset = 0.24 - i * 0.12;
      ridge.position.set(0, 0.36 - Math.abs(zOffset) * 0.4, zOffset);
      hairGroup.add(ridge);
      const out = createOutline(ridgeGeo, 1.08);
      out.position.copy(ridge.position);
      hairGroup.add(out);
    }
  } else if (style === 'curly') {
    // Clustered curly chibi puffs
    const domeGeo = new THREE.SphereGeometry(0.38, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7);
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.set(0, 0.08, -0.02);
    hairGroup.add(dome);
    hairGroup.add(createOutline(domeGeo, 1.07));

    const puffGeo = new THREE.SphereGeometry(0.14, 10, 10);
    [
      [0, 0.44, 0],
      [-0.22, 0.38, 0.14],
      [0.22, 0.38, 0.14],
      [-0.26, 0.26, -0.2],
      [0.26, 0.26, -0.2],
      [0, 0.32, -0.32],
    ].forEach(p => {
      const puff = new THREE.Mesh(puffGeo, hairMat);
      puff.position.set(p[0], p[1], p[2]);
      hairGroup.add(puff);
      const out = createOutline(puffGeo, 1.08);
      out.position.copy(puff.position);
      hairGroup.add(out);
    });
  }

  return hairGroup;
}

/**
 * Procedural Headwear Accessories (headband, cap, sweatband)
 */
function createHeadwearMesh(type: HeadwearType, color: string): THREE.Group {
  const group = new THREE.Group();
  if (type === 'none') return group;

  const toonGrad = getSharedToonGradient();
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: toonGrad });

  if (type === 'headband' || type === 'sweatband') {
    const bandGeo = new THREE.TorusGeometry(0.38, type === 'sweatband' ? 0.045 : 0.028, 8, 24);
    const band = new THREE.Mesh(bandGeo, mat);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 0.18, 0);
    group.add(band);
    const out = createOutline(bandGeo, 1.08);
    out.rotation.x = Math.PI / 2;
    out.position.copy(band.position);
    group.add(out);
  } else if (type === 'cap') {
    const domeGeo = new THREE.SphereGeometry(0.39, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const dome = new THREE.Mesh(domeGeo, mat);
    dome.position.set(0, 0.14, 0);
    group.add(dome);

    const visorGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.02, 16, 1, false, -Math.PI / 3, (Math.PI * 2) / 3);
    const visor = new THREE.Mesh(visorGeo, mat);
    visor.position.set(0, 0.14, 0.20);
    visor.scale.set(1.1, 1, 1.4);
    group.add(visor);
  }

  return group;
}

/**
 * BUILDS CHUNKY CHIBI AVATAR CONTROLLER ("Just Volleyball" style matching locker reference image)
 */
export function buildPadelAvatar(
  custom: PlayerCustomization,
  side: Side,
  defaultZ: number = 7.0,
  jerseyNumber: string | number = 5,
  team: 'blue' | 'red' = side === 'south' ? 'blue' : 'red'
): AvatarController {
  const avatarGroup = new THREE.Group();
  avatarGroup.position.set(0, 0, defaultZ);

  const toonGrad = getSharedToonGradient();

  // Active Appearance state
  const app: PlayerAppearance = {
    name: custom.name || 'Player',
    number: typeof custom.number === 'number' ? custom.number : Number(jerseyNumber) || 5,
    skinTone: custom.skinTone || '#fed7aa',
    hairStyle: custom.hairStyle || 'spiky',
    hairColor: custom.hairColor || '#d4af37',
    hairSecondaryColor: custom.hairSecondaryColor || '#451a03',
    eyeType: custom.eyeType || 'half_lidded',
    eyebrowType: custom.eyebrowType || 'angled',
    mouthType: custom.mouthType || 'smirk',
    headwear: custom.headwear || 'none',
    headwearColor: custom.headwearColor || '#dc2626',
    jerseyStyle: custom.jerseyStyle || 'captain',
    jerseyPrimary: custom.jerseyPrimary || custom.jerseyColor || (team === 'blue' ? '#2563eb' : '#dc2626'),
    jerseySecondary: custom.jerseySecondary || '#18181b',
    shortsColor: custom.shortsColor || (team === 'blue' ? '#1e3a8a' : '#dc2626'),
    shoesColor: custom.shoesColor || '#ffffff',
    shoesSoleColor: custom.shoesSoleColor || '#18181b',
    socksColor: custom.socksColor || custom.jerseyPrimary || (team === 'blue' ? '#2563eb' : '#dc2626'),
    racketColor: custom.racketColor || (team === 'blue' ? '#2563eb' : '#dc2626'),
    racketPattern: custom.racketPattern || 'carbon',
    wristbandColor: custom.wristbandColor || '#18181b',
  };

  // Base Materials
  const skinMat = new THREE.MeshToonMaterial({ color: app.skinTone, gradientMap: toonGrad });
  const shortsMat = new THREE.MeshToonMaterial({ color: app.shortsColor, gradientMap: toonGrad });
  const socksMat = new THREE.MeshToonMaterial({ color: app.socksColor, gradientMap: toonGrad });
  const shoesMat = new THREE.MeshToonMaterial({ color: app.shoesColor, gradientMap: toonGrad });
  const soleMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
  const wristMat = new THREE.MeshToonMaterial({ color: app.wristbandColor, gradientMap: toonGrad });

  let jerseyTex = createJerseyTexture(app.jerseyPrimary, app.jerseySecondary, app.jerseyStyle, app.number);
  const shirtMat = new THREE.MeshStandardMaterial({
    map: jerseyTex,
    roughness: 0.5,
  });

  // Soft Round Ground Shadow (scales with jump height)
  const shadowGeo = new THREE.CircleGeometry(0.38, 24);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.40,
    depthWrite: false,
  });
  const groundShadow = new THREE.Mesh(shadowGeo, shadowMat);
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.y = 0.015;
  avatarGroup.add(groundShadow);

  // 1. Pelvis & Short Chunky Legs (Root of character skeleton)
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.72, 0);
  avatarGroup.add(pelvisGroup);

  // Chunky Rounded Shorts (small chibi body proportions)
  const shortsGeo = new THREE.CylinderGeometry(0.24, 0.22, 0.24, 16);
  const shortsMesh = new THREE.Mesh(shortsGeo, shortsMat);
  pelvisGroup.add(shortsMesh);
  pelvisGroup.add(createOutline(shortsGeo, 1.07));

  // 2. Torso (Compact rounded cylinder)
  const spineGroup = new THREE.Group();
  spineGroup.position.set(0, 0.12, 0);
  pelvisGroup.add(spineGroup);

  const torsoGeo = new THREE.CylinderGeometry(0.26, 0.24, 0.46, 18);
  const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
  torsoMesh.position.set(0, 0.23, 0);
  spineGroup.add(torsoMesh);
  spineGroup.add(createOutline(torsoGeo, 1.06));

  // White athletic collar ring
  const collarGeo = new THREE.TorusGeometry(0.14, 0.022, 8, 16);
  const collarMesh = new THREE.Mesh(collarGeo, socksMat);
  collarMesh.rotation.x = Math.PI / 2;
  collarMesh.position.set(0, 0.46, 0);
  spineGroup.add(collarMesh);

  // 3. BIG HEAD (Chibi Anime proportions: ~45% of total height)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.68, 0);
  spineGroup.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.36, 20, 20);
  headGeo.scale(1.05, 0.98, 1.02);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headGroup.add(headMesh);
  headGroup.add(createOutline(headGeo, 1.065));

  // Face Features Decal Plane (Expressive 2D anime eyes/eyebrows/mouth)
  let faceTex = createFaceTexture(app.eyeType, app.eyebrowType, app.mouthType, false);
  let faceTexBlink = createFaceTexture(app.eyeType, app.eyebrowType, app.mouthType, true);
  const faceDecalGeo = new THREE.PlaneGeometry(0.48, 0.48);
  const faceDecalMat = new THREE.MeshBasicMaterial({
    map: faceTex,
    transparent: true,
    depthWrite: false,
  });
  const faceDecal = new THREE.Mesh(faceDecalGeo, faceDecalMat);
  faceDecal.position.set(0, -0.01, 0.365);
  headGroup.add(faceDecal);

  // Stylized Hair
  let hairMesh = createHairMesh(app.hairStyle, app.hairColor, app.hairSecondaryColor);
  headGroup.add(hairMesh);

  // Headwear
  let headwearMesh = createHeadwearMesh(app.headwear, app.headwearColor);
  headGroup.add(headwearMesh);

  // 4. FLOATING SPHERICAL HANDS (NO ARMS) - Signature "Just Volleyball" Style!
  const handGeo = new THREE.SphereGeometry(0.105, 16, 16);

  // Left Floating Hand
  const leftHandGroup = new THREE.Group();
  leftHandGroup.position.set(-0.38, 0.20, 0.08);
  spineGroup.add(leftHandGroup);

  const leftHandMesh = new THREE.Mesh(handGeo, skinMat);
  leftHandGroup.add(leftHandMesh);
  leftHandGroup.add(createOutline(handGeo, 1.09));

  // Right Floating Hand (Holds solid padel racket)
  const rightHandGroup = new THREE.Group();
  rightHandGroup.position.set(0.38, 0.20, 0.08);
  spineGroup.add(rightHandGroup);

  const rightHandMesh = new THREE.Mesh(handGeo, skinMat);
  rightHandGroup.add(rightHandMesh);
  rightHandGroup.add(createOutline(handGeo, 1.09));

  // Padel Racket mounted securely inside right hand
  const racketBuilt = buildPadelRacket(app.racketColor, app.racketPattern);
  const racketGroup = racketBuilt.group;
  racketGroup.position.set(0, -0.06, 0.02);
  racketGroup.rotation.set(Math.PI / 2.6, 0, -Math.PI / 18);
  rightHandGroup.add(racketGroup);

  // 5. STUBBY LEGS & BIG ROUNDED SNEAKERS
  const thighGeo = new THREE.CylinderGeometry(0.088, 0.076, 0.26, 12);
  const sockGeo = new THREE.CylinderGeometry(0.078, 0.072, 0.20, 12);
  const shoeUpperGeo = new THREE.BoxGeometry(0.16, 0.11, 0.28);
  const shoeSoleGeo = new THREE.BoxGeometry(0.17, 0.032, 0.29);

  // Left Leg
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.13, 0, 0);
  pelvisGroup.add(leftLegGroup);

  const leftThigh = new THREE.Mesh(thighGeo, skinMat);
  leftThigh.position.set(0, -0.13, 0);
  leftLegGroup.add(leftThigh);

  const leftCalfGroup = new THREE.Group();
  leftCalfGroup.position.set(0, -0.26, 0);
  leftLegGroup.add(leftCalfGroup);

  const leftSock = new THREE.Mesh(sockGeo, socksMat);
  leftSock.position.set(0, -0.10, 0);
  leftCalfGroup.add(leftSock);

  const leftShoe = new THREE.Group();
  leftShoe.position.set(0, -0.21, 0.04);
  const leftShoeUpper = new THREE.Mesh(shoeUpperGeo, shoesMat);
  const leftShoeSole = new THREE.Mesh(shoeSoleGeo, soleMat);
  leftShoeSole.position.y = -0.06;
  leftShoe.add(leftShoeUpper, leftShoeSole);
  leftShoe.add(createOutline(shoeUpperGeo, 1.07));
  leftCalfGroup.add(leftShoe);

  // Right Leg
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.13, 0, 0);
  pelvisGroup.add(rightLegGroup);

  const rightThigh = new THREE.Mesh(thighGeo, skinMat);
  rightThigh.position.set(0, -0.13, 0);
  rightLegGroup.add(rightThigh);

  const rightCalfGroup = new THREE.Group();
  rightCalfGroup.position.set(0, -0.26, 0);
  rightLegGroup.add(rightCalfGroup);

  const rightSock = new THREE.Mesh(sockGeo, socksMat);
  rightSock.position.set(0, -0.10, 0);
  rightCalfGroup.add(rightSock);

  const rightShoe = new THREE.Group();
  rightShoe.position.set(0, -0.21, 0.04);
  const rightShoeUpper = new THREE.Mesh(shoeUpperGeo, shoesMat);
  const rightShoeSole = new THREE.Mesh(shoeSoleGeo, soleMat);
  rightShoeSole.position.y = -0.06;
  rightShoe.add(rightShoeUpper, rightShoeSole);
  rightShoe.add(createOutline(shoeUpperGeo, 1.07));
  rightCalfGroup.add(rightShoe);

  // 6. OVERHEAD TEAM BADGE & ARROW (Blue vs Red Readability)
  const overheadGroup = new THREE.Group();
  overheadGroup.position.set(0, 1.35, 0);
  avatarGroup.add(overheadGroup);

  // Arrow pointing down at player
  const arrowGeo = new THREE.ConeGeometry(0.09, 0.16, 4);
  const arrowMat = new THREE.MeshBasicMaterial({
    color: team === 'blue' ? 0x38bdf8 : 0xef4444,
  });
  const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
  arrowMesh.rotation.x = Math.PI;
  arrowMesh.position.set(0, 0.20, 0);
  overheadGroup.add(arrowMesh);

  // Animated Hit Pop Ring Mesh (expands and fades on racket contact)
  const popRingGeo = new THREE.RingGeometry(0.08, 0.15, 20);
  const popRingMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const popRingMesh = new THREE.Mesh(popRingGeo, popRingMat);
  popRingMesh.position.set(0, 0.44, 0.1);
  racketGroup.add(popRingMesh);
  let popRingLife = 0;

  // Dust Puff Particle Mesh (at feet on run/stop)
  const dustGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const dustMat = new THREE.MeshBasicMaterial({
    color: 0xf1f5f9,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const dustMesh = new THREE.Mesh(dustGeo, dustMat);
  dustMesh.position.set(0, 0.05, 0);
  avatarGroup.add(dustMesh);
  let dustLife = 0;

  // Animation cycles & state variables
  let runCycle = 0;
  let idleCycle = Math.random() * Math.PI * 2;
  let currentFacingAngle = side === 'south' ? Math.PI : 0;
  let squashScaleY = 1.0;
  let squashScaleXZ = 1.0;
  let animState: 'normal' | 'celebrate' | 'sad' = 'normal';
  let stateTimer = 0;

  function lerpAngle(from: number, to: number, alpha: number): number {
    let diff = (to - from) % (Math.PI * 2);
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > Math.PI) diff -= Math.PI * 2;
    return from + diff * alpha;
  }

  const triggerHitPop = () => {
    popRingLife = 0.25;
    popRingMat.opacity = 0.95;
    popRingMesh.scale.set(1, 1, 1);
    // Impact squash on avatar
    squashScaleY = 0.88;
    squashScaleXZ = 1.08;
  };

  const triggerDustPuff = () => {
    dustLife = 0.35;
    dustMat.opacity = 0.75;
    dustMesh.position.set(
      (Math.random() - 0.5) * 0.3,
      0.06,
      (Math.random() - 0.5) * 0.3
    );
    dustMesh.scale.set(1, 1, 1);
  };

  const playStateAnimation = (state: 'celebrate' | 'sad' | 'idle' | 'ready') => {
    if (state === 'celebrate') {
      animState = 'celebrate';
      stateTimer = 2.4;
    } else if (state === 'sad') {
      animState = 'sad';
      stateTimer = 2.0;
    } else {
      animState = 'normal';
      stateTimer = 0;
    }
  };

  // ONE UNIFIED FUNCTION: applyAppearance
  const applyAppearance = (newApp: PlayerAppearance) => {
    Object.assign(app, newApp);

    // Update Materials
    skinMat.color.set(app.skinTone);
    shortsMat.color.set(app.shortsColor);
    socksMat.color.set(app.socksColor);
    shoesMat.color.set(app.shoesColor);
    soleMat.color.set(app.shoesSoleColor || '#09090b');
    wristMat.color.set(app.wristbandColor);

    // Refresh Jersey Texture
    jerseyTex.dispose();
    jerseyTex = createJerseyTexture(
      app.jerseyPrimary || app.jerseyColor || '#dc2626',
      app.jerseySecondary || '#18181b',
      app.jerseyStyle || 'captain',
      app.number
    );
    shirtMat.map = jerseyTex;
    shirtMat.needsUpdate = true;

    // Refresh Face Texture
    faceTex.dispose();
    faceTexBlink.dispose();
    faceTex = createFaceTexture(app.eyeType, app.eyebrowType, app.mouthType, false);
    faceTexBlink = createFaceTexture(app.eyeType, app.eyebrowType, app.mouthType, true);
    faceDecalMat.map = faceTex;
    faceDecalMat.needsUpdate = true;

    // Refresh Hair
    headGroup.remove(hairMesh);
    hairMesh = createHairMesh(app.hairStyle, app.hairColor, app.hairSecondaryColor);
    headGroup.add(hairMesh);

    // Refresh Headwear
    headGroup.remove(headwearMesh);
    headwearMesh = createHeadwearMesh(app.headwear, app.headwearColor);
    headGroup.add(headwearMesh);

    // Refresh Racket
    racketBuilt.updateRacket(
      app.racketColor || app.jerseyPrimary,
      app.racketPattern || (app.racketSkin as RacketPattern) || 'carbon'
    );
  };

  const updateKinematics = (
    dt: number,
    velocity: { x: number; z: number },
    swingProgress: number,
    isSwinging: boolean,
    shotType: ShotType,
    targetFacingAngle: number,
    ballPos?: { x: number; y: number; z: number },
    swingSide: SwingSide = 'forehand'
  ) => {
    // 1. Unified body rotation: head, torso, hands, and legs rotate together
    const moveSpeed = Math.hypot(velocity.x, velocity.z);
    let desiredYaw = targetFacingAngle;

    if (moveSpeed > 0.30 && !isSwinging) {
      desiredYaw = Math.atan2(velocity.x, velocity.z);
    }

    currentFacingAngle = lerpAngle(currentFacingAngle, desiredYaw, Math.min(1, dt * 18.0));
    avatarGroup.rotation.y = currentFacingAngle;

    // Billboarding for overhead arrow
    overheadGroup.rotation.y = -currentFacingAngle;
    overheadGroup.position.y = 1.35 + Math.sin(idleCycle * 2) * 0.04;

    // Animate VFX (hit pop ring & dust puff)
    if (popRingLife > 0) {
      popRingLife -= dt;
      popRingMat.opacity = Math.max(0, popRingLife / 0.25);
      const ringScale = 1.0 + (1.0 - popRingLife / 0.25) * 1.5;
      popRingMesh.scale.set(ringScale, ringScale, 1);
    }

    if (dustLife > 0) {
      dustLife -= dt;
      dustMat.opacity = Math.max(0, dustLife / 0.35);
      const dScale = 1.0 + (1.0 - dustLife / 0.35) * 2.2;
      dustMesh.scale.set(dScale, dScale, dScale);
    }

    // Squash & stretch recovery
    squashScaleY = THREE.MathUtils.lerp(squashScaleY, 1.0, dt * 12.0);
    squashScaleXZ = THREE.MathUtils.lerp(squashScaleXZ, 1.0, dt * 12.0);
    pelvisGroup.scale.set(squashScaleXZ, squashScaleY, squashScaleXZ);

    // State Animations (Celebrate / Sad)
    if (stateTimer > 0) {
      stateTimer -= dt;
      if (animState === 'celebrate') {
        const jumpPhase = Math.sin((2.4 - stateTimer) * 8.0);
        pelvisGroup.position.y = 0.72 + Math.max(0, jumpPhase) * 0.35;
        rightHandGroup.position.set(0.34, 0.46, 0.05);
        leftHandGroup.position.set(-0.34, 0.46, 0.05);
        return;
      } else if (animState === 'sad') {
        headGroup.rotation.x = 0.35;
        spineGroup.rotation.x = 0.15;
        rightHandGroup.position.set(0.28, 0.06, 0.12);
        leftHandGroup.position.set(-0.28, 0.06, 0.12);
        return;
      }
    }

    // Dynamic ground shadow scale
    const currentElevation = pelvisGroup.position.y - 0.72;
    groundShadow.scale.set(
      Math.max(0.4, 1.0 - currentElevation * 0.6),
      Math.max(0.4, 1.0 - currentElevation * 0.6),
      1
    );

    // 2. Locomotion Kinematics (Run vs Idle / Ready Stance)
    if (moveSpeed > 0.15) {
      // Running cycle
      runCycle += dt * moveSpeed * 5.6;
      const legAngle = Math.sin(runCycle) * 0.68;
      leftLegGroup.rotation.x = legAngle;
      rightLegGroup.rotation.x = -legAngle;
      leftCalfGroup.rotation.x = Math.max(0, -Math.sin(runCycle) * 0.75);
      rightCalfGroup.rotation.x = Math.max(0, Math.sin(runCycle) * 0.75);

      pelvisGroup.position.y = 0.72 + Math.abs(Math.sin(runCycle * 2)) * 0.06;
      spineGroup.rotation.x = 0.12;

      // Spawn dust puff on foot steps
      if (Math.abs(Math.sin(runCycle)) > 0.95 && Math.random() < 0.25) {
        triggerDustPuff();
      }

      // Floating hands rhythm during sprint
      if (!isSwinging && swingProgress === 0) {
        const handBob = Math.sin(runCycle) * 0.12;
        rightHandGroup.position.set(0.38, 0.20 - handBob, 0.08 + handBob);
        leftHandGroup.position.set(-0.38, 0.20 + handBob, 0.08 - handBob);
      }
    } else {
      // Idle / Ready stance (gentle breathing bounce)
      idleCycle += dt * 3.2;
      const bounce = Math.sin(idleCycle) * 0.03;
      pelvisGroup.position.y = 0.70 + bounce;

      leftLegGroup.rotation.x = 0.14;
      rightLegGroup.rotation.x = 0.14;
      leftCalfGroup.rotation.x = 0.22;
      rightCalfGroup.rotation.x = 0.22;
      spineGroup.rotation.x = 0.05;

      // Floating hands in athletic ready stance in front
      if (!isSwinging && swingProgress === 0) {
        rightHandGroup.position.set(0.32, 0.22 + bounce * 0.5, 0.18);
        leftHandGroup.position.set(-0.32, 0.22 + bounce * 0.5, 0.14);
        racketGroup.rotation.set(Math.PI / 3.0, 0, -Math.PI / 14);
      }
    }

    // 3. RACKET SWING PROCEDURAL ANIMATIONS (Forehand, Backhand, Smash, Bandeja/Lob, Serve)
    if (isSwinging || swingProgress > 0) {
      const p = Math.max(0, Math.min(1, swingProgress));

      if (swingSide === 'overhead' || shotType === 'smash') {
        // High leaping athletic smash / remate
        if (p < 0.40) {
          const prep = p / 0.40;
          pelvisGroup.position.y = 0.72 + Math.sin(prep * Math.PI) * 0.55; // jump
          rightHandGroup.position.set(0.32, 0.52 + prep * 0.25, -0.15);
          leftHandGroup.position.set(-0.32, 0.45, 0.20);
          racketGroup.rotation.set(-Math.PI / 2.2, 0, 0.2);
        } else {
          const strike = (p - 0.40) / 0.60;
          pelvisGroup.position.y = 0.72 + (1 - strike) * 0.40;
          rightHandGroup.position.set(0.28, 0.65 - strike * 0.48, 0.32);
          leftHandGroup.position.set(-0.34, 0.18, -0.10);
          racketGroup.rotation.set(Math.PI / 1.8, strike * 0.4, -0.2);
          spineGroup.rotation.x = 0.25 * strike;
        }
      } else if (swingSide === 'backhand') {
        // Crisp backhand whip across chest
        const strike = p;
        rightHandGroup.position.set(
          -0.15 + strike * 0.65,
          0.24,
          0.12 + Math.sin(strike * Math.PI) * 0.18
        );
        racketGroup.rotation.set(0.2, 0.8 - strike * 2.0, -0.2);
        leftHandGroup.position.set(-0.40, 0.18, -0.08);
      } else if (swingSide === 'serve') {
        // Underhand padel serve below waist
        const strike = p;
        pelvisGroup.position.y = 0.68 + (1 - strike) * 0.04;
        rightHandGroup.position.set(0.34, 0.08 + strike * 0.24, -0.15 + strike * 0.45);
        racketGroup.rotation.set(Math.PI / 4, strike * 0.3, -0.15);
        leftHandGroup.position.set(-0.36, 0.22, 0.12);
      } else if (shotType === 'slice' || shotType === 'bajada') {
        // High-to-low cut (Bandeja / Bajada)
        const strike = p;
        rightHandGroup.position.set(0.36 - strike * 0.15, 0.48 - strike * 0.32, 0.10 + strike * 0.26);
        racketGroup.rotation.set(Math.PI / 3 - strike * 0.6, 0.4, -0.3);
      } else if (shotType === 'lob') {
        // Low-to-high lifting shovel
        const strike = p;
        rightHandGroup.position.set(0.34, 0.08 + strike * 0.38, -0.10 + strike * 0.38);
        racketGroup.rotation.set(0.6 - strike * 1.4, 0.2, 0.1);
      } else {
        // Forehand drive
        const strike = p;
        rightHandGroup.position.set(
          0.38 - strike * 0.30,
          0.22 + Math.sin(strike * Math.PI) * 0.10,
          -0.12 + strike * 0.48
        );
        racketGroup.rotation.set(0.3, -0.8 + strike * 1.9, 0.2);
        leftHandGroup.position.set(-0.38, 0.20, -0.05);
      }
    }
  };

  let blinkTimer = 2.4 + Math.random() * 2.0;
  let isBlinking = false;

  const updateMenuIdle = (
    dt: number,
    timeSeconds: number,
    ballBouncePhase: number,
    mouseParallax: { x: number; y: number }
  ) => {
    // 1. Natural Eased Blinking Cycle (Every 3-5 seconds for 120ms)
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      if (!isBlinking) {
        isBlinking = true;
        faceDecalMat.map = faceTexBlink;
        faceDecalMat.needsUpdate = true;
      }
      if (blinkTimer <= -0.12) {
        isBlinking = false;
        faceDecalMat.map = faceTex;
        faceDecalMat.needsUpdate = true;
        blinkTimer = 2.8 + Math.random() * 2.6;
      }
    }

    // 2. Smooth head tilt and rotation tracking the mouse with spring easing
    const targetHeadYaw = mouseParallax.x * 0.32;
    const targetHeadPitch = -mouseParallax.y * 0.20;
    const targetHeadRoll = -mouseParallax.x * 0.08;
    headGroup.rotation.y = THREE.MathUtils.damp(headGroup.rotation.y, targetHeadYaw, 6.0, dt);
    headGroup.rotation.x = THREE.MathUtils.damp(headGroup.rotation.x, targetHeadPitch, 6.0, dt);
    headGroup.rotation.z = THREE.MathUtils.damp(headGroup.rotation.z, targetHeadRoll, 6.0, dt);

    // 3. Relaxed athletic pose with racket held up at side
    // ballBouncePhase is 0..1 in rhythm with the ball bouncing loop.
    // Near impact (phase ~ 0 or 1), knees and hand cushion slightly down with spring rebound
    const impactFactor = Math.pow(Math.cos(ballBouncePhase * Math.PI), 6.0);
    const kneeCushion = impactFactor * 0.035;
    const idleBreathing = Math.sin(timeSeconds * 2.4) * 0.012;

    // Pelvis & Knees
    pelvisGroup.position.y = 0.70 - kneeCushion + idleBreathing;
    leftLegGroup.rotation.x = 0.12 + kneeCushion * 1.5;
    rightLegGroup.rotation.x = 0.12 + kneeCushion * 1.5;
    leftCalfGroup.rotation.x = 0.20 + kneeCushion * 2.0;
    rightCalfGroup.rotation.x = 0.20 + kneeCushion * 2.0;
    spineGroup.rotation.x = 0.04 + kneeCushion * 0.4;

    // Right Floating Hand holding padel racket up at the side, face tilted upward for ball bounce
    rightHandGroup.position.set(0.36, 0.28 - kneeCushion * 0.5, 0.15);
    racketGroup.rotation.set(Math.PI / 2.05, 0.04, -0.05);

    // Left Floating Hand resting naturally at side with counterbalance bob
    leftHandGroup.position.set(-0.35, 0.18 + idleBreathing * 0.8, 0.08);

    // Dynamic ground shadow
    groundShadow.scale.set(1.0 + kneeCushion * 0.5, 1.0 + kneeCushion * 0.5, 1);

    // Face forward towards camera
    avatarGroup.rotation.y = THREE.MathUtils.damp(avatarGroup.rotation.y, 0, 6.0, dt);
  };

  const setVisible = (visible: boolean) => {
    avatarGroup.visible = visible;
  };

  return {
    group: avatarGroup,
    racketGroup,
    applyAppearance,
    updateKinematics,
    updateMenuIdle,
    triggerHitPop,
    triggerDustPuff,
    playStateAnimation,
    setVisible,
    appearance: app,
  };
}

/**
 * Top-level unified appearance updater that works on both AvatarController and bare THREE.Group
 */
export function applyAppearance(
  target: AvatarController | THREE.Group,
  appearance: PlayerAppearance
): void {
  if ('applyAppearance' in target && typeof target.applyAppearance === 'function') {
    target.applyAppearance(appearance);
  }
}
