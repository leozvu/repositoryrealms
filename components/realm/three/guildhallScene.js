import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createOfficeMaterialLibrary, projectOfficeUVs, bakeOfficeSurfaceInstances } from './officeMaterials.js';
import { buildMedievalWorkBay } from './medievalWorkBay.js';
import { buildMedievalArchive } from './medievalArchive.js';

/**
 * A guildhall with a removable overhead. World units are metres; +Z is the entrance.
 * All workstations are scenery: the application owns their real ERP actions.
 * Scanned material maps are bundled locally; business data belongs to the app.
 */
export function buildGuildhallScene(THREE) {
  const group = new THREE.Group();
  group.name = 'Egoric Grand Guildhall';
  const colliders = [];
  const interactables = [];
  const animated = [];
  const textures = [];
  const surfaceLibrary = createOfficeMaterialLibrary(THREE);
  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const ownGeometry = (geometry) => { ownedGeometries.add(geometry); return geometry; };
  const ownMaterial = (material) => { ownedMaterials.add(material); return material; };

  // A seeded painter supplies subtle material grain, not external artwork.
  function canvasTexture(kind) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    let seed = 73471;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    ctx.fillStyle = kind === 'wood' ? '#c1a37c' : kind === 'parchment' ? '#e2d0a0' : kind === 'rug' ? '#a1b0a0' : '#c8c2b3';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i += 1) {
      const alpha = .015 + random() * .06;
      ctx.fillStyle = `rgba(45,34,23,${alpha})`;
      const x = random() * 256;
      const y = random() * 256;
      ctx.fillRect(x, y, kind === 'wood' ? 40 + random() * 140 : 1 + random() * 4, .5 + random() * 2);
    }
    if (kind === 'parchment') {
      ctx.strokeStyle = '#ad9a73';
      ctx.lineWidth = 1;
      for (let x = 16; x < 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, 244); ctx.stroke(); }
      for (let y = 16; y < 256; y += 32) { ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(244, y); ctx.stroke(); }
      ctx.strokeStyle = '#627d6e';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(30, 218); ctx.bezierCurveTo(160, 145, 70, 130, 210, 36); ctx.stroke();
      ctx.strokeStyle = '#80663f';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i += 1) {
        const x = 35 + random() * 180;
        const y = 30 + random() * 170;
        ctx.strokeRect(x, y, 10 + random() * 25, 12 + random() * 25);
      }
      ctx.beginPath(); ctx.arc(205, 203, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(205, 175); ctx.lineTo(205, 231); ctx.moveTo(177, 203); ctx.lineTo(233, 203); ctx.stroke();
    }
    if (kind === 'rug') {
      ctx.strokeStyle = '#cfc5a2'; ctx.lineWidth = 1.5;
      ctx.strokeRect(9, 9, 238, 238); ctx.strokeRect(22, 22, 212, 212);
      for (let i = 35; i < 228; i += 21) {
        for (const [x, y] of [[i, 15], [i, 241], [15, i], [241, i]]) {
          ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.stroke();
        }
      }
      ctx.globalAlpha = .42; ctx.lineWidth = 1;
      for (const r of [33, 42, 51]) {
        ctx.beginPath(); ctx.moveTo(128, 128 - r); ctx.lineTo(128 + r, 128); ctx.lineTo(128, 128 + r); ctx.lineTo(128 - r, 128); ctx.closePath(); ctx.stroke();
      }
      for (let y = 0; y < 256; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    textures.push(texture);
    return texture;
  }

  const parchmentGrain = canvasTexture('parchment');
  const oakMaps = surfaceLibrary.maps('oak', .28);
  const mineralMaps = surfaceLibrary.maps('mineral', .55);
  const masonryMaps = surfaceLibrary.maps('masonry', .65);
  const textileMaps = surfaceLibrary.maps('textile', .42);
  const standard = (color, extra = {}, meters = 0) => {
    const material = ownMaterial(new THREE.MeshStandardMaterial({ color, roughness: .87, ...extra }));
    if (meters) material.userData.textureMeters = meters;
    if (extra.roughnessMap) {
      // These source maps include varnished regions. The guildhall uses an
      // oiled/matte finish; keep the variation without mirror-like clear coats.
      const minimum = extra.normalMap === oakMaps.normalMap ? .76 : .84;
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, ${minimum.toFixed(2)});`);
      };
      material.customProgramCacheKey = () => 'guildhall-matte-' + minimum;
    }
    return material;
  };
  const materials = {
    stone: standard('#b5b0a0', { ...mineralMaps, roughness: 1 }, 1.7),
    masonry: standard('#bbb7aa', { ...masonryMaps, roughness: 1 }, 3.6),
    paleStone: standard('#dad6c7', { ...mineralMaps, roughness: 1 }, 1.5),
    darkStone: standard('#55544e', { ...mineralMaps, roughness: 1 }, 1.6),
    stoneJoint: standard('#514d43'),
    wood: standard('#655346', { ...oakMaps, roughness: .94 }, 2.3),
    darkWood: standard('#342c27', { ...oakMaps, roughness: .92 }, 2.3),
    oak: standard('#aa8c6e', { ...oakMaps, roughness: .85 }, 2.6),
    brass: standard('#948468', { metalness: .78, roughness: .53 }),
    darkMetal: standard('#303536', { metalness: .72, roughness: .57 }),
    emerald: standard('#344137', { ...textileMaps, roughness: 1 }, .65),
    rug: standard('#555a48', { ...textileMaps, map: canvasTexture('rug'), roughness: 1 }),
    green: standard('#596449', { roughness: 1 }),
    cloth: standard('#6e7460', { ...textileMaps, roughness: 1, side: THREE.DoubleSide }, .6),
    red: standard('#66554c', { ...textileMaps, roughness: 1 }, .8),
    ivory: standard('#e1d1ac', { roughness: .95 }),
    parchment: standard('#f1dfb5', { map: parchmentGrain, roughness: .95 }),
    paper: standard('#dfcda1', { roughness: .94 }),
    leather: standard('#514333', { ...textileMaps, roughness: .87 }, .55),
    flame: standard('#efc986', { emissive: '#ffd092', emissiveIntensity: .7, roughness: .8 }),
    ember: ownMaterial(new THREE.MeshBasicMaterial({ color: '#d9772c', toneMapped: false })),
    window: standard('#d7e3df', { transparent: true, opacity: .17, depthWrite: false, roughness: .3, side: THREE.DoubleSide }),
    windowGold: standard('#beb49b', { emissive: '#ede1c5', emissiveIntensity: .5, roughness: .8 }),
  };
  const unitBox = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  const unitCylinder = ownGeometry(new THREE.CylinderGeometry(1, 1, 1, 32));
  const sphereGeometry = ownGeometry(new THREE.SphereGeometry(1, 12, 10));
  function mesh(geometry, material, parent = group) {
    const value = new THREE.Mesh(geometry, material);
    value.castShadow = true;
    value.receiveShadow = true;
    parent.add(value);
    return value;
  }
  const edgedBoxes = new Map();
  function box(x, y, z, w, h, d, material, parent = group) {
    // Millimetre-scale edge radii catch light without ballooning the furniture.
    const rounded = Math.min(w, h, d) >= .07 && Math.max(w, h, d) < 10;
    const key = `${w}:${h}:${d}`;
    if (rounded && !edgedBoxes.has(key)) edgedBoxes.set(key, ownGeometry(new RoundedBoxGeometry(w, h, d, 1, Math.min(.024, Math.min(w, h, d) * .12))));
    const value = mesh(rounded ? edgedBoxes.get(key) : unitBox, material, parent);
    value.position.set(x, y, z);
    if (!rounded) value.scale.set(w, h, d);
    return value;
  }
  function cylinder(x, y, z, radius, h, material, parent = group) {
    const value = mesh(unitCylinder, material, parent);
    value.position.set(x, y, z);
    value.scale.set(radius, h, radius);
    return value;
  }
  function sphere(x, y, z, sx, sy, sz, material, parent = group) {
    const value = mesh(sphereGeometry, material, parent);
    value.position.set(x, y, z); value.scale.set(sx, sy, sz);
    return value;
  }
  function obstacle(id, x, z, width, depth, cameraHeight = null) {
    colliders.push({ id, minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2,
      ...(cameraHeight ? { cameraBounds: { minY: 0, maxY: cameraHeight } } : {}) });
  }
  function station(id, label, x, z, radius = 2.3) {
    interactables.push({ id, label, position: { x, z }, radius });
  }
  // Baked soft contact shadows remain available in the light preset. They sit
  // beneath fixed furniture, never follow the camera or pretend to be live AO.
  const shadowPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
    const distance = Math.pow(Math.abs(x / 31.5 - 1), 4) + Math.pow(Math.abs(y / 31.5 - 1), 4);
    const at = (y * 64 + x) * 4;
    shadowPixels[at] = 22; shadowPixels[at + 1] = 18; shadowPixels[at + 2] = 13;
    shadowPixels[at + 3] = Math.round(Math.max(0, 1 - distance) ** 2 * 74);
  }
  const contactTexture = new THREE.DataTexture(shadowPixels, 64, 64);
  contactTexture.needsUpdate = true; textures.push(contactTexture);
  const contactMaterial = ownMaterial(new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  const contactGeometry = ownGeometry(new THREE.PlaneGeometry(1, 1));
  function contact(x, z, width, depth, y = .139) {
    const shade = mesh(contactGeometry, contactMaterial);
    shade.rotation.x = -Math.PI / 2; shade.position.set(x, y, z); shade.scale.set(width, depth, 1); shade.castShadow = false;
  }
  function lineBetween(a, b, thickness, material, parent = group) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const beam = mesh(unitCylinder, material, parent);
    beam.position.copy(start).add(end).multiplyScalar(.5);
    beam.scale.set(thickness, start.distanceTo(end), thickness);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    return beam;
  }
  function archShape(width, height) {
    const radius = width / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-radius, 0); shape.lineTo(radius, 0); shape.lineTo(radius, height - radius);
    shape.absarc(0, height - radius, radius, 0, Math.PI, false);
    shape.lineTo(-radius, 0);
    return shape;
  }
  function archFrame(x, y, z, width, height, thickness, material) {
    const outer = archShape(width, height);
    const inner = archShape(width - thickness * 2, height - thickness * 2);
    outer.holes.push(new THREE.Path(inner.getPoints(24).map((p) => new THREE.Vector2(p.x, p.y + thickness))));
    const geometry = ownGeometry(new THREE.ExtrudeGeometry(outer, { depth: .23, bevelEnabled: false, curveSegments: 16 }));
    const frame = mesh(geometry, material);
    frame.position.set(x, y, z);
    return frame;
  }

  // Foundation, carefully varied flagstones, and a continuous timber work floor.
  box(0, -.4, 0, 32.8, .75, 24.8, materials.darkStone);
  box(0, -.055, 0, 32, .1, 24, materials.stoneJoint);
  const tileCount = 16 * 12;
  const tiles = new THREE.InstancedMesh(unitBox, materials.stone, tileCount);
  const dummy = new THREE.Object3D();
  let tileIndex = 0;
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      dummy.position.set(-15 + col * 2, 0, -11 + row * 2);
      dummy.scale.set(1.96, .055, 1.96); dummy.updateMatrix();
      tiles.setMatrixAt(tileIndex, dummy.matrix);
      tiles.setColorAt(tileIndex, new THREE.Color().setHSL(.10, .055, .82 + ((col * 7 + row * 13) % 9) * .014));
      tileIndex += 1;
    }
  }
  tiles.receiveShadow = true; group.add(tiles);
  box(0, .04, .7, 12.7, .035, 19.8, materials.darkWood);
  const boards = new THREE.InstancedMesh(unitBox, materials.oak, 264);
  let boardIndex = 0;
  for (let row = 0; row < 48; row += 1) {
    let left = -6.35;
    const count = row % 2 ? 6 : 5;
    for (let col = 0; col < count; col += 1) {
      const width = row % 2 && (col === 0 || col === count - 1) ? 1.27 : 2.54;
      dummy.position.set(left + width / 2, .075, -9.2 + .20625 + row * .4125);
      dummy.scale.set(width - .013, .045, .3995); dummy.updateMatrix();
      boards.setMatrixAt(boardIndex, dummy.matrix);
      boards.setColorAt(boardIndex, new THREE.Color().setHSL(.08, .09, .75 + ((col * 3 + row * 5) % 8) * .027));
      boardIndex += 1;
      left += width;
    }
  }
  boards.receiveShadow = true; group.add(boards);
  for (const x of [-6.38, 6.38]) box(x, .084, .7, .055, .024, 19.85, materials.brass);

  // The overhead structure is a real interior ceiling in walking views. It
  // lifts out for the plan view, keeping the same usable room underneath.
  const ceiling = new THREE.Group(); ceiling.name = 'Guildhall overhead structure';
  box(0, 6.76, .2, 32.2, .16, 24.3, materials.darkWood, ceiling);
  for (const z of [-10, -3, 4, 10.6]) {
    box(0, 6.31, z, 31.4, .46, .34, materials.darkWood, ceiling);
    for (const x of [-12, -6, 0, 6, 12]) box(x, 6.51, z + 3, .14, .18, 6.05, materials.wood, ceiling);
  }
  ceiling.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;
    // Raycaster traverses hidden parents too. Cosmetic overhead must never
    // intercept workstation/person picks when the overview lifts it away.
    object.raycast = () => {};
  });
  // Diffuse illumination is authored alongside the cutaway overhead; real
  // architectural light baking remains a separate asset pipeline step.
  ceiling.scale.y = .78;

  // Window openings go through the masonry. The glass is no longer a painted
  // panel hiding an opaque wall; daylight and camera rays share the same holes.
  const northWallShape = new THREE.Shape();
  northWallShape.moveTo(-16.1, 0); northWallShape.lineTo(16.1, 0);
  northWallShape.lineTo(16.1, 6.5); northWallShape.lineTo(-16.1, 6.5); northWallShape.closePath();
  for (const x of [-10, 0, 10]) {
    const points = archShape(4.1, 4.65).getPoints(32).map(p => new THREE.Vector2(p.x + x, p.y + 1.05));
    northWallShape.holes.push(new THREE.Path(points));
  }
  const northWall = mesh(ownGeometry(new THREE.ExtrudeGeometry(northWallShape, { depth: .65, bevelEnabled: false, curveSegments: 24 })), materials.masonry);
  northWall.name = 'Masonry with three open window reveals';
  northWall.position.z = -12.325;
  box(0, .32, -11.55, 31.9, .65, .45, materials.darkStone);
  box(0, 5.95, -11.57, 32, .3, .4, materials.paleStone);
  box(0, 6.4, -11.6, 32.4, .2, .95, materials.darkWood);
  for (const side of [-1, 1]) {
    box(side * 16, .7, 0, .6, 1.4, 24, materials.masonry);
    box(side * 16, 1.43, 0, .78, .16, 24, materials.paleStone);
    for (const z of [-10, -3, 4, 10.6]) {
      box(side * 15.4, .3, z, 1.12, .6, 1.12, materials.darkStone);
      cylinder(side * 15.4, 3, z, .34, 5.45, materials.paleStone);
      cylinder(side * 15.4, 5.62, z, .5, .3, materials.stone);
      box(side * 15.4, 5.9, z, 1.12, .27, 1.12, materials.darkWood);
      obstacle(`column-${side}-${z}`, side * 15.4, z, 1.1, 1.1, 4.8);
    }
    box(side * 15.4, 6.07, .3, .45, .36, 22.2, materials.darkWood);
  }
  obstacle('north-wall', 0, -12, 32, .7, 5.1);
  obstacle('west-wall', -16, 0, .7, 24, 1.2);
  obstacle('east-wall', 16, 0, .7, 24, 1.2);

  // Leaded glazing has a clear view out. Restrained iron replaces gold gems.
  for (const [index, x] of [-10, 0, 10].entries()) {
    const glass = mesh(ownGeometry(new THREE.ShapeGeometry(archShape(4.1, 4.65), 24)), materials.window);
    glass.position.set(x, 1.05, -11.64); glass.castShadow = false;
    archFrame(x, .86, -11.5, 4.65, 5.1, .28, materials.paleStone);
    archFrame(x, 1.04, -11.21, 4.14, 4.65, .055, materials.darkMetal);
    box(x, 2.84, -11.13, .095, 3.62, .12, materials.darkMetal);
    box(x - 1.03, 2.55, -11.12, .055, 2.92, .09, materials.darkMetal);
    box(x + 1.03, 2.55, -11.12, .055, 2.92, .09, materials.darkMetal);
    for (const y of [2.05, 3.1, 4.12]) box(x, y, -11.1, 4.0, .055, .09, materials.darkMetal);
    const roundel = mesh(ownGeometry(new THREE.TorusGeometry(.66, .035, 6, 32)), materials.darkMetal);
    roundel.position.set(x, 4.62, -11.03);
    box(x, .94, -11.25, 5.1, .2, .8, materials.paleStone);
    if (index === 1) {
      const light = new THREE.PointLight('#d2e4ca', 12, 14, 2);
      light.position.set(x, 4, -9.5); group.add(light);
    }
  }

  // An exterior courtyard gives glazing parallax and a middle distance. These
  // buildings are beyond the playable boundary; there is no implied exit door.
  const courtyard = new THREE.Group(); courtyard.name = 'Courtyard beyond the glazing';
  courtyard.userData.physicalScale = true;
  box(0, -.12, -19.5, 39, .15, 14, materials.stone, courtyard);
  box(0, .42, -16.8, 36, .84, .45, materials.paleStone, courtyard);
  box(0, .89, -16.8, 36, .12, .58, materials.stone, courtyard);
  for (const [x, width, height] of [[-14, 7.5, 5.3], [-5.5, 8.2, 6.4], [4.6, 9.4, 5.6], [14.8, 8.8, 6.7]]) {
    box(x, height / 2, -23.3, width, height, .55, materials.paleStone, courtyard);
    box(x, height - .25, -22.98, width, .18, .16, materials.darkWood, courtyard);
    box(x, 2.4, -22.98, width, .14, .16, materials.wood, courtyard);
    for (const offset of [-width * .33, 0, width * .33]) {
      box(x + offset, height / 2, -22.95, .14, height, .16, materials.wood, courtyard);
      box(x + offset + .65, 3.55, -22.95, .7, 1.05, .08, materials.darkWood, courtyard);
      box(x + offset + .65, 3.55, -22.88, .045, 1.05, .04, materials.stone, courtyard);
    }
    for (const side of [-1, 1]) {
      const roof = box(x, height + .57, -24.2 + side * .96, width + .45, .12, 2.35, materials.darkStone, courtyard);
      roof.rotation.x = side * .55;
    }
  }
  group.add(courtyard);

  // Banner fabric hangs between windows, with a simple guild diamond crest.
  for (const x of [-5.1, 5.1]) {
    box(x, 5.25, -11.03, 1.95, .08, .15, materials.brass);
    const cloth = mesh(ownGeometry(new THREE.PlaneGeometry(1.65, 2.45, 8, 12)), materials.cloth);
    cloth.position.set(x, 3.96, -10.91);
    cloth.userData.basePositions = Float32Array.from(cloth.geometry.attributes.position.array);
    animated.push({ kind: 'banner', mesh: cloth, phase: x });
    const emblem = box(x, 4.15, -10.82, .45, .65, .055, materials.brass);
    emblem.rotation.z = Math.PI / 4;
    box(x, 3.15, -10.82, .65, .03, .055, materials.brass);
  }

  function table(x, z, width, depth, height = 1.1, finish = materials.oak) {
    contact(x, z, width + .5, depth + .55);
    const furniture = new THREE.Group(); furniture.position.set(x, 0, z); group.add(furniture);
    box(0, height, 0, width, .18, depth, finish, furniture);
    box(0, height - .2, 0, width - .2, .18, depth - .22, materials.darkWood, furniture);
    for (const lx of [-width / 2 + .3, width / 2 - .3]) {
      for (const lz of [-depth / 2 + .25, depth / 2 - .25]) {
        box(lx, height / 2 - .07, lz, .16, height - .1, .16, materials.darkWood, furniture);
        box(lx, .16, lz, .25, .2, .25, materials.brass, furniture);
      }
    }
    box(0, .28, 0, width - .45, .13, .15, materials.darkWood, furniture);
    for (const side of [-1, 1]) {
      box(0, height - .16, side * (depth / 2 - .095), width - .48, .027, .025, materials.brass, furniture);
    }
    if (width > 5) {
      for (const side of [-1, 1]) lineBetween([side * (width / 2 - .36), .3, 0], [side * .55, height - .26, 0], .055, materials.oak, furniture);
    }
    return furniture;
  }
  const chairBackGeometry = ownGeometry(new THREE.ExtrudeGeometry(archShape(.72, .99), { depth: .1, bevelEnabled: true, bevelThickness: .018, bevelSize: .018, bevelSegments: 1, curveSegments: 10 }));
  const chairInsetGeometry = ownGeometry(new THREE.ExtrudeGeometry(archShape(.53, .74), { depth: .025, bevelEnabled: true, bevelThickness: .015, bevelSize: .025, bevelSegments: 2, curveSegments: 10 }));
  function chair(x, z, angle = 0, color = materials.emerald) {
    contact(x, z, 1.15, 1.15);
    const furniture = new THREE.Group(); furniture.position.set(x, 0, z); furniture.rotation.y = angle; group.add(furniture);
    box(0, .62, 0, .75, .15, .73, materials.darkWood, furniture);
    box(0, .73, -.02, .65, .1, .62, color, furniture);
    mesh(chairBackGeometry, materials.darkWood, furniture).position.set(0, .77, .245);
    mesh(chairInsetGeometry, color, furniture).position.set(0, .86, .201);
    for (const side of [-1, 1]) sphere(side * .35, 1.48, .29, .045, .045, .045, materials.brass, furniture);
    for (const lx of [-.27, .27]) {
      for (const lz of [-.26, .26]) box(lx, .3, lz, .075, .58, .075, materials.darkWood, furniture);
    }
    obstacle(`chair-${x.toFixed(2)}-${z.toFixed(2)}`, x, z, .82, .82);
    return furniture;
  }
  function candle(x, y, z, parent = group) {
    cylinder(x, y + .025, z, .16, .045, materials.brass, parent);
    cylinder(x, y + .16, z, .045, .28, materials.brass, parent);
    cylinder(x, y + .37, z, .075, .23, materials.ivory, parent);
    const flame = sphere(x, y + .545, z, .052, .12, .048, materials.flame, parent);
    flame.castShadow = false;
    animated.push({ kind: 'flame', mesh: flame, phase: x + z, baseY: y + .545 });
  }
  function plant(x, z, scale = 1) {
    const planter = new THREE.Group(); planter.position.set(x, 0, z); planter.scale.setScalar(scale); group.add(planter);
    const potGeo = ownGeometry(new THREE.CylinderGeometry(.35, .24, .54, 12));
    const pot = mesh(potGeo, materials.darkStone, planter); pot.position.y = .29;
    cylinder(0, .55, 0, .36, .08, materials.darkStone, planter);
    for (let i = 0; i < 13; i += 1) {
      const angle = i * 2.399;
      const h = 1 + (i % 3) * .22;
      const px = Math.cos(angle) * .48;
      const pz = Math.sin(angle) * .48;
      lineBetween([0, .54, 0], [px, h, pz], .015, materials.green, planter);
      const leaf = mesh(leafGeometry, i % 2 ? materials.green : materials.emerald, planter);
      leaf.position.set(px, h, pz);
      leaf.scale.set(.65, .82, .7);
      leaf.rotation.set(Math.sin(angle) * .9, angle, Math.cos(angle) * -.7);
    }
    obstacle(`planter-${x}-${z}`, x, z, .66 * scale, .66 * scale);
  }
  function paper(x, y, z, angle = 0, parent = group) {
    const sheet = box(x, y, z, .58, .012, .76, materials.paper, parent); sheet.rotation.y = angle;
    return sheet;
  }
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -.36); leafShape.bezierCurveTo(-.19, -.15, -.16, .2, 0, .43); leafShape.bezierCurveTo(.16, .2, .19, -.15, 0, -.36);
  const leafGeometry = ownGeometry(new THREE.ExtrudeGeometry(leafShape, { depth: .018, bevelEnabled: true, bevelSize: .015, bevelThickness: .01, bevelSegments: 1, curveSegments: 7 }));
  function rug(x, z, width, depth, color = materials.rug) {
    box(x, .106, z, width, .018, depth, color);
    for (const side of [-1, 1]) {
      box(x + side * (width / 2 - .14), .118, z, .028, .006, depth - .18, materials.brass);
      box(x, .118, z + side * (depth / 2 - .14), width - .3, .006, .028, materials.brass);
    }
  }

  // The project table is the spatial anchor, with a large hand-drawn planning map.
  rug(0, .3, 9.2, 6.5);
  table(0, 0, 6.6, 2.8, 1.15);
  box(0, 1.247, 0, 4.7, .015, 2.03, materials.parchment);
  for (const x of [-2.65, 2.65]) candle(x, 1.25, -.7);
  paper(-2.65, 1.255, .56, .12);
  cylinder(2.5, 1.3, .65, .16, .11, materials.darkMetal);
  for (const x of [-1.9, 0, 1.9]) chair(x, -2.03, Math.PI);
  chair(-3.88, 0, -Math.PI / 2); chair(3.88, 0, Math.PI / 2);
  obstacle('project-worktable', 0, 0, 6.85, 3.05);
  station('project-table', 'Bàn dự án', 0, 2.65, 2.1);

  const archiveFloorY = .055 / 2 * .78;
  const archiveKit = buildMedievalArchive(THREE, { materials, ownGeometry, ownMaterial, group, obstacle, floorY: archiveFloorY });
  // A narrow elevated gallery suggests a larger building without a false walkable floor.
  box(-9.45, 3.6, -9.2, 9.7, .23, 2.15, materials.darkWood);
  box(-9.45, 4.6, -8.2, 9.7, .09, .13, materials.brass);
  for (let i = 0; i < 15; i += 1) box(-14 + i * .65, 4.12, -8.2, .045, .9, .045, materials.darkMetal);
  contact(-10, -5.8, 2.55, 1.15, archiveFloorY / .78 + .004);
  contact(-10, -4.78, .75, .75, archiveFloorY / .78 + .004);
  const workBay = buildMedievalWorkBay(THREE, { materials, ownGeometry, group, obstacle, floorY: archiveFloorY });
  station('archive', 'Thư viện hồ sơ', -10.2, -3.75);

  // The command desk sits beneath the principal window, with a brass armillary.
  rug(0, -8, 9, 4.9, materials.red);
  table(0, -8.55, 6.8, 1.65, 1.17, materials.darkWood);
  box(0, 1.275, -8.55, 3.4, .02, 1.13, materials.emerald);
  paper(-1.7, 1.3, -8.4, -.1);
  candle(-2.9, 1.28, -8.65); candle(2.9, 1.28, -8.65);
  chair(0, -10.12, Math.PI);
  const armillary = new THREE.Group(); armillary.position.set(2, 1.29, -8.55); group.add(armillary);
  cylinder(0, .04, 0, .31, .08, materials.brass, armillary);
  cylinder(0, .22, 0, .045, .36, materials.brass, armillary);
  sphere(0, .65, 0, .16, .16, .16, materials.green, armillary);
  for (const [rx, rz] of [[Math.PI / 2, 0], [.25, .4], [-.3, -.6]]) {
    const ring = mesh(ownGeometry(new THREE.TorusGeometry(.39, .018, 6, 40)), materials.brass, armillary);
    ring.position.y = .65; ring.rotation.set(rx, 0, rz);
  }
  obstacle('command-desk', 0, -8.55, 7, 1.85);
  station('command-center', 'Trung tâm chỉ huy', 0, -6.75);

  // Quest noticeboard; papers have no fictional ERP text or task counts.
  const board = new THREE.Group(); board.position.set(-12.4, 0, 2.65); board.rotation.y = .18; group.add(board);
  for (const x of [-1.25, 1.25]) {
    box(x, 1.5, 0, .16, 3, .17, materials.darkWood, board);
    box(x, .13, 0, .5, .22, .86, materials.darkWood, board);
  }
  box(0, 2.02, 0, 3.05, 1.9, .18, materials.darkWood, board);
  box(0, 2.02, .1, 2.79, 1.64, .035, materials.leather, board);
  box(0, 3.02, 0, 3.32, .14, .3, materials.brass, board);
  for (const [index, x] of [-.95, -.31, .36, .96].entries()) {
    const note = box(x, 2.2 - index % 2 * .35, .135, .47, .63, .012, materials.paper, board); note.rotation.z = (index - 1.5) * .06;
    sphere(x, 2.44 - index % 2 * .35, .165, .028, .028, .018, materials.brass, board);
  }
  obstacle('quest-noticeboard', -12.4, 2.65, 3.6, .9, 2.5);
  station('quest-board', 'Bảng nhiệm vụ', -11.9, 4.2);

  // Right-hand council room, curved rug, upholstered chairs, low dividing rail.
  cylinder(9.65, .063, -.3, 4.15, .055, materials.darkWood);
  cylinder(9.65, .1, -.3, 3.83, .025, materials.emerald);
  contact(9.65, -.3, 5.5, 5.5);
  cylinder(9.65, 1.14, -.3, 2.28, .19, materials.oak);
  cylinder(9.65, .58, -.3, .56, 1.02, materials.darkWood);
  cylinder(9.65, .15, -.3, .89, .2, materials.brass);
  cylinder(9.65, 1.242, -.3, 1.36, .014, materials.leather);
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI * 2 * i / 6;
    chair(9.65 + Math.sin(angle) * 2.95, -.3 + Math.cos(angle) * 2.95, angle, materials.emerald);
  }
  candle(9.3, 1.255, -.45); paper(10.1, 1.255, .15, -.3);
  obstacle('council-table', 9.65, -.3, 4.5, 4.5);
  station('guild-hall', 'Hội đồng bang hội', 8.15, 3.35, 2.1);
  for (const z of [-5.4, -4.2, -3]) {
    cylinder(14.15, .65, z, .075, 1.3, materials.brass);
    sphere(14.15, 1.36, z, .11, .11, .11, materials.brass);
  }
  box(14.15, 1.23, -4.2, .075, .075, 2.7, materials.darkWood);

  // A warm hearth is the counterpoint to the daylight windows.
  box(12.6, .17, -7.6, 4.9, .34, 2.65, materials.darkStone);
  for (const x of [10.64, 14.56]) box(x, 1.4, -8.3, .67, 2.5, 1.58, materials.stone);
  box(12.6, 2.79, -8.3, 4.72, .34, 1.83, materials.paleStone);
  box(12.6, 3.7, -8.6, 3.5, 1.55, .9, materials.masonry);
  box(12.6, 1.35, -9.12, 3.6, 2.35, .2, materials.darkMetal);
  const crest = box(12.6, 3.63, -8.08, .61, .82, .06, materials.brass); crest.rotation.z = Math.PI / 4;
  const fireGeometry = ownGeometry(new THREE.LatheGeometry([[0, 0], [.16, .08], [.24, .24], [.19, .47], [.09, .75], [0, 1.12]].map(([r, y]) => new THREE.Vector2(r, y)), 12));
  for (let i = 0; i < 3; i += 1) {
    const log = cylinder(11.9 + i * .65, .49, -8.0 + (i % 2) * .2, .19, 1.25, materials.darkWood); log.rotation.z = Math.PI / 2;
    const fire = mesh(fireGeometry, materials.ember);
    fire.position.set(11.9 + i * .65, .46, -8);
    fire.scale.set(.96, .86 + i % 2 * .23, .7);
    fire.rotation.z = (i - 1) * -.11;
    fire.castShadow = false; animated.push({ kind: 'fire', mesh: fire, phase: i * 2, baseY: .46, baseScaleY: fire.scale.y });
  }
  const hearthLight = new THREE.PointLight('#ffc180', 17, 11, 2);
  hearthLight.position.set(12.6, 1.4, -7.15); group.add(hearthLight);
  animated.push({ kind: 'light', light: hearthLight });
  obstacle('hearth', 12.6, -8.05, 4.9, 2.1, 3.5);

  // Treasury and chronicle occupy separate quiet work nooks near the entrance.
  const chest = new THREE.Group(); chest.position.set(-12, 0, 7.8); group.add(chest);
  box(0, .5, 0, 2.7, .95, 1.4, materials.darkWood, chest);
  const lid = mesh(ownGeometry(new THREE.CylinderGeometry(.7, .7, 2.7, 16, 1, false, 0, Math.PI)), materials.wood, chest);
  lid.rotation.z = Math.PI / 2; lid.rotation.x = Math.PI / 2; lid.position.y = .99;
  for (const x of [-.88, .88]) box(x, .62, .72, .16, 1.03, .045, materials.brass, chest);
  box(0, .94, .745, .34, .4, .075, materials.brass, chest);
  box(0, .92, .79, .055, .12, .025, materials.darkMetal, chest);
  obstacle('treasury-chest', -12, 7.8, 2.9, 1.65);
  station('treasury', 'Ngân khố', -9.8, 7.7, 2.15);

  table(-5.4, 6.45, 2.4, 1.45, 1.1, materials.darkWood);
  const book = new THREE.Group(); book.position.set(-5.4, 1.22, 6.42); book.rotation.y = -.15; group.add(book);
  box(0, 0, 0, 1.04, .06, .79, materials.red, book);
  for (const x of [-.26, .26]) { const page = box(x, .055, 0, .49, .025, .7, materials.paper, book); page.rotation.z = x * -.11; }
  candle(-6.25, 1.2, 6.27);
  chair(-5.4, 7.65);
  obstacle('chronicle-desk', -5.4, 6.45, 2.65, 1.7);
  station('chronicle', 'Biên niên sử', -5.35, 8.7, 1.9);

  // Embassy desk: a welcoming station, not a second front door.
  rug(10.5, 7.4, 6.1, 4, materials.red);
  table(10.5, 6.85, 4.55, 1.5, 1.13, materials.darkWood);
  box(10.5, .68, 7.52, 4.1, .74, .08, materials.emerald);
  box(10.5, .69, 7.58, .27, .38, .04, materials.brass).rotation.z = Math.PI / 4;
  paper(9.9, 1.245, 6.85, -.16); candle(12.05, 1.24, 6.7);
  chair(10.6, 5.68, Math.PI);
  obstacle('embassy-desk', 10.5, 6.85, 4.8, 1.7);
  station('embassy', 'Đại sứ quán', 10.5, 8.65, 1.9);

  // A few large plants and lamps soften architectural edges without fake NPCs.
  for (const [x, z, scale] of [[-7.1, -10.6, 1.25], [6.3, -10.6, 1.6], [14.1, 4.85, 1.7], [-14.6, 10.1, 1.35], [5.2, 8.4, 1.1]]) plant(x, z, scale);
  for (const x of [-6.2, 6.2]) {
    cylinder(x, .11, 10.5, .48, .22, materials.darkStone);
    cylinder(x, 1.28, 10.5, .08, 2.42, materials.brass);
    cylinder(x, 2.5, 10.5, .28, .12, materials.brass);
    sphere(x, 2.72, 10.5, .095, .2, .095, materials.flame).castShadow = false;
    const cage = mesh(ownGeometry(new THREE.TorusGeometry(.3, .022, 6, 16)), materials.darkMetal);
    cage.position.set(x, 2.8, 10.5); cage.rotation.x = Math.PI / 2;
  }
  // Medallion inset marks the spawn/arrival court. It carries no interaction.
  cylinder(0, .107, 7.2, 2.4, .02, materials.darkStone);
  const arrivalRing = mesh(ownGeometry(new THREE.TorusGeometry(2.08, .025, 6, 64)), materials.brass);
  arrivalRing.rotation.x = Math.PI / 2; arrivalRing.position.set(0, .128, 7.2);
  const arrivalMark = box(0, .124, 7.2, .94, .017, .94, materials.brass); arrivalMark.rotation.y = Math.PI / 4;
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4;
    lineBetween([Math.sin(angle) * 1.22, .135, 7.2 + Math.cos(angle) * 1.22], [Math.sin(angle) * 1.87, .135, 7.2 + Math.cos(angle) * 1.87], .017, materials.brass);
  }

  // Very sparse suspended dust only; no weather overlay conceals the work floor.
  const dustPositions = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i += 1) {
    dustPositions[i * 3] = Math.sin(i * 74.71) * 14.4;
    dustPositions[i * 3 + 1] = .8 + ((i * 37) % 53) / 11;
    dustPositions[i * 3 + 2] = Math.cos(i * 31.19) * 10;
  }
  const dustGeometry = ownGeometry(new THREE.BufferGeometry());
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = ownMaterial(new THREE.PointsMaterial({ color: '#e7d4a2', size: .028, transparent: true, opacity: .36, depthWrite: false }));
  const dust = new THREE.Points(dustGeometry, dustMaterial); group.add(dust);

  // Bake static furniture and architecture into material batches. This keeps the
  // authored detail while avoiding a draw call/shadow submission for every leaf,
  // chair leg and window mullion. Moving cloth and flames stay live.
  // Bring seats and desks to a working height relative to a 1.8 m adult.
  // Apply to child transforms once, leaving navigation X/Z in metres unchanged.
  for (const child of group.children) {
    if (child.userData.physicalScale) continue;
    child.position.y *= .78; child.scale.y *= .78;
  }
  group.updateMatrixWorld(true);
  const floorSurfaces = [tiles, boards].map((instances, index) => {
    const material = ownMaterial(instances.material.clone());
    material.vertexColors = true;
    material.onBeforeCompile = instances.material.onBeforeCompile;
    material.customProgramCacheKey = instances.material.customProgramCacheKey;
    const surface = mesh(ownGeometry(bakeOfficeSurfaceInstances(THREE, instances, material.userData.textureMeters)), material);
    surface.name = index ? 'Metric oak floor' : 'Metric flagstone floor';
    surface.castShadow = instances.castShadow;
    instances.removeFromParent();
    return surface;
  });
  const separateMeshes = new Set([...animated.map((item) => item.mesh).filter(Boolean), ...floorSurfaces]);
  const staticBatches = new Map();
  const bakedMeshes = [];
  group.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || separateMeshes.has(object)) return;
    const key = `${object.material.uuid}:${object.castShadow ? 'shadow' : 'unlit'}`;
    if (!staticBatches.has(key)) staticBatches.set(key, { material: object.material, castShadow: object.castShadow, geometries: [] });
    const transformed = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    transformed.applyMatrix4(object.matrixWorld);
    if (object.material.userData.textureMeters && !object.userData.preserveUV) projectOfficeUVs(transformed, object.material.userData.textureMeters);
    staticBatches.get(key).geometries.push(transformed);
    bakedMeshes.push(object);
  });
  for (const { material, castShadow, geometries } of staticBatches.values()) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error('Guildhall geometry batching failed');
    geometry.computeBoundingSphere();
    const combined = mesh(ownGeometry(geometry), material);
    combined.name = 'Guildhall material batch';
    combined.castShadow = castShadow;
    geometries.forEach((part) => part.dispose());
  }
  bakedMeshes.forEach((object) => object.removeFromParent());

  // Rendering batches cannot retain a per-workstation object ID. Separate,
  // non-rendering hit volumes preserve real furniture click targets. They are
  // deliberately absent from the visual/shadow passes but participate in rays.
  const pickingMaterial = ownMaterial(new THREE.MeshBasicMaterial({ visible: false }));
  const pickables = [];
  function pickVolume(id, x, y, z, width, height, depth) {
    const volume = new THREE.Mesh(unitBox, pickingMaterial);
    volume.name = `Interaction: ${id}`;
    volume.position.set(x, y, z); volume.scale.set(width, height, depth);
    volume.userData.interactableId = id;
    group.add(volume); pickables.push(volume);
  }
  pickVolume('project-table', 0, .96, 0, 6.9, 1.92, 3.1);
  pickVolume('archive', -9.45, 1.72, -9.25, 9.7, 3.44, 1.18);
  pickVolume('archive', -10, .48, -5.8, 2.2, .96, .87);
  pickVolume('command-center', 0, 1.17, -8.55, 7, 2.34, 1.85);
  pickVolume('quest-board', -12.4, 1.58, 2.65, 3.7, 3.16, 1.08);
  pickVolume('guild-hall', 9.65, .97, -.3, 4.7, 1.94, 4.7);
  pickVolume('treasury', -12, .89, 7.8, 2.92, 1.78, 1.68);
  pickVolume('chronicle', -5.4, .94, 6.45, 2.65, 1.88, 1.7);
  pickVolume('embassy', 10.5, .94, 6.85, 4.8, 1.88, 1.7);
  for (const place of interactables) {
    const targets = pickables.filter(object => object.userData.interactableId === place.id);
    targets.sort((a, b) => Math.hypot(a.position.x - place.position.x, a.position.z - place.position.z)
      - Math.hypot(b.position.x - place.position.x, b.position.z - place.position.z));
    if (targets[0]) place.focus = { x: targets[0].position.x, z: targets[0].position.z };
  }

  let elapsed = 0;
  function update(delta = 0, options = {}) {
    elapsed = Number.isFinite(options.time) ? options.time : elapsed + Math.min(delta, .1);
    const reducedMotion = options.reducedMotion === true;
    if (reducedMotion) return;
    dust.rotation.y = Math.sin(elapsed * .035) * .025;
    for (const item of animated) {
      if (item.kind === 'banner') {
        const positions = item.mesh.geometry.attributes.position;
        const original = item.mesh.userData.basePositions;
        for (let i = 0; i < positions.count; i += 1) {
          const y = original[i * 3 + 1];
          const amplitude = (1.23 - y) / 2.46;
          positions.setZ(i, Math.sin(elapsed * 1.1 + original[i * 3] * 3 + item.phase) * .045 * amplitude);
        }
        positions.needsUpdate = true;
      } else if (item.kind === 'light') {
        item.light.intensity = 17 + Math.sin(elapsed * 5.5) * .7 + Math.sin(elapsed * 11.1) * .25;
      } else {
        item.mesh.position.y = item.baseY * (item.mesh.parent === group ? .78 : 1) + Math.sin(elapsed * 6 + item.phase) * .01;
        item.mesh.scale.y = (item.baseScaleY ?? .12) * (item.mesh.parent === group ? .78 : 1) * (1 + Math.sin(elapsed * 7 + item.phase) * .09);
      }
    }
  }
  // The ceiling remains outside static batches because the overview removes it.
  ceiling.updateMatrixWorld(true);
  ceiling.traverse(object => {
    if (!object.isMesh || !object.material.userData.textureMeters) return;
    const geometry = ownGeometry(object.geometry.clone());
    geometry.applyMatrix4(object.matrixWorld);
    projectOfficeUVs(geometry, object.material.userData.textureMeters);
    // Only transfer metric UVs, retaining the local transform for the group.
    object.geometry = ownGeometry(object.geometry.clone());
    object.geometry.setAttribute('uv', geometry.attributes.uv.clone());
  });
  group.add(ceiling);
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    ownedGeometries.forEach((geometry) => geometry.dispose());
    ownedMaterials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    surfaceLibrary.dispose();
    group.clear();
  }
  return { group, colliders, interactables, pickables, update, dispose, workBay: { dimensions: workBay.dimensions, anchors: workBay.anchors },
    archive: { dimensions: archiveKit.dimensions, volumeCount: archiveKit.books.length, provenance: archiveKit.provenance },
    setCameraMode(mode) { ceiling.visible = mode !== 'overview'; }, materialsReady: surfaceLibrary.ready() };
}
