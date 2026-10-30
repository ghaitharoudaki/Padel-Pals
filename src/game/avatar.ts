import * as THREE from 'three';
import { PlayerCustomization, ShotType, Side } from './types';

export interface AvatarController {
  group: THREE.Group;
  racketGroup: THREE.Group;
  updateKinematics: (
    dt: number,
    velocity: { x: number; z: number },
    swingProgress: number,
    isSwinging: boolean,
    shotType: ShotType,
    targetFacingAngle: number,
    ballPos?: { x: number; y: number; z: number },
    swingSide?: import('./types').SwingSide
  ) => void;
  updateCustomization: (custom: PlayerCustomization) => void;
  setVisible: (visible: boolean) => void;
}

/**
 * Creates cartoon black outline shell (inverted hull cel-shading)
 * matching the signature "Just Volleyball" and "Padel Pals" comic outline aesthetic.
 */
function createOutline(geometry: THREE.BufferGeometry, scale = 1.055): THREE.Mesh {
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x09090b,
    side: THREE.BackSide,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geometry, outlineMat);
  mesh.scale.set(scale, scale, scale);
  return mesh;
}

/**
 * Generates procedural athletic sports jersey texture with printed number and side stripes
 */
function createJerseyTexture(
  jerseyColor: string,
  numberText: string,
  stripeColor: string = '#ffffff'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base jersey color
  ctx.fillStyle = jerseyColor;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle athletic mesh fabric pattern
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let y = 0; y < 512; y += 4) {
    ctx.fillRect(0, y, 512, 2);
  }

  // Athletic contrast side stripes
  ctx.fillStyle = stripeColor;
  ctx.fillRect(12, 0, 36, 512);
  ctx.fillRect(512 - 48, 0, 36, 512);

  // Athletic collar accent
  ctx.fillStyle = stripeColor;
  ctx.fillRect(0, 0, 512, 28);

  // Bold athletic number on front (center)
  ctx.fillStyle = stripeColor;
  ctx.font = '900 150px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Front number with clean shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillText(numberText, 258, 274);
  ctx.fillStyle = stripeColor;
  ctx.fillText(numberText, 256, 270);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Builds authentic round padel racket with carbon frame, perforated surface, and firm grip
 */
export function buildPadelRacket(skin: string = 'carbon'): THREE.Group {
  const racket = new THREE.Group();

  const accentColor =
    skin === 'gold'
      ? 0xf59e0b
      : skin === 'neon'
      ? 0x22c55e
      : skin === 'pro_blue'
      ? 0x0284c7
      : 0x38bdf8;

  // 1. Modern Round Head Frame (Standard teardrop/round padel geometry)
  const frameGeo = new THREE.TorusGeometry(0.24, 0.026, 16, 32);
  const frameMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.2,
    metalness: 0.6,
  });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.scale.set(0.95, 1.15, 1);
  frame.position.set(0, 0.44, 0);
  racket.add(frame);
  racket.add(createOutline(frameGeo, 1.08));

  // 2. Carbon Core Face (Perforated padel sweetspot surface)
  const faceGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.028, 32);
  const faceMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.5,
    metalness: 0.3,
  });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.rotation.x = Math.PI / 2;
  face.scale.set(0.92, 1, 1.12);
  face.position.set(0, 0.44, 0);
  racket.add(face);

  // Drilled perforation holes on racket face
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x27272a });
  const holeGeo = new THREE.CircleGeometry(0.015, 8);
  [-0.10, -0.05, 0, 0.05, 0.10].forEach(hx => {
    [-0.12, -0.06, 0, 0.06, 0.12].forEach(hy => {
      if (Math.hypot(hx, hy) <= 0.16) {
        const dotF = new THREE.Mesh(holeGeo, holeMat);
        dotF.position.set(hx, 0.44 + hy, 0.015);
        racket.add(dotF);
        const dotB = new THREE.Mesh(holeGeo, holeMat);
        dotB.position.set(hx, 0.44 + hy, -0.015);
        dotB.rotation.y = Math.PI;
        racket.add(dotB);
      }
    });
  });

  // 3. Heart Bridge Throat
  const bridgeGeo = new THREE.BoxGeometry(0.10, 0.08, 0.032);
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.4 });
  const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
  bridge.position.set(0, 0.22, 0);
  racket.add(bridge);

  // 4. White Grip Handle
  const gripGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.28, 16);
  const gripMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.position.set(0, 0.08, 0);
  racket.add(grip);
  racket.add(createOutline(gripGeo, 1.08));

  // Safety wrist lanyard ring at butt cap
  const buttGeo = new THREE.CylinderGeometry(0.029, 0.032, 0.024, 14);
  const buttMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.3 });
  const butt = new THREE.Mesh(buttGeo, buttMat);
  butt.position.set(0, -0.05, 0);
  racket.add(butt);

  racket.scale.set(1.15, 1.15, 1.15);
  return racket;
}

/**
 * Builds clean 3D anime spiky hair volume matching the "Padel Pals" / "Just Volleyball" reference image
 */
function createSpikyAnimeHair(hairColor: string): THREE.Group {
  const hairGroup = new THREE.Group();
  const hairMat = new THREE.MeshToonMaterial({
    color: hairColor,
  });

  // Main hair dome (covers head from top, back, sides)
  const baseGeo = new THREE.SphereGeometry(0.28, 18, 18, 0, Math.PI * 2, 0, Math.PI * 0.70);
  const baseMesh = new THREE.Mesh(baseGeo, hairMat);
  baseMesh.position.set(0, 0.06, -0.02);
  hairGroup.add(baseMesh);
  hairGroup.add(createOutline(baseGeo, 1.06));

  // High-volume spiky anime tufts with bold silhouettes
  const spikeSpecs = [
    // Top crowns (signature spiky hair tufts)
    { pos: [0.0, 0.38, -0.02], rot: [-0.15, 0, 0], scale: [0.16, 0.36, 0.16] },
    { pos: [-0.16, 0.34, 0.06], rot: [0.35, 0.2, 0.6], scale: [0.15, 0.32, 0.15] },
    { pos: [0.16, 0.34, 0.06], rot: [0.35, -0.2, -0.6], scale: [0.15, 0.32, 0.15] },
    // Side flare spikes / bangs
    { pos: [-0.28, 0.16, 0.02], rot: [0.1, 0.1, 1.2], scale: [0.15, 0.30, 0.15] },
    { pos: [0.28, 0.16, 0.02], rot: [0.1, -0.1, -1.2], scale: [0.15, 0.30, 0.15] },
    // Back volume spikes
    { pos: [0.0, 0.24, -0.24], rot: [-0.85, 0, 0], scale: [0.17, 0.34, 0.17] },
    { pos: [-0.19, 0.14, -0.20], rot: [-0.65, -0.4, 0.9], scale: [0.15, 0.30, 0.15] },
    { pos: [0.19, 0.14, -0.20], rot: [-0.65, 0.4, -0.9], scale: [0.15, 0.30, 0.15] },
    // Lower back fringe
    { pos: [-0.13, -0.04, -0.20], rot: [-0.95, -0.2, 0.5], scale: [0.13, 0.26, 0.13] },
    { pos: [0.13, -0.04, -0.20], rot: [-0.95, 0.2, -0.5], scale: [0.13, 0.26, 0.13] },
    // Front bangs tufts
    { pos: [-0.11, 0.23, 0.21], rot: [0.85, -0.2, 0.3], scale: [0.11, 0.22, 0.11] },
    { pos: [0.11, 0.23, 0.21], rot: [0.85, 0.2, -0.3], scale: [0.11, 0.22, 0.11] },
    { pos: [0.0, 0.27, 0.20], rot: [0.90, 0, 0], scale: [0.11, 0.23, 0.11] },
  ];

  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  spikeSpecs.forEach(spec => {
    const spike = new THREE.Mesh(coneGeo, hairMat);
    spike.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    spike.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
    spike.scale.set(spec.scale[0], spec.scale[1], spec.scale[2]);
    hairGroup.add(spike);

    const spikeOutline = createOutline(coneGeo, 1.08);
    spikeOutline.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    spikeOutline.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
    spikeOutline.scale.set(spec.scale[0] * 1.08, spec.scale[1] * 1.08, spec.scale[2] * 1.08);
    hairGroup.add(spikeOutline);
  });

  return hairGroup;
}

/**
 * Builds stylized 3D humanoid character matching Padel Pals:
 * - Spiky anime hair silhouette
 * - Expressive cartoon eyes (white sclera, black pupils, comic outline)
 * - Athletic jersey with printed player number
 * - White or team shorts with stripes
 * - Dark volleyball knee pads
 * - Clean white socks and athletic sneakers
 * - Spherical hands with padel racket anchored directly in right hand palm
 * - Unified single-rotation group where head, torso, arms, and legs always face forward together
 */
export function buildPadelAvatar(
  custom: PlayerCustomization,
  side: Side,
  defaultZ: number = 7.0,
  jerseyNumber: string = '7'
): AvatarController {
  const avatarGroup = new THREE.Group();
  avatarGroup.position.set(0, 0, defaultZ);

  // Materials with cel-shading toon look
  const skinMat = new THREE.MeshToonMaterial({
    color: custom.skinTone || '#fed7aa',
  });

  let jerseyTex = createJerseyTexture(custom.jerseyColor, jerseyNumber);
  const shirtMat = new THREE.MeshStandardMaterial({
    map: jerseyTex,
    roughness: 0.5,
  });

  const shortsMat = new THREE.MeshToonMaterial({
    color: custom.shortsColor || '#ffffff',
  });

  const stripeMat = new THREE.MeshToonMaterial({
    color: custom.jerseyColor,
  });

  const kneePadMat = new THREE.MeshToonMaterial({
    color: 0x111827, // Dark black volleyball knee pads
  });

  const sockMat = new THREE.MeshToonMaterial({
    color: 0xffffff,
  });

  const shoeMat = new THREE.MeshToonMaterial({
    color: 0x09090b, // Clean sneakers
  });

  const wristbandMat = new THREE.MeshToonMaterial({
    color: custom.jerseyColor,
  });

  // 1. Pelvis / Hips (Root of body mesh)
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.88, 0);
  avatarGroup.add(pelvisGroup);

  // Athletic shorts
  const shortsGeo = new THREE.CylinderGeometry(0.26, 0.23, 0.28, 16);
  const shortsMesh = new THREE.Mesh(shortsGeo, shortsMat);
  pelvisGroup.add(shortsMesh);
  pelvisGroup.add(createOutline(shortsGeo, 1.05));

  // Shorts colored side stripe
  const stripeGeo = new THREE.BoxGeometry(0.02, 0.28, 0.24);
  const leftStripe = new THREE.Mesh(stripeGeo, stripeMat);
  leftStripe.position.set(-0.25, 0, 0);
  const rightStripe = new THREE.Mesh(stripeGeo, stripeMat);
  rightStripe.position.set(0.25, 0, 0);
  pelvisGroup.add(leftStripe, rightStripe);

  // 2. Spine & Torso (Athletic sports jersey with printed number)
  const spineGroup = new THREE.Group();
  spineGroup.position.set(0, 0.14, 0);
  pelvisGroup.add(spineGroup);

  const torsoGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.54, 20);
  const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
  torsoMesh.position.set(0, 0.27, 0);
  spineGroup.add(torsoMesh);
  spineGroup.add(createOutline(torsoGeo, 1.05));

  // White athletic collar ring
  const collarGeo = new THREE.TorusGeometry(0.14, 0.024, 8, 18);
  const collarMesh = new THREE.Mesh(collarGeo, shortsMat);
  collarMesh.rotation.x = Math.PI / 2;
  collarMesh.position.set(0, 0.54, 0);
  spineGroup.add(collarMesh);

  // 3. Head and Face (strictly locked to torso for unified rotation)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.76, 0);
  spineGroup.add(headGroup);

  // Stylized smooth cartoon head
  const headGeo = new THREE.SphereGeometry(0.26, 20, 20);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headGroup.add(headMesh);
  headGroup.add(createOutline(headGeo, 1.06));

  // Big expressive cartoon eyes matching Just Volleyball / Padel Pals
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const catchlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const eyeWhiteGeo = new THREE.CircleGeometry(0.052, 16);
  const pupilGeo = new THREE.CircleGeometry(0.028, 14);
  const catchlightGeo = new THREE.CircleGeometry(0.010, 10);
  const eyeRingGeo = new THREE.RingGeometry(0.050, 0.058, 16);

  // Left Eye
  const leftEyeGroup = new THREE.Group();
  leftEyeGroup.position.set(-0.09, 0.02, 0.242);
  const leftWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
  leftPupil.position.set(0.005, -0.002, 0.002);
  const leftCatch = new THREE.Mesh(catchlightGeo, catchlightMat);
  leftCatch.position.set(0.012, 0.008, 0.004);
  const leftBorder = new THREE.Mesh(eyeRingGeo, pupilMat);
  leftBorder.position.z = 0.001;
  leftEyeGroup.add(leftWhite, leftBorder, leftPupil, leftCatch);
  headGroup.add(leftEyeGroup);

  // Right Eye
  const rightEyeGroup = new THREE.Group();
  rightEyeGroup.position.set(0.09, 0.02, 0.242);
  const rightWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
  rightPupil.position.set(-0.005, -0.002, 0.002);
  const rightCatch = new THREE.Mesh(catchlightGeo, catchlightMat);
  rightCatch.position.set(-0.002, 0.008, 0.004);
  const rightBorder = new THREE.Mesh(eyeRingGeo, pupilMat);
  rightBorder.position.z = 0.001;
  rightEyeGroup.add(rightWhite, rightBorder, rightPupil, rightCatch);
  headGroup.add(rightEyeGroup);

  // Cute bold anime smile
  const mouthGeo = new THREE.TorusGeometry(0.035, 0.007, 6, 14, Math.PI * 0.8);
  const mouthMesh = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ color: 0x09090b }));
  mouthMesh.position.set(0, -0.10, 0.244);
  mouthMesh.rotation.z = Math.PI * 1.1;
  headGroup.add(mouthMesh);

  // Spiky Anime Hair
  let hairGroup = createSpikyAnimeHair(custom.hairColor);
  headGroup.add(hairGroup);

  // 4. ARTICULATED ARMS WITH CLEAN SPHERICAL HANDS & RACKET FIRMLY IN PALM
  const armGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.24, 12);
  const sleeveGeo = new THREE.CylinderGeometry(0.082, 0.076, 0.12, 12);
  const handGeo = new THREE.SphereGeometry(0.095, 16, 16);
  const wristGeo = new THREE.TorusGeometry(0.065, 0.022, 8, 14);

  // Right Arm & Racket Rig (Holding padel racket firmly in hand)
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(0.33, 0.44, 0);
  spineGroup.add(rightShoulder);

  const rightSleeve = new THREE.Mesh(sleeveGeo, shirtMat);
  rightSleeve.position.set(0.04, -0.06, 0);
  rightShoulder.add(rightSleeve);
  rightShoulder.add(createOutline(sleeveGeo, 1.06));

  const rightUpperArm = new THREE.Mesh(armGeo, skinMat);
  rightUpperArm.position.set(0.04, -0.18, 0);
  rightShoulder.add(rightUpperArm);

  const rightElbow = new THREE.Group();
  rightElbow.position.set(0.04, -0.30, 0);
  rightShoulder.add(rightElbow);

  const rightForearm = new THREE.Mesh(armGeo, skinMat);
  rightForearm.position.set(0, -0.12, 0);
  rightElbow.add(rightForearm);

  const rightWristband = new THREE.Mesh(wristGeo, wristbandMat);
  rightWristband.rotation.x = Math.PI / 2;
  rightWristband.position.set(0, -0.22, 0);
  rightElbow.add(rightWristband);

  // Spherical Hand Mesh
  const rightHand = new THREE.Group();
  rightHand.position.set(0, -0.29, 0);
  rightElbow.add(rightHand);

  const rightHandMesh = new THREE.Mesh(handGeo, skinMat);
  rightHand.add(rightHandMesh);
  rightHand.add(createOutline(handGeo, 1.07));

  // PADEL RACKET ANCHORED PROPERLY INSIDE PALM
  // The handle grip sits right in the palm center, with frame extending forward and up
  const racketGroup = buildPadelRacket(custom.racketSkin);
  racketGroup.position.set(0, -0.08, 0.03); // center the grip handle (y=0.08) in hand center
  racketGroup.rotation.set(Math.PI / 2.5, 0, -Math.PI / 16);
  rightHand.add(racketGroup);

  // Left Arm Rig (Free balance arm)
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(-0.33, 0.44, 0);
  spineGroup.add(leftShoulder);

  const leftSleeve = new THREE.Mesh(sleeveGeo, shirtMat);
  leftSleeve.position.set(-0.04, -0.06, 0);
  leftShoulder.add(leftSleeve);
  leftShoulder.add(createOutline(sleeveGeo, 1.06));

  const leftUpperArm = new THREE.Mesh(armGeo, skinMat);
  leftUpperArm.position.set(-0.04, -0.18, 0);
  leftShoulder.add(leftUpperArm);

  const leftElbow = new THREE.Group();
  leftElbow.position.set(-0.04, -0.30, 0);
  leftShoulder.add(leftElbow);

  const leftForearm = new THREE.Mesh(armGeo, skinMat);
  leftForearm.position.set(0, -0.12, 0);
  leftElbow.add(leftForearm);

  const leftWristband = new THREE.Mesh(wristGeo, wristbandMat);
  leftWristband.rotation.x = Math.PI / 2;
  leftWristband.position.set(0, -0.22, 0);
  leftElbow.add(leftWristband);

  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.set(0, -0.29, 0);
  leftElbow.add(leftHand);
  const leftHandOutline = createOutline(handGeo, 1.07);
  leftHandOutline.position.set(0, -0.29, 0);
  leftElbow.add(leftHandOutline);

  // 5. Legs with Volleyball Knee Pads & Sneakers
  const thighGeo = new THREE.CylinderGeometry(0.098, 0.082, 0.38, 14);
  const calfGeo = new THREE.CylinderGeometry(0.082, 0.068, 0.34, 14);
  const kneePadGeo = new THREE.SphereGeometry(0.105, 14, 14);
  kneePadGeo.scale(1.08, 1.3, 0.85);

  const shoeUpperGeo = new THREE.BoxGeometry(0.14, 0.09, 0.26);
  const shoeSoleGeo = new THREE.BoxGeometry(0.15, 0.03, 0.27);
  const soleMat = new THREE.MeshToonMaterial({ color: 0xffffff });

  // Left Leg
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.14, 0, 0);
  pelvisGroup.add(leftLegGroup);

  const leftThigh = new THREE.Mesh(thighGeo, skinMat);
  leftThigh.position.set(0, -0.19, 0);
  leftLegGroup.add(leftThigh);

  const leftKneeGroup = new THREE.Group();
  leftKneeGroup.position.set(0, -0.38, 0);
  leftLegGroup.add(leftKneeGroup);

  const leftKneePad = new THREE.Mesh(kneePadGeo, kneePadMat);
  leftKneePad.position.set(0, 0, 0.035);
  leftKneeGroup.add(leftKneePad);

  const leftCalf = new THREE.Mesh(calfGeo, sockMat);
  leftCalf.position.set(0, -0.17, 0);
  leftKneeGroup.add(leftCalf);

  const leftShoe = new THREE.Group();
  leftShoe.position.set(0, -0.34, 0.05);
  const leftShoeUpper = new THREE.Mesh(shoeUpperGeo, shoeMat);
  const leftShoeSole = new THREE.Mesh(shoeSoleGeo, soleMat);
  leftShoeSole.position.y = -0.05;
  leftShoe.add(leftShoeUpper, leftShoeSole);
  leftKneeGroup.add(leftShoe);

  // Right Leg
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.14, 0, 0);
  pelvisGroup.add(rightLegGroup);

  const rightThigh = new THREE.Mesh(thighGeo, skinMat);
  rightThigh.position.set(0, -0.19, 0);
  rightLegGroup.add(rightThigh);

  const rightKneeGroup = new THREE.Group();
  rightKneeGroup.position.set(0, -0.38, 0);
  rightLegGroup.add(rightKneeGroup);

  const rightKneePad = new THREE.Mesh(kneePadGeo, kneePadMat);
  rightKneePad.position.set(0, 0, 0.035);
  rightKneeGroup.add(rightKneePad);

  const rightCalf = new THREE.Mesh(calfGeo, sockMat);
  rightCalf.position.set(0, -0.17, 0);
  rightKneeGroup.add(rightCalf);

  const rightShoe = new THREE.Group();
  rightShoe.position.set(0, -0.34, 0.05);
  const rightShoeUpper = new THREE.Mesh(shoeUpperGeo, shoeMat);
  const rightShoeSole = new THREE.Mesh(shoeSoleGeo, soleMat);
  rightShoeSole.position.y = -0.05;
  rightShoe.add(rightShoeUpper, rightShoeSole);
  rightKneeGroup.add(rightShoe);

  let runCycle = 0;
  let readyCycle = Math.random() * Math.PI * 2;
  let currentFacingAngle = side === 'south' ? Math.PI : 0;

  /**
   * Smooth shortest-arc angle interpolation to prevent 360-spin glitching
   */
  function lerpAngle(from: number, to: number, alpha: number): number {
    let diff = (to - from) % (Math.PI * 2);
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > Math.PI) diff -= Math.PI * 2;
    return from + diff * alpha;
  }

  const updateKinematics = (
    dt: number,
    velocity: { x: number; z: number },
    swingProgress: number,
    isSwinging: boolean,
    shotType: ShotType,
    targetFacingAngle: number,
    ballPos?: { x: number; y: number; z: number },
    swingSide: import('./types').SwingSide = 'forehand'
  ) => {
    // UNIFIED SINGLE-ROTATION GROUP:
    // Head, torso, arms, and legs all rigidly rotate together via avatarGroup.
    const moveSpeed = Math.hypot(velocity.x, velocity.z);
    let desiredYaw = targetFacingAngle;

    if (moveSpeed > 0.35 && !isSwinging) {
      // Running: strictly face the direction of movement so the body never faces sideways!
      desiredYaw = Math.atan2(velocity.x, velocity.z);
    }

    currentFacingAngle = lerpAngle(currentFacingAngle, desiredYaw, Math.min(1, dt * 16.0));
    avatarGroup.rotation.y = currentFacingAngle;

    // Head is strictly aligned with torso (zero independent twist)
    headGroup.rotation.y = 0;

    // Running vs Ready Stance Kinematics
    if (moveSpeed > 0.15) {
      // Natural running gait
      runCycle += dt * moveSpeed * 5.4;
      const legAngle = Math.sin(runCycle) * 0.65;
      leftLegGroup.rotation.x = legAngle;
      rightLegGroup.rotation.x = -legAngle;
      leftKneeGroup.rotation.x = Math.max(0, -Math.sin(runCycle) * 0.7);
      rightKneeGroup.rotation.x = Math.max(0, Math.sin(runCycle) * 0.7);

      pelvisGroup.position.y = 0.88 + Math.abs(Math.sin(runCycle * 2)) * 0.06;
      spineGroup.rotation.x = 0.12;

      // Running arm swing
      if (!isSwinging && swingProgress === 0) {
        rightShoulder.rotation.x = -Math.sin(runCycle) * 0.5 + 0.3;
        rightElbow.rotation.x = 0.8;
        leftShoulder.rotation.x = Math.sin(runCycle) * 0.5 + 0.2;
        leftElbow.rotation.x = 0.6;
      }
    } else {
      // Volleyball ready stance (split bounce)
      readyCycle += dt * 3.4;
      const bounce = Math.sin(readyCycle) * 0.035;
      pelvisGroup.position.y = 0.86 + bounce;

      leftLegGroup.rotation.x = 0.16;
      rightLegGroup.rotation.x = 0.16;
      leftKneeGroup.rotation.x = 0.24;
      rightKneeGroup.rotation.x = 0.24;
      spineGroup.rotation.x = 0.06;

      // Athletic ready posture: hands up in front holding racket
      if (!isSwinging && swingProgress === 0) {
        rightShoulder.rotation.set(0.6, -0.3, 0.2);
        rightElbow.rotation.set(1.2, 0.4, -0.3);
        leftShoulder.rotation.set(0.5, 0.3, -0.2);
        leftElbow.rotation.set(1.1, -0.3, 0.2);
      }
    }

    // Dynamic Racket Swing Kinematics (Forehand, Backhand, Smash/Overhead, Serve)
    if (isSwinging || swingProgress > 0) {
      const p = Math.max(0, Math.min(1, swingProgress));

      if (swingSide === 'overhead' || shotType === 'smash') {
        // High leaping spike / smash
        if (p < 0.38) {
          const prep = p / 0.38;
          pelvisGroup.position.y = 0.88 + Math.sin(prep * Math.PI) * 0.52; // Athletic jump
          rightShoulder.rotation.set(-1.8, 0.2, 0.4);
          rightElbow.rotation.set(-0.6, 0, 0);
          leftShoulder.rotation.set(-1.0, -0.3, -0.4);
        } else {
          const strike = (p - 0.38) / 0.62;
          rightShoulder.rotation.set(-1.8 + strike * 3.4, 0.1, -0.2);
          rightElbow.rotation.set(0.4 + strike * 0.8, 0, 0);
          spineGroup.rotation.x = 0.3 * strike;
          pelvisGroup.position.y = 0.88 + (1 - strike) * 0.35;
        }
      } else if (swingSide === 'backhand') {
        // Fluid backhand whip across body
        const strike = p;
        rightShoulder.rotation.set(0.3, 0.9 - strike * 2.1, -0.3);
        rightElbow.rotation.set(1.2 - strike * 0.6, 0, 0);
        leftShoulder.rotation.set(0.2, -0.4, 0.2);
        spineGroup.rotation.y = 0.3 - strike * 0.6;
      } else if (swingSide === 'serve') {
        // Underhand padel serve scoop below waist
        const strike = p;
        rightShoulder.rotation.set(-0.7 + strike * 1.5, -0.3 + strike * 0.4, 0.2);
        rightElbow.rotation.set(0.8 - strike * 0.3, 0, 0);
        leftShoulder.rotation.set(0.3, 0.3, 0);
      } else if (shotType === 'slice' || shotType === 'drop') {
        // Bandeja high-to-low cut
        const strike = p;
        rightShoulder.rotation.set(0.2 + strike * 1.0, -0.5 + strike * 0.8, -0.3);
        rightElbow.rotation.set(0.8 - strike * 0.4, 0, 0);
        leftShoulder.rotation.set(0.2, 0.5, 0);
      } else if (shotType === 'lob') {
        // Upward lifting shovel arc
        const strike = p;
        rightShoulder.rotation.set(0.8 - strike * 1.8, -0.2, 0.1);
        rightElbow.rotation.set(0.6 + strike * 0.8, 0, 0);
        spineGroup.rotation.x = -0.15 * (1 - strike);
      } else {
        // Forehand drive arc
        const strike = p;
        rightShoulder.rotation.set(0.4, -1.0 + strike * 2.2, 0.3);
        rightElbow.rotation.set(1.0 - strike * 0.4, 0, 0);
        spineGroup.rotation.y = -0.3 + strike * 0.6;
      }
    }
  };

  const updateCustomization = (newCustom: PlayerCustomization) => {
    skinMat.color.set(newCustom.skinTone);
    shortsMat.color.set(newCustom.shortsColor || '#ffffff');
    stripeMat.color.set(newCustom.jerseyColor);
    wristbandMat.color.set(newCustom.jerseyColor);

    // Refresh jersey texture with updated color
    jerseyTex = createJerseyTexture(newCustom.jerseyColor, jerseyNumber);
    shirtMat.map = jerseyTex;
    shirtMat.needsUpdate = true;

    // Replace hair
    headGroup.remove(hairGroup);
    hairGroup = createSpikyAnimeHair(newCustom.hairColor);
    headGroup.add(hairGroup);
  };

  const setVisible = (visible: boolean) => {
    avatarGroup.visible = visible;
  };

  return {
    group: avatarGroup,
    racketGroup,
    updateKinematics,
    updateCustomization,
    setVisible,
  };
}
