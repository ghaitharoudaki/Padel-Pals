import * as THREE from 'three';
import { COURT_CONFIG } from './types';

export interface CourtVisuals {
  group: THREE.Group;
  aimIndicator: THREE.Mesh;
  ballShadow: THREE.Mesh;
  p1Shadow: THREE.Mesh;
  p2Shadow: THREE.Mesh;
  p3Shadow: THREE.Mesh;
  p4Shadow: THREE.Mesh;
  landingRing: THREE.Mesh;
  landingDot: THREE.Mesh;
  updateAim: (x: number, z: number, visible: boolean) => void;
  updateShadows: (
    ballPos: THREE.Vector3,
    p1Pos: THREE.Vector3,
    p2Pos: THREE.Vector3,
    p3Pos?: THREE.Vector3,
    p4Pos?: THREE.Vector3,
    isDoubles?: boolean
  ) => void;
  updateLandingPrediction: (x: number, z: number, timeToBounce: number, inPlay: boolean) => void;
  updateCrowd: (time: number, dt: number, isCheering: boolean) => void;
  triggerCheerBurst: (x?: number, z?: number) => void;
}

/**
 * Procedural authentic synthetic padel court turf texture (tournament deep sapphire blue)
 */
function createTurfTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Deep tournament sapphire turf base
  ctx.fillStyle = '#024b80';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle striped turf roller pattern
  for (let y = 0; y < 512; y += 64) {
    ctx.fillStyle = 'rgba(3, 105, 161, 0.22)';
    ctx.fillRect(0, y, 512, 32);
  }

  // Fine synthetic grass fibers
  ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillRect(x, y, 1.5, 3);
  }

  // Deep indigo shadow fibers
  ctx.fillStyle = 'rgba(3, 37, 65, 0.45)';
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillRect(x, y, 1.5, 2.5);
  }

  // Silicate sand silica particulate layer
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillRect(x, y, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 16);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Procedural dark metallic gray cross-hatch wire mesh texture
 */
function createWireMeshTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Transparent dark base
  ctx.clearRect(0, 0, 128, 128);

  // Dark metallic steel grid lines
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;

  // Diamond / Square cross-hatch
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }

  // Metallic specular sheen on wire intersections
  ctx.fillStyle = '#64748b';
  for (let x = 0; x <= 128; x += 16) {
    for (let y = 0; y <= 128; y += 16) {
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build professional modern indoor padel stadium arena
 */
export function buildPadelCourt(renderer: THREE.WebGLRenderer): CourtVisuals {
  const courtGroup = new THREE.Group();

  const halfL = COURT_CONFIG.length / 2; // 10m
  const halfW = COURT_CONFIG.width / 2;  // 5m

  // 1. Sleek Modern Arena Concourse Floor (Dark Slate/Anthracite surround)
  const concourseGeo = new THREE.PlaneGeometry(60, 60);
  const concourseMat = new THREE.MeshStandardMaterial({
    color: 0x0a0f1d,
    roughness: 0.6,
    metalness: 0.2,
  });
  const concourse = new THREE.Mesh(concourseGeo, concourseMat);
  concourse.rotation.x = -Math.PI / 2;
  concourse.position.y = -0.01;
  courtGroup.add(concourse);

  // Modern court perimeter safety apron (charcoal track)
  const apronGeo = new THREE.PlaneGeometry(COURT_CONFIG.width + 4.0, COURT_CONFIG.length + 5.0);
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.7,
    metalness: 0.1,
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.001;
  courtGroup.add(apron);

  // 2. High-Tech Padel Court Turf (Textured Deep Tournament Sapphire Blue)
  const turfGeo = new THREE.PlaneGeometry(COURT_CONFIG.width, COURT_CONFIG.length);
  const turfTex = createTurfTexture();
  turfTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const turfMat = new THREE.MeshStandardMaterial({
    map: turfTex,
    roughness: 0.85,
    metalness: 0.05,
  });
  const turfMesh = new THREE.Mesh(turfGeo, turfMat);
  turfMesh.rotation.x = -Math.PI / 2;
  turfMesh.position.y = 0.004;
  courtGroup.add(turfMesh);

  // 3. Crisp, Bright White Regulation Court Lines (Elevated to avoid clipping/z-fighting)
  const lineMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });

  const linesGroup = new THREE.Group();
  linesGroup.position.y = 0.008;

  const createLine = (w: number, l: number, x: number, z: number) => {
    const geo = new THREE.PlaneGeometry(w, l);
    const mesh = new THREE.Mesh(geo, lineMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0, z);
    linesGroup.add(mesh);
  };

  const lineWidth = 0.075; // Standard 7.5cm width padel line
  createLine(COURT_CONFIG.width, lineWidth, 0, -halfL);
  createLine(COURT_CONFIG.width, lineWidth, 0, halfL);
  createLine(lineWidth, COURT_CONFIG.length, -halfW, 0);
  createLine(lineWidth, COURT_CONFIG.length, halfW, 0);

  // Service lines (Z = ±6.95m from net)
  createLine(COURT_CONFIG.width, lineWidth, 0, -6.95);
  createLine(COURT_CONFIG.width, lineWidth, 0, 6.95);

  // Center service line dividing service boxes
  createLine(lineWidth, 6.95 * 2, 0, 0);
  courtGroup.add(linesGroup);

  // 4. Center Net and Regulation Posts
  const netMat = new THREE.MeshBasicMaterial({
    color: 0x09090b,
    wireframe: true,
    transparent: true,
    opacity: 0.9,
  });
  const netGeo = new THREE.PlaneGeometry(COURT_CONFIG.width, COURT_CONFIG.netHeight);
  const netMesh = new THREE.Mesh(netGeo, netMat);
  netMesh.position.set(0, COURT_CONFIG.netHeight / 2, 0);
  courtGroup.add(netMesh);

  // White vinyl top headband with tension cable
  const bandGeo = new THREE.BoxGeometry(COURT_CONFIG.width + 0.08, 0.07, 0.035);
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const bandMesh = new THREE.Mesh(bandGeo, bandMat);
  bandMesh.position.set(0, COURT_CONFIG.netHeight + 0.03, 0);
  courtGroup.add(bandMesh);

  // Steel Net Posts with tension winch
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.05, 16);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 });
  const postL = new THREE.Mesh(postGeo, postMat);
  postL.position.set(-halfW - 0.06, 0.525, 0);
  const postR = new THREE.Mesh(postGeo, postMat);
  postR.position.set(halfW + 0.06, 0.525, 0);
  courtGroup.add(postL, postR);

  // 5. Distinct Wall Materials
  // Semi-Transparent Light Blue/Cyan Frosted Safety Glass Back Walls with Crisp Specular Highlights
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.35,
    roughness: 0.08,
    metalness: 0.1,
    transmission: 0.85,
    ior: 1.5,
    reflectivity: 0.9,
    depthWrite: false,
  });

  // Dark metallic structural frame material
  const steelFrameMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.85,
    roughness: 0.25,
  });

  // North Glass Wall (Opponent Baseline Glass, Z = -10m, Height 3m)
  const backGlassGeo = new THREE.PlaneGeometry(COURT_CONFIG.width, 3.0);
  const backGlassNorth = new THREE.Mesh(backGlassGeo, glassMat);
  backGlassNorth.position.set(0, 1.5, -halfL);
  courtGroup.add(backGlassNorth);

  // Structural header beam over North glass
  const beamGeo = new THREE.BoxGeometry(COURT_CONFIG.width + 0.15, 0.09, 0.09);
  const beamNorth = new THREE.Mesh(beamGeo, steelFrameMat);
  beamNorth.position.set(0, 3.045, -halfL);
  courtGroup.add(beamNorth);

  // Vertical steel posts for North glass panels
  [-halfW, -halfW / 2, 0, halfW / 2, halfW].forEach(px => {
    const glassPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.0, 12), steelFrameMat);
    glassPost.position.set(px, 1.5, -halfL);
    courtGroup.add(glassPost);
  });

  // South Glass Wall (Player Baseline Glass, Z = +10m)
  const backGlassSouth = new THREE.Mesh(backGlassGeo, glassMat);
  backGlassSouth.position.set(0, 1.5, halfL);
  courtGroup.add(backGlassSouth);

  const beamSouth = new THREE.Mesh(beamGeo, steelFrameMat);
  beamSouth.position.set(0, 3.045, halfL);
  courtGroup.add(beamSouth);

  // Side Glass Panels (First 4m extending from corners along the sidelines)
  const sideGlassGeo = new THREE.BoxGeometry(0.04, 3.0, 4.0);
  const nwGlass = new THREE.Mesh(sideGlassGeo, glassMat);
  nwGlass.position.set(-halfW, 1.5, -8);
  const neGlass = new THREE.Mesh(sideGlassGeo, glassMat);
  neGlass.position.set(halfW, 1.5, -8);
  const swGlass = new THREE.Mesh(sideGlassGeo, glassMat);
  swGlass.position.set(-halfW, 1.5, 8);
  const seGlass = new THREE.Mesh(sideGlassGeo, glassMat);
  seGlass.position.set(halfW, 1.5, 8);
  courtGroup.add(nwGlass, neGlass, swGlass, seGlass);

  // Side Wire-Mesh Fences with Dark Metallic Gray Cross-Hatch Texture
  const wireMeshTex = createWireMeshTexture();
  const wireMeshMat = new THREE.MeshStandardMaterial({
    map: wireMeshTex,
    color: 0x94a3b8,
    metalness: 0.75,
    roughness: 0.35,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Middle side fences (12m span between glass corners, 3m height)
  const sideFenceGeo = new THREE.PlaneGeometry(12, 3.0);
  const fenceWest = new THREE.Mesh(sideFenceGeo, wireMeshMat);
  fenceWest.position.set(-halfW, 1.5, 0);
  fenceWest.rotation.y = Math.PI / 2;

  const fenceEast = new THREE.Mesh(sideFenceGeo, wireMeshMat);
  fenceEast.position.set(halfW, 1.5, 0);
  fenceEast.rotation.y = -Math.PI / 2;
  courtGroup.add(fenceWest, fenceEast);

  // Top structural beams along sidelines
  const sideBeamGeo = new THREE.BoxGeometry(0.08, 0.08, COURT_CONFIG.length);
  const sideBeamW = new THREE.Mesh(sideBeamGeo, steelFrameMat);
  sideBeamW.position.set(-halfW, 3.04, 0);
  const sideBeamE = new THREE.Mesh(sideBeamGeo, steelFrameMat);
  sideBeamE.position.set(halfW, 3.04, 0);
  courtGroup.add(sideBeamW, sideBeamE);

  // Side fence upright posts
  [-halfW, halfW].forEach(sideX => {
    [-6, -2, 2, 6].forEach(postZ => {
      const fencePost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.0, 12), steelFrameMat);
      fencePost.position.set(sideX, 1.5, postZ);
      courtGroup.add(fencePost);
    });
  });

  // 6. Modern Indoor Padel Arena / Stadium Surroundings
  const arenaWallMat = new THREE.MeshStandardMaterial({
    color: 0x09090b,
    roughness: 0.8,
    metalness: 0.3,
  });

  // Arena North Wall
  const arenaWallN = new THREE.Mesh(new THREE.PlaneGeometry(50, 16), arenaWallMat);
  arenaWallN.position.set(0, 8, -22);
  courtGroup.add(arenaWallN);

  // Arena East/West Walls
  const arenaWallW = new THREE.Mesh(new THREE.PlaneGeometry(44, 16), arenaWallMat);
  arenaWallW.position.set(-20, 8, 0);
  arenaWallW.rotation.y = Math.PI / 2;
  const arenaWallE = new THREE.Mesh(new THREE.PlaneGeometry(44, 16), arenaWallMat);
  arenaWallE.position.set(20, 8, 0);
  arenaWallE.rotation.y = -Math.PI / 2;
  courtGroup.add(arenaWallW, arenaWallE);

  // Glowing Stadium LED Ribbon Banners (World Padel Tour style)
  const ledBannerMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
  });
  const ledBannerN = new THREE.Mesh(new THREE.BoxGeometry(46, 0.6, 0.1), ledBannerMat);
  ledBannerN.position.set(0, 4.5, -21.9);
  courtGroup.add(ledBannerN);

  const ledBannerW = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 40), ledBannerMat);
  ledBannerW.position.set(-19.9, 4.5, 0);
  const ledBannerE = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 40), ledBannerMat);
  ledBannerE.position.set(19.9, 4.5, 0);
  courtGroup.add(ledBannerW, ledBannerE);

  // Arena Overhead Floodlight Pillars with Emissive Light Banks
  const floodlightPositions = [
    [-8, 7.5, -10],
    [8, 7.5, -10],
    [-8, 7.5, 10],
    [8, 7.5, 10],
  ];

  const lightFixtureMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  floodlightPositions.forEach(([fx, fy, fz]) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, fy, 8), steelFrameMat);
    mast.position.set(fx, fy / 2, fz);
    courtGroup.add(mast);

    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.7), steelFrameMat);
    head.position.set(fx, fy, fz);
    head.lookAt(0, 1, 0);
    courtGroup.add(head);

    const emitter = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.38), lightFixtureMat);
    emitter.position.set(fx, fy, fz);
    emitter.lookAt(0, 1, 0);
    emitter.translateZ(0.36);
    courtGroup.add(emitter);
  });

  // --- Glass Panel Crisp White Safety Outline Borders ---
  const glassOutlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const addGlassBorder = (w: number, h: number, x: number, y: number, z: number, rotY: number = 0) => {
    const borderGroup = new THREE.Group();
    borderGroup.position.set(x, y, z);
    borderGroup.rotation.y = rotY;

    const hBarGeo = new THREE.BoxGeometry(w, 0.035, 0.02);
    const topBar = new THREE.Mesh(hBarGeo, glassOutlineMat);
    topBar.position.set(0, h / 2 - 0.02, 0);
    const bottomBar = new THREE.Mesh(hBarGeo, glassOutlineMat);
    bottomBar.position.set(0, -h / 2 + 0.02, 0);

    const dotGeo = new THREE.CircleGeometry(0.025, 8);
    for (let dx = -w / 2 + 0.4; dx < w / 2; dx += 0.5) {
      const dot = new THREE.Mesh(dotGeo, glassOutlineMat);
      dot.position.set(dx, 0, 0.015);
      borderGroup.add(dot);
    }

    borderGroup.add(topBar, bottomBar);
    courtGroup.add(borderGroup);
  };

  addGlassBorder(COURT_CONFIG.width, 3.0, 0, 1.5, -halfL);
  addGlassBorder(COURT_CONFIG.width, 3.0, 0, 1.5, halfL);
  addGlassBorder(4.0, 3.0, -halfW, 1.5, -8, Math.PI / 2);
  addGlassBorder(4.0, 3.0, halfW, 1.5, -8, Math.PI / 2);
  addGlassBorder(4.0, 3.0, -halfW, 1.5, 8, Math.PI / 2);
  addGlassBorder(4.0, 3.0, halfW, 1.5, 8, Math.PI / 2);

  // 7. CLEAN ARCHITECTURAL GRANDSTAND TIERS (Replaces goofy block fans)
  const bleacherMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.2,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // World Padel Tour tournament blue stadium seats
    roughness: 0.5,
    metalness: 0.1,
  });

  // North Architectural Grandstand (behind North glass wall, extended back)
  for (let tier = 0; tier < 6; tier++) {
    const tierZ = -halfL - 2.0 - tier * 1.5;
    const tierY = 0.5 + tier * 0.75;
    const stepGeo = new THREE.BoxGeometry(COURT_CONFIG.width + 12, 0.75, 1.5);
    const stepMesh = new THREE.Mesh(stepGeo, bleacherMat);
    stepMesh.position.set(0, tierY - 0.375, tierZ);
    courtGroup.add(stepMesh);

    // Architectural row of modern stadium seats
    const seatRowGeo = new THREE.BoxGeometry(COURT_CONFIG.width + 11.6, 0.20, 0.55);
    const seatRow = new THREE.Mesh(seatRowGeo, seatMat);
    seatRow.position.set(0, tierY + 0.10, tierZ - 0.25);
    courtGroup.add(seatRow);
  }

  // West & East Side Architectural Grandstands (filling space to perimeter walls)
  [-1, 1].forEach(sideSign => {
    const standX = (halfW + 2.5) * sideSign;
    for (let tier = 0; tier < 5; tier++) {
      const stepX = standX + tier * 1.5 * sideSign;
      const stepY = 0.5 + tier * 0.75;
      const stepGeo = new THREE.BoxGeometry(1.5, 0.75, 26);
      const stepMesh = new THREE.Mesh(stepGeo, bleacherMat);
      stepMesh.position.set(stepX, stepY - 0.375, 0);
      courtGroup.add(stepMesh);

      // Clean seat row
      const seatRowGeo = new THREE.BoxGeometry(0.55, 0.20, 25.4);
      const seatRow = new THREE.Mesh(seatRowGeo, seatMat);
      seatRow.position.set(stepX + 0.25 * sideSign, stepY + 0.10, 0);
      courtGroup.add(seatRow);
    }
  });

  // Modern Electronic Stadium Jumbotron Scoreboard on North Wall
  const jumbotronCanvas = document.createElement('canvas');
  jumbotronCanvas.width = 1024;
  jumbotronCanvas.height = 256;
  const jctx = jumbotronCanvas.getContext('2d')!;
  jctx.fillStyle = '#09090b';
  jctx.fillRect(0, 0, 1024, 256);
  jctx.strokeStyle = '#38bdf8';
  jctx.lineWidth = 8;
  jctx.strokeRect(8, 8, 1008, 240);
  jctx.fillStyle = '#38bdf8';
  jctx.font = 'bold 36px sans-serif';
  jctx.textAlign = 'center';
  jctx.fillText('PADEL PALS • CHAMPIONSHIP ARENA', 512, 54);
  jctx.fillStyle = '#3b82f6';
  jctx.font = '900 48px sans-serif';
  jctx.textAlign = 'left';
  jctx.fillText('TEAM BLUE', 80, 135);
  jctx.fillStyle = '#ef4444';
  jctx.font = '900 48px sans-serif';
  jctx.textAlign = 'right';
  jctx.fillText('TEAM RED', 1024 - 80, 135);
  jctx.fillStyle = '#facc15';
  jctx.font = '900 52px sans-serif';
  jctx.textAlign = 'center';
  jctx.fillText('VS', 512, 135);
  jctx.fillStyle = '#94a3b8';
  jctx.font = 'bold 28px sans-serif';
  jctx.fillText('FIRST TO 6 GAMES • PRO REGULATION', 512, 210);

  const jumbotronTex = new THREE.CanvasTexture(jumbotronCanvas);
  jumbotronTex.colorSpace = THREE.SRGBColorSpace;
  const jumbotronMat = new THREE.MeshBasicMaterial({ map: jumbotronTex });
  const jumbotronMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.0), jumbotronMat);
  jumbotronMesh.position.set(0, 8.5, -21.8);
  courtGroup.add(jumbotronMesh);

  // 8. Dynamic Particle Confetti Cannon (Celebration bursts on smashes & game points)
  const confettiCount = 60;
  const confettiGeo = new THREE.PlaneGeometry(0.14, 0.14);
  const confettiGroup = new THREE.Group();
  confettiGroup.visible = false;
  courtGroup.add(confettiGroup);

  const celebrationColors = [
    0x38bdf8, // Sky Cyan
    0xfacc15, // Golden Yellow
    0xec4899, // Pink
    0x22c55e, // Emerald
    0xa855f7, // Purple
    0xffffff, // Crisp White
  ];

  interface ConfettiParticle {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    rotX: number;
    rotY: number;
    life: number;
  }

  const confettiParticles: ConfettiParticle[] = [];
  for (let i = 0; i < confettiCount; i++) {
    const col = celebrationColors[i % celebrationColors.length];
    const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(confettiGeo, mat);
    confettiGroup.add(mesh);
    confettiParticles.push({
      mesh,
      vx: 0,
      vy: 0,
      vz: 0,
      rotX: Math.random() * 5,
      rotY: Math.random() * 5,
      life: 0,
    });
  }

  const triggerCheerBurst = (x = 0, z = 0) => {
    confettiGroup.visible = true;
    confettiParticles.forEach(p => {
      p.mesh.position.set(x + (Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 0.8, z + (Math.random() - 0.5) * 1.5);
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5.0;
      p.vx = Math.cos(angle) * speed * 0.6;
      p.vy = 4.5 + Math.random() * 5.5;
      p.vz = Math.sin(angle) * speed * 0.6;
      p.life = 1.0;
    });
  };

  // 9. Mouse Aim Target Crosshair (Golden Arcade Ring)
  const aimGeo = new THREE.RingGeometry(0.26, 0.34, 24);
  const aimMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const aimIndicator = new THREE.Mesh(aimGeo, aimMat);
  aimIndicator.rotation.x = -Math.PI / 2;
  aimIndicator.position.set(0, 0.02, -5);
  courtGroup.add(aimIndicator);

  // 10. Ball Landing Prediction Indicator (Contracting timing circle)
  const landingDotGeo = new THREE.CircleGeometry(0.24, 24);
  const landingDotMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const landingDot = new THREE.Mesh(landingDotGeo, landingDotMat);
  landingDot.rotation.x = -Math.PI / 2;
  landingDot.position.set(0, 0.015, 0);
  landingDot.visible = false;
  courtGroup.add(landingDot);

  const landingRingGeo = new THREE.RingGeometry(0.34, 0.42, 28);
  const landingRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const landingRing = new THREE.Mesh(landingRingGeo, landingRingMat);
  landingRing.rotation.x = -Math.PI / 2;
  landingRing.position.set(0, 0.016, 0);
  landingRing.visible = false;
  courtGroup.add(landingRing);

  // 11. Contact Shadows for All 4 Players & Ball
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x021626, // Deep sapphire turf shadow
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), shadowMat.clone());
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.005;
  courtGroup.add(ballShadow);

  const playerShadowGeo = new THREE.CircleGeometry(0.65, 24);
  const p1Shadow = new THREE.Mesh(playerShadowGeo, shadowMat.clone());
  p1Shadow.rotation.x = -Math.PI / 2;
  p1Shadow.position.y = 0.005;
  courtGroup.add(p1Shadow);

  const p2Shadow = new THREE.Mesh(playerShadowGeo, shadowMat.clone());
  p2Shadow.rotation.x = -Math.PI / 2;
  p2Shadow.position.y = 0.005;
  courtGroup.add(p2Shadow);

  const p3Shadow = new THREE.Mesh(playerShadowGeo, shadowMat.clone());
  p3Shadow.rotation.x = -Math.PI / 2;
  p3Shadow.position.y = 0.005;
  p3Shadow.visible = false;
  courtGroup.add(p3Shadow);

  const p4Shadow = new THREE.Mesh(playerShadowGeo, shadowMat.clone());
  p4Shadow.rotation.x = -Math.PI / 2;
  p4Shadow.position.y = 0.005;
  p4Shadow.visible = false;
  courtGroup.add(p4Shadow);

  const updateAim = (x: number, z: number, visible: boolean) => {
    aimIndicator.visible = visible;
    aimIndicator.position.x = Math.max(-halfW + 0.5, Math.min(halfW - 0.5, x));
    aimIndicator.position.z = Math.max(-halfL + 0.5, Math.min(halfL - 0.5, z));
  };

  const updateShadows = (
    ballPos: THREE.Vector3,
    p1Pos: THREE.Vector3,
    p2Pos: THREE.Vector3,
    p3Pos?: THREE.Vector3,
    p4Pos?: THREE.Vector3,
    isDoubles = false
  ) => {
    const bHeight = Math.max(0, ballPos.y);
    const bScale = Math.max(0.12, 1 - bHeight * 0.12);
    ballShadow.position.set(ballPos.x, 0.005, ballPos.z);
    ballShadow.scale.set(bScale, bScale, 1);
    (ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.5 - bHeight * 0.05);

    p1Shadow.position.set(p1Pos.x, 0.005, p1Pos.z);
    p2Shadow.position.set(p2Pos.x, 0.005, p2Pos.z);

    if (isDoubles && p3Pos && p4Pos) {
      p3Shadow.visible = true;
      p4Shadow.visible = true;
      p3Shadow.position.set(p3Pos.x, 0.005, p3Pos.z);
      p4Shadow.position.set(p4Pos.x, 0.005, p4Pos.z);
    } else {
      p3Shadow.visible = false;
      p4Shadow.visible = false;
    }
  };

  const updateLandingPrediction = (x: number, z: number, timeToBounce: number, inPlay: boolean) => {
    if (!inPlay || timeToBounce <= 0.04) {
      landingDot.visible = false;
      landingRing.visible = false;
      return;
    }

    landingDot.visible = true;
    landingRing.visible = true;
    landingDot.position.set(x, 0.015, z);
    landingRing.position.set(x, 0.016, z);

    // Contracting timing ring that shrinks towards center
    const ringScale = Math.max(0.6, Math.min(3.4, timeToBounce * 2.2));
    landingRing.scale.set(ringScale, ringScale, 1);

    const isInside = Math.abs(x) <= halfW && Math.abs(z) <= halfL;
    const col = isInside ? 0x38bdf8 : 0xef4444;
    (landingDot.material as THREE.MeshBasicMaterial).color.setHex(col);
    (landingRing.material as THREE.MeshBasicMaterial).color.setHex(col);
  };

  const updateCrowd = (time: number, dt: number, isCheering: boolean) => {
    // Subtle ambient arena LED pulse
    if (ledBannerMat) {
      const pulse = Math.sin(time * 2.0) * 0.15 + 0.85;
      ledBannerMat.color.setRGB(0.22 * pulse, 0.74 * pulse, 0.97 * pulse);
    }

    // Animate confetti particles if active
    if (confettiGroup.visible) {
      let anyAlive = false;
      for (let i = 0; i < confettiParticles.length; i++) {
        const p = confettiParticles[i];
        if (p.life > 0) {
          anyAlive = true;
          p.life -= dt * 0.45;
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.vy -= 8.5 * dt; // gravity
          p.mesh.position.z += p.vz * dt;
          p.mesh.rotation.x += p.rotX * dt;
          p.mesh.rotation.y += p.rotY * dt;
          const s = Math.max(0.01, p.life);
          p.mesh.scale.set(s, s, s);
        }
      }
      if (!anyAlive) {
        confettiGroup.visible = false;
      }
    }
  };

  return {
    group: courtGroup,
    aimIndicator,
    ballShadow,
    p1Shadow,
    p2Shadow,
    p3Shadow,
    p4Shadow,
    landingRing,
    landingDot,
    updateAim,
    updateShadows,
    updateLandingPrediction,
    updateCrowd,
    triggerCheerBurst,
  };
}
