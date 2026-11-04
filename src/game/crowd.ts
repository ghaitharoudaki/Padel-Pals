import * as THREE from 'three';

export type CrowdReaction = 'idle' | 'cheer' | 'smash' | 'miss';

export interface CrowdSystem {
  group: THREE.Group;
  update(timeSeconds: number, dt: number): void;
  triggerReaction(reaction: CrowdReaction, duration?: number): void;
  getFanCount(): number;
  dispose(): void;
}

interface FanSpec {
  baseX: number;
  baseY: number;
  baseZ: number;
  baseRotY: number;
  phase: number;
  speed: number;
  side: 'south' | 'north' | 'neutral';
  hasHat: boolean;
  hasFlag: boolean;
  hasScarf: boolean;
  hatIndex: number;
  flagIndex: number;
  scarfIndex: number;
}

/**
 * 300+ Low-Poly Chibi Spectators in toon style using InstancedMesh.
 * Multi-part procedural models: body, head, hair, hands, hats, scarves, flags.
 * Per-instance colors for team shirts (North Red, South Blue, Neutral mixed),
 * diverse skin tones, hair colors, and team merchandise.
 *
 * ROOT CAUSE OF BLACK FANS:
 * Previously, materials were declared with `{ vertexColors: true }`.
 * In Three.js, when a material has `vertexColors: true` but the geometry lacks a
 * vertex `color` attribute, WebGL passes zeroes for the missing attribute, causing
 * `vColor` to evaluate to (0, 0, 0, 1) and multiplying diffuse by 0 (jet black).
 * For InstancedMesh, per-instance coloring works natively via `instanceColor`
 * with `vertexColors: false` (or default) and `color: 0xffffff`.
 */
export function createCrowdSystem(): CrowdSystem {
  const group = new THREE.Group();
  group.name = 'PadelCrowdSystem';

  // Diverse anime & realistic skin tones
  const skinTones = [
    0xfed7aa, // peach light
    0xfcd34d, // golden warm
    0xfbbf24, // tan
    0xd97706, // caramel
    0x92400e, // deep brown
    0x78350f, // rich bronze
    0xffedd5, // porcelain
  ];

  // Team Red jerseys (North Side)
  const redJerseys = [
    0xdc2626, // crimson red
    0xef4444, // bright red
    0xb91c1c, // deep scarlet
    0x991b1b, // ruby
    0xf87171, // coral red
  ];

  // Team Blue jerseys (South Side)
  const blueJerseys = [
    0x2563eb, // royal blue
    0x3b82f6, // sky blue
    0x1d4ed8, // deep cobalt
    0x0284c7, // padel tournament blue
    0x60a5fa, // light azure
  ];

  // Neutral mixed section jerseys (Lateral stands / Mid-court)
  const neutralJerseys = [
    0x10b981, // emerald green
    0xf59e0b, // amber
    0x8b5cf6, // violet
    0xec4899, // pink
    0x06b6d4, // cyan
    0xf97316, // orange
    0xf8fafc, // stadium crisp white
    0x334155, // slate charcoal
  ];

  // Hair colors
  const hairColors = [
    0xd4af37, // anime blonde
    0x18181b, // jet black
    0x451a03, // chestnut brown
    0x78350f, // auburn
    0x991b1b, // dark crimson
    0x0284c7, // electric blue
    0x64748b, // steel silver
  ];

  const fans: FanSpec[] = [];
  let hatCount = 0;
  let flagCount = 0;
  let scarfCount = 0;

  // 1. Generate Stadium Grandstand Seating Positions (380+ fans)
  // North Grandstand (Team Red fans behind north glass wall, Z = -12 to -19.5)
  for (let tier = 0; tier < 6; tier++) {
    const tierZ = -12.0 - tier * 1.5;
    const tierY = 0.5 + tier * 0.75 + 0.38;
    const countInRow = 20;
    for (let c = 0; c < countInRow; c++) {
      const tierX = -9.0 + (c / (countInRow - 1)) * 18.0 + (Math.random() - 0.5) * 0.15;
      const rotY = 0; // facing south towards court
      const hasHat = Math.random() < 0.38;
      const hasFlag = Math.random() < 0.26;
      const hasScarf = Math.random() < 0.35;
      fans.push({
        baseX: tierX,
        baseY: tierY,
        baseZ: tierZ,
        baseRotY: rotY,
        phase: Math.random() * Math.PI * 2,
        speed: 0.85 + Math.random() * 0.35,
        side: 'north',
        hasHat,
        hasFlag,
        hasScarf,
        hatIndex: hasHat ? hatCount++ : -1,
        flagIndex: hasFlag ? flagCount++ : -1,
        scarfIndex: hasScarf ? scarfCount++ : -1,
      });
    }
  }

  // South Grandstand (Team Blue fans behind south glass wall, Z = +12 to +19.5)
  for (let tier = 0; tier < 6; tier++) {
    const tierZ = 12.0 + tier * 1.5;
    const tierY = 0.5 + tier * 0.75 + 0.38;
    const countInRow = 20;
    for (let c = 0; c < countInRow; c++) {
      const tierX = -9.0 + (c / (countInRow - 1)) * 18.0 + (Math.random() - 0.5) * 0.15;
      const rotY = Math.PI; // facing north towards court
      const hasHat = Math.random() < 0.38;
      const hasFlag = Math.random() < 0.26;
      const hasScarf = Math.random() < 0.35;
      fans.push({
        baseX: tierX,
        baseY: tierY,
        baseZ: tierZ,
        baseRotY: rotY,
        phase: Math.random() * Math.PI * 2,
        speed: 0.85 + Math.random() * 0.35,
        side: 'south',
        hasHat,
        hasFlag,
        hasScarf,
        hatIndex: hasHat ? hatCount++ : -1,
        flagIndex: hasFlag ? flagCount++ : -1,
        scarfIndex: hasScarf ? scarfCount++ : -1,
      });
    }
  }

  // West Lateral Grandstand (Mixed section, X = -7.5 to -13.5, Z = -9 to +9)
  for (let tier = 0; tier < 5; tier++) {
    const tierX = -7.5 - tier * 1.5;
    const tierY = 0.5 + tier * 0.75 + 0.38;
    const countInRow = 15;
    for (let c = 0; c < countInRow; c++) {
      const tierZ = -9.0 + (c / (countInRow - 1)) * 18.0 + (Math.random() - 0.5) * 0.2;
      const rotY = Math.PI / 2; // facing east towards court
      const side: FanSpec['side'] = tierZ > 3.5 ? 'south' : (tierZ < -3.5 ? 'north' : 'neutral');
      const hasHat = Math.random() < 0.35;
      const hasFlag = Math.random() < 0.24;
      const hasScarf = Math.random() < 0.32;
      fans.push({
        baseX: tierX,
        baseY: tierY,
        baseZ: tierZ,
        baseRotY: rotY,
        phase: Math.random() * Math.PI * 2,
        speed: 0.85 + Math.random() * 0.35,
        side,
        hasHat,
        hasFlag,
        hasScarf,
        hatIndex: hasHat ? hatCount++ : -1,
        flagIndex: hasFlag ? flagCount++ : -1,
        scarfIndex: hasScarf ? scarfCount++ : -1,
      });
    }
  }

  // East Lateral Grandstand (Mixed section, X = +7.5 to +13.5, Z = -9 to +9)
  for (let tier = 0; tier < 5; tier++) {
    const tierX = 7.5 + tier * 1.5;
    const tierY = 0.5 + tier * 0.75 + 0.38;
    const countInRow = 15;
    for (let c = 0; c < countInRow; c++) {
      const tierZ = -9.0 + (c / (countInRow - 1)) * 18.0 + (Math.random() - 0.5) * 0.2;
      const rotY = -Math.PI / 2; // facing west towards court
      const side: FanSpec['side'] = tierZ > 3.5 ? 'south' : (tierZ < -3.5 ? 'north' : 'neutral');
      const hasHat = Math.random() < 0.35;
      const hasFlag = Math.random() < 0.24;
      const hasScarf = Math.random() < 0.32;
      fans.push({
        baseX: tierX,
        baseY: tierY,
        baseZ: tierZ,
        baseRotY: rotY,
        phase: Math.random() * Math.PI * 2,
        speed: 0.85 + Math.random() * 0.35,
        side,
        hasHat,
        hasFlag,
        hasScarf,
        hatIndex: hasHat ? hatCount++ : -1,
        flagIndex: hasFlag ? flagCount++ : -1,
        scarfIndex: hasScarf ? scarfCount++ : -1,
      });
    }
  }

  const totalFans = fans.length; // 390 spectators

  // 2. Chibi Low-Poly Geometries
  // Body: Chunky rounded cylinder
  const bodyGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.40, 8);
  bodyGeo.translate(0, 0.20, 0);

  // Head: Low-poly sphere (chunky chibi head)
  const headGeo = new THREE.SphereGeometry(0.24, 10, 8);
  headGeo.translate(0, 0.56, 0);

  // Hair cap / Spiky tuft: Slightly larger offset cone
  const hairGeo = new THREE.ConeGeometry(0.26, 0.22, 7);
  hairGeo.translate(0, 0.74, 0);

  // Floating hands: spherical hands
  const handGeo = new THREE.SphereGeometry(0.08, 8, 6);

  // Hat: Cap with visor
  const hatGeo = new THREE.CylinderGeometry(0.25, 0.26, 0.12, 8);
  hatGeo.translate(0, 0.72, 0);

  // Scarf: chunky neck band
  const scarfGeo = new THREE.CylinderGeometry(0.23, 0.24, 0.08, 8);
  scarfGeo.translate(0, 0.42, 0);

  // Team Flag: Small banner on a pole
  const flagGeo = new THREE.PlaneGeometry(0.35, 0.24);
  flagGeo.translate(0.18, 0.85, 0);

  // Materials: MeshLambertMaterial with color 0xffffff and NO vertexColors flag
  // This allows Three.js's internal USE_INSTANCING_COLOR to multiply instanceColor cleanly without zeroing out!
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const handMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const hatMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const scarfMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });

  // Instanced Meshes
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, totalFans);
  const headMesh = new THREE.InstancedMesh(headGeo, headMat, totalFans);
  const hairMesh = new THREE.InstancedMesh(hairGeo, hairMat, totalFans);
  const leftHandMesh = new THREE.InstancedMesh(handGeo, handMat, totalFans);
  const rightHandMesh = new THREE.InstancedMesh(handGeo, handMat, totalFans);
  const hatMesh = new THREE.InstancedMesh(hatGeo, hatMat, Math.max(1, hatCount));
  const scarfMesh = new THREE.InstancedMesh(scarfGeo, scarfMat, Math.max(1, scarfCount));
  const flagMesh = new THREE.InstancedMesh(flagGeo, flagMat, Math.max(1, flagCount));

  // Assign distinct instance colors (team blue, red, mixed neutral, skins)
  const dummyColor = new THREE.Color();
  const dummyMatrix = new THREE.Matrix4();
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  // Initialize all hat/flag/scarf instances to zero scale first
  for (let i = 0; i < Math.max(1, hatCount); i++) {
    hatMesh.setMatrixAt(i, zeroMatrix);
  }
  for (let i = 0; i < Math.max(1, scarfCount); i++) {
    scarfMesh.setMatrixAt(i, zeroMatrix);
  }
  for (let i = 0; i < Math.max(1, flagCount); i++) {
    flagMesh.setMatrixAt(i, zeroMatrix);
  }

  for (let i = 0; i < totalFans; i++) {
    const f = fans[i];

    // Jersey Color
    let jerseyHex: number;
    if (f.side === 'north') {
      jerseyHex = redJerseys[Math.floor(Math.random() * redJerseys.length)];
    } else if (f.side === 'south') {
      jerseyHex = blueJerseys[Math.floor(Math.random() * blueJerseys.length)];
    } else {
      jerseyHex = neutralJerseys[Math.floor(Math.random() * neutralJerseys.length)];
    }
    dummyColor.setHex(jerseyHex);
    bodyMesh.setColorAt(i, dummyColor);

    // Skin Tone
    const skinHex = skinTones[Math.floor(Math.random() * skinTones.length)];
    dummyColor.setHex(skinHex);
    headMesh.setColorAt(i, dummyColor);
    leftHandMesh.setColorAt(i, dummyColor);
    rightHandMesh.setColorAt(i, dummyColor);

    // Hair Color
    const hairHex = hairColors[Math.floor(Math.random() * hairColors.length)];
    dummyColor.setHex(hairHex);
    hairMesh.setColorAt(i, dummyColor);

    // Hat color
    if (f.hasHat && f.hatIndex >= 0) {
      const hatHex = Math.random() < 0.6 ? jerseyHex : 0x18181b;
      dummyColor.setHex(hatHex);
      hatMesh.setColorAt(f.hatIndex, dummyColor);
    }

    // Scarf color
    if (f.hasScarf && f.scarfIndex >= 0) {
      const scarfHex = Math.random() < 0.7 ? jerseyHex : 0xf8fafc;
      dummyColor.setHex(scarfHex);
      scarfMesh.setColorAt(f.scarfIndex, dummyColor);
    }

    // Flag color
    if (f.hasFlag && f.flagIndex >= 0) {
      dummyColor.setHex(jerseyHex);
      flagMesh.setColorAt(f.flagIndex, dummyColor);
    }
  }

  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
  if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
  if (hairMesh.instanceColor) hairMesh.instanceColor.needsUpdate = true;
  if (leftHandMesh.instanceColor) leftHandMesh.instanceColor.needsUpdate = true;
  if (rightHandMesh.instanceColor) rightHandMesh.instanceColor.needsUpdate = true;
  if (hatMesh.instanceColor) hatMesh.instanceColor.needsUpdate = true;
  if (scarfMesh.instanceColor) scarfMesh.instanceColor.needsUpdate = true;
  if (flagMesh.instanceColor) flagMesh.instanceColor.needsUpdate = true;

  group.add(bodyMesh);
  group.add(headMesh);
  group.add(hairMesh);
  group.add(leftHandMesh);
  group.add(rightHandMesh);
  group.add(hatMesh);
  group.add(scarfMesh);
  group.add(flagMesh);

  // Animation State Machine
  let currentReaction: CrowdReaction = 'idle';
  let reactionTimer = 0;
  let reactionIntensity = 0; // 0..1 smooth blend

  // Reusable math objects to eliminate garbage collection
  const scratchPos = new THREE.Vector3();
  const scratchQuat = new THREE.Quaternion();
  const scratchScale = new THREE.Vector3(1, 1, 1);
  const scratchEuler = new THREE.Euler();
  const handOffset = new THREE.Vector3();

  function update(timeSeconds: number, dt: number) {
    if (reactionTimer > 0) {
      reactionTimer -= dt;
      reactionIntensity = Math.min(1.0, reactionIntensity + dt * 6.0);
      if (reactionTimer <= 0) {
        currentReaction = 'idle';
      }
    } else {
      reactionIntensity = Math.max(0, reactionIntensity - dt * 2.5);
    }

    for (let i = 0; i < totalFans; i++) {
      const f = fans[i];
      const p = f.phase;
      const spd = f.speed;

      // Base idle sway & breathing (asynchronous per-fan phase)
      const idleBob = Math.sin(timeSeconds * 2.8 * spd + p) * 0.025;
      const idleSway = Math.sin(timeSeconds * 1.8 * spd + p) * 0.035;

      let offsetY = idleBob;
      let rotX = 0;
      let rotY = f.baseRotY + idleSway;
      let rotZ = 0;

      // Hand default positions relative to fan center
      let lHandX = -0.25;
      let lHandY = 0.22 + idleBob;
      let lHandZ = 0.08;

      let rHandX = 0.25;
      let rHandY = 0.22 + idleBob;
      let rHandZ = 0.08;

      // Reaction-specific kinematics
      if (currentReaction === 'cheer' || reactionIntensity > 0.01) {
        // CHEER: Jump out of seats, wave arms & flags high!
        const cheerJump = Math.abs(Math.sin(timeSeconds * 9.0 * spd + p)) * 0.38 * reactionIntensity;
        offsetY += cheerJump;

        // Wave arms in the air
        const waveL = Math.sin(timeSeconds * 10.0 + p) * 0.12 * reactionIntensity;
        const waveR = Math.cos(timeSeconds * 11.0 + p) * 0.14 * reactionIntensity;

        lHandY = THREE.MathUtils.lerp(lHandY, 0.62 + waveL, reactionIntensity);
        lHandX = THREE.MathUtils.lerp(lHandX, -0.28, reactionIntensity);

        rHandY = THREE.MathUtils.lerp(rHandY, 0.68 + waveR, reactionIntensity);
        rHandX = THREE.MathUtils.lerp(rHandX, 0.28, reactionIntensity);

      } else if (currentReaction === 'smash') {
        // SMASH: Stand up in anticipation, raise both hands high!
        offsetY += 0.22;
        lHandY = 0.72 + Math.sin(timeSeconds * 12.0 + p) * 0.04;
        rHandY = 0.72 + Math.cos(timeSeconds * 12.0 + p) * 0.04;
        lHandX = -0.22;
        rHandX = 0.22;
        lHandZ = 0.15;
        rHandZ = 0.15;
        rotX = -0.15; // looking upwards towards high smash

      } else if (currentReaction === 'miss') {
        // MISS: Heads in hands on missed shots, slump forward in agony!
        offsetY -= 0.08;
        rotX = 0.35; // head and torso bowing down

        // Both hands clutching head / face
        lHandX = -0.13;
        lHandY = 0.52;
        lHandZ = 0.18;

        rHandX = 0.13;
        rHandY = 0.52;
        rHandZ = 0.18;
      }

      scratchEuler.set(rotX, rotY, rotZ, 'YXZ');
      scratchQuat.setFromEuler(scratchEuler);

      // 1. Body Matrix
      scratchPos.set(f.baseX, f.baseY + offsetY, f.baseZ);
      scratchScale.set(1, 1, 1);
      dummyMatrix.compose(scratchPos, scratchQuat, scratchScale);
      bodyMesh.setMatrixAt(i, dummyMatrix);

      // 2. Head Matrix
      dummyMatrix.compose(scratchPos, scratchQuat, scratchScale);
      headMesh.setMatrixAt(i, dummyMatrix);

      // 3. Hair Matrix
      dummyMatrix.compose(scratchPos, scratchQuat, scratchScale);
      hairMesh.setMatrixAt(i, dummyMatrix);

      // 4. Scarf Matrix
      if (f.hasScarf && f.scarfIndex >= 0) {
        dummyMatrix.compose(scratchPos, scratchQuat, scratchScale);
        scarfMesh.setMatrixAt(f.scarfIndex, dummyMatrix);
      }

      // 5. Left Hand Matrix (transformed by fan rotation)
      handOffset.set(lHandX, lHandY, lHandZ).applyQuaternion(scratchQuat);
      scratchPos.set(f.baseX + handOffset.x, f.baseY + offsetY + handOffset.y, f.baseZ + handOffset.z);
      dummyMatrix.compose(scratchPos, scratchQuat, scratchScale);
      leftHandMesh.setMatrixAt(i, dummyMatrix);

      // 6. Right Hand Matrix
      handOffset.set(rHandX, rHandY, rHandZ).applyQuaternion(scratchQuat);
      scratchPos.set(f.baseX + handOffset.x, f.baseY + offsetY + handOffset.y, f.baseZ + handOffset.z);
      dummyMatrix.compose(scratchPos, scratchQuat, scratchScale);
      rightHandMesh.setMatrixAt(i, dummyMatrix);

      // 7. Hat Matrix
      if (f.hasHat && f.hatIndex >= 0) {
        scratchPos.set(f.baseX, f.baseY + offsetY, f.baseZ);
        dummyMatrix.compose(scratchPos, scratchQuat, scratchScale);
        hatMesh.setMatrixAt(f.hatIndex, dummyMatrix);
      }

      // 8. Flag Matrix
      if (f.hasFlag && f.flagIndex >= 0) {
        scratchEuler.set(
          rotX,
          rotY + (currentReaction === 'cheer' ? Math.sin(timeSeconds * 12.0 + p) * 0.45 : 0),
          rotZ + 0.2,
          'YXZ'
        );
        scratchQuat.setFromEuler(scratchEuler);
        handOffset.set(rHandX + 0.1, rHandY + 0.1, rHandZ).applyQuaternion(scratchQuat);
        scratchPos.set(f.baseX + handOffset.x, f.baseY + offsetY + handOffset.y, f.baseZ + handOffset.z);
        dummyMatrix.compose(scratchPos, scratchQuat, scratchScale);
        flagMesh.setMatrixAt(f.flagIndex, dummyMatrix);
      }
    }

    bodyMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    hairMesh.instanceMatrix.needsUpdate = true;
    leftHandMesh.instanceMatrix.needsUpdate = true;
    rightHandMesh.instanceMatrix.needsUpdate = true;
    if (hatCount > 0) hatMesh.instanceMatrix.needsUpdate = true;
    if (scarfCount > 0) scarfMesh.instanceMatrix.needsUpdate = true;
    if (flagCount > 0) flagMesh.instanceMatrix.needsUpdate = true;
  }

  function triggerReaction(reaction: CrowdReaction, duration: number = 2.5) {
    currentReaction = reaction;
    reactionTimer = duration;
    reactionIntensity = 1.0;
  }

  function getFanCount(): number {
    return totalFans;
  }

  function dispose() {
    bodyGeo.dispose();
    headGeo.dispose();
    hairGeo.dispose();
    handGeo.dispose();
    hatGeo.dispose();
    scarfGeo.dispose();
    flagGeo.dispose();

    bodyMat.dispose();
    headMat.dispose();
    hairMat.dispose();
    handMat.dispose();
    hatMat.dispose();
    scarfMat.dispose();
    flagMat.dispose();

    group.clear();
  }

  return {
    group,
    update,
    triggerReaction,
    getFanCount,
    dispose,
  };
}
