import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A tailored guild officer with adult proportions. Feet at y=0, face along -Z. */
export function createOfficeAvatar(THREE, options = {}) {
  const group = new THREE.Group();
  group.name = 'Realm officer';
  const rig = new THREE.Group(); rig.name = 'Officer posture'; group.add(rig);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const ownGeometry = value => { geometries.add(value); return value; };
  const color = (value, fallback) => typeof value === 'string' && /^(?:#[0-9a-f]{3}|#[0-9a-f]{6})$/i.test(value) ? value : fallback;
  const material = (name, base, extra = {}) => {
    const value = new THREE.MeshStandardMaterial({ color: base, roughness: .88, envMapIntensity: .25, ...extra });
    value.name = name; materials.add(value); return value;
  };
  // Submillimetre weave breaks up broad highlights without silhouette noise.
  // Data textures work in headless checks; no canvas or remote assets required.
  const weavePixels = new Uint8Array(48 * 48 * 4);
  for (let y = 0; y < 48; y += 1) for (let x = 0; x < 48; x += 1) {
    const index = (y * 48 + x) * 4;
    const fiber = 222 + ((x * 13 + y * 7) % 9) + ((x + y) % 4 < 2 ? 12 : 0);
    weavePixels[index] = fiber; weavePixels[index + 1] = fiber; weavePixels[index + 2] = fiber; weavePixels[index + 3] = 255;
  }
  const weave = new THREE.DataTexture(weavePixels, 48, 48, THREE.RGBAFormat);
  weave.name = 'Officer wool weave'; weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(6, 8); weave.magFilter = THREE.LinearFilter; weave.minFilter = THREE.LinearMipmapLinearFilter;
  weave.generateMipmaps = true; weave.needsUpdate = true; textures.add(weave);
  const coatColor = color(options.robeColor ?? options.color, '#315d4d');
  const skinColor = color(options.skinColor, '#bd9178');
  const coat = material('Brushed wool', coatColor, { map: weave, bumpMap: weave, bumpScale: .0007, roughness: .97, envMapIntensity: .12 });
  const capeMaterial = material('Wool mantle', coatColor, { map: weave, bumpMap: weave, bumpScale: .0007, roughness: .97, envMapIntensity: .12, side: THREE.DoubleSide });
  const shirt = material('Unbleached linen', '#d0c4ad', { map: weave, roughness: .98, envMapIntensity: .1 });
  const trousers = material('Charcoal twill', '#3b3b35', { map: weave, roughness: .96, envMapIntensity: .1 });
  const leather = material('Worn leather', '#332b26', { roughness: .76, envMapIntensity: .22 });
  const skin = material('Skin', skinColor, { roughness: .72, envMapIntensity: .28 });
  const hair = material('Hair', color(options.hairColor, '#342b25'), { roughness: .91, envMapIntensity: .12 });
  const brass = material('Aged brass', color(options.accentColor, '#a28c62'), { metalness: .66, roughness: .64, envMapIntensity: .5 });
  const eyes = material('Iris and brows', '#302b27', { roughness: .8 });
  const eyeWhite = material('Eye whites', '#bdb5a3', { roughness: .63 });
  const lipColor = new THREE.Color(skinColor).multiplyScalar(.77);
  const lips = material('Lips', lipColor, { roughness: .82 });
  const sphereGeometry = ownGeometry(new THREE.SphereGeometry(1, 14, 10));
  const boxGeometry = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  function mesh(geometry, mat, parent = rig) {
    const value = new THREE.Mesh(geometry, mat); value.castShadow = true; value.receiveShadow = true; parent.add(value); return value;
  }
  function ellipsoid(x, y, z, rx, ry, rz, mat, parent = rig) {
    const value = mesh(sphereGeometry, mat, parent); value.position.set(x, y, z); value.scale.set(rx, ry, rz); return value;
  }
  function box(x, y, z, w, h, d, mat, parent = rig) {
    const value = mesh(boxGeometry, mat, parent); value.position.set(x, y, z); value.scale.set(w, h, d); return value;
  }
  // Cross sections give cheeks, shoulders, wrists and knees their own planes.
  function loft(sections, mat, parent = rig, { segments = 20, exponent = 1, fold = 0 } = {}) {
    const positions = [], uvs = [], indices = [];
    for (let row = 0; row < sections.length; row += 1) {
      const [y, rx, rz, z = 0] = sections[row];
      for (let column = 0; column <= segments; column += 1) {
        const theta = column / segments * Math.PI * 2, sin = Math.sin(theta), cos = Math.cos(theta);
        const cloth = 1 + Math.cos(theta * 7 + row * .8) * fold;
        positions.push(Math.sign(cos) * Math.abs(cos) ** exponent * rx * cloth, y, z + Math.sign(sin) * Math.abs(sin) ** exponent * rz * cloth);
        uvs.push(column / segments, row / (sections.length - 1));
        if (row < sections.length - 1 && column < segments) {
          const a = row * (segments + 1) + column, b = a + 1, c = a + segments + 1, d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    for (const row of [0, sections.length - 1]) {
      const center = positions.length / 3, [y, , , z = 0] = sections[row];
      positions.push(0, y, z); uvs.push(.5, row ? 1 : 0);
      for (let i = 0; i < segments; i += 1) {
        const a = row * (segments + 1) + i;
        indices.push(...(row ? [center, a + 1, a] : [center, a, a + 1]));
      }
    }
    const geometry = ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return mesh(geometry, mat, parent);
  }

  const torso = new THREE.Group(); torso.name = 'Officer chest'; rig.add(torso);
  loft([[.9, .195, .119], [.95, .2, .123], [1.1, .16, .105], [1.24, .175, .12], [1.39, .213, .119], [1.47, .215, .105], [1.52, .105, .067]], coat, torso, { exponent: .78, fold: .008 });
  loft([[1.07, .165, .11], [1.108, .167, .111]], leather, torso, { exponent: .8 });
  box(0, 1.089, -.12, .054, .038, .014, brass, torso);
  box(0, 1.089, -.13, .032, .022, .009, leather, torso);
  loft([[1.48, .055, .052], [1.595, .061, .054, -.004]], skin, torso);
  box(0, 1.375, -.118, .047, .257, .013, shirt, torso);
  for (const side of [-1, 1]) {
    const lapel = box(side * .059, 1.39, -.125, .045, .22, .014, coat, torso); lapel.rotation.z = side * -.28;
    const collar = box(side * .039, 1.505, -.057, .036, .062, .027, shirt, torso); collar.rotation.z = side * -.34;
    box(side * .104, 1.193, -.115, .058, .009, .01, leather, torso);
  }
  for (const y of [1.32, 1.23, 1.145]) ellipsoid(.023, y, -.128, .008, .008, .004, brass, torso);
  const bag = loft([[.875, .054, .035], [.884, .069, .045], [1.045, .067, .039], [1.07, .055, .033]], leather);
  bag.position.set(.225, 0, .005);
  box(.225, 1.022, -.041, .017, .028, .007, brass);

  const head = new THREE.Group(); head.name = 'Officer head'; head.position.set(0, 1.704, -.009); torso.add(head);
  loft([[-.132, .035, .046, -.017], [-.115, .062, .063, -.004], [-.083, .083, .077], [-.04, .094, .087], [.016, .102, .09], [.075, .097, .088, .005], [.118, .075, .073, .009], [.135, .031, .035, .009]], skin, head, { segments: 28, exponent: .86 });
  for (const side of [-1, 1]) {
    ellipsoid(side * .102, -.008, .006, .018, .033, .013, skin, head);
    // Narrow eye openings sit beneath brows, without oversized white eyeballs.
    ellipsoid(side * .042, .012, -.087, .015, .0045, .005, eyeWhite, head);
    ellipsoid(side * .041, .012, -.092, .004, .0045, .002, eyes, head);
    const brow = ellipsoid(side * .043, .034, -.087, .026, .005, .007, hair, head); brow.rotation.z = side * -.08;
    ellipsoid(side * .042, .022, -.089, .022, .006, .006, skin, head);
    ellipsoid(side * .014, -.035, -.102, .011, .008, .01, skin, head);
  }
  loft([[-.04, .012, .007, -.099], [-.028, .012, .014, -.109], [.009, .008, .01, -.098], [.03, .006, .004, -.089]], skin, head, { segments: 12 });
  ellipsoid(0, -.065, -.085, .025, .0035, .006, lips, head);
  ellipsoid(0, -.071, -.087, .021, .004, .004, skin, head);
  // An asymmetric hairline and ridges replace the smooth helmet cap.
  const hairGeometry = ownGeometry(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI * .58));
  const hairPosition = hairGeometry.attributes.position;
  for (let i = 0; i < hairPosition.count; i += 1) {
    const x = hairPosition.getX(i), y = hairPosition.getY(i), z = hairPosition.getZ(i);
    const front = Math.max(0, -z), ridge = Math.sin((x + z * .55) * 18) * .0015 * Math.max(0, y);
    const hairline = front * (.09 + x * .035) * (1 - Math.max(0, y));
    hairPosition.setXYZ(i, x * .118, y * .147 + .008 + hairline + ridge, z * .112 + .008);
  }
  hairGeometry.computeVertexNormals(); mesh(hairGeometry, hair, head);
  for (const side of [-1, 1]) {
    const sideburn = ellipsoid(side * .094, -.003, .008, .012, .056, .04, hair, head); sideburn.rotation.z = side * .04;
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.name = `Officer shoulder ${side}`; shoulder.position.set(side * .215, 1.448, 0); torso.add(shoulder);
    shoulder.rotation.z = side * .065;
    loft([[-.292, .044, .048], [-.22, .058, .063], [-.055, .072, .071], [.019, .043, .048]], coat, shoulder, { exponent: .9, fold: .015 });
    const elbow = new THREE.Group(); elbow.name = `Officer elbow ${side}`; elbow.position.set(0, -.283, 0); shoulder.add(elbow);
    loft([[-.255, .033, .037], [-.217, .038, .04], [-.074, .052, .056], [.008, .045, .049]], coat, elbow, { fold: .018 });
    loft([[-.274, .035, .036], [-.244, .035, .038]], shirt, elbow);
    loft([[-.37, .022, .021, -.012], [-.349, .033, .024, -.012], [-.293, .033, .026], [-.27, .025, .024]], skin, elbow, { segments: 12, exponent: .8 });
    const thumb = ellipsoid(-side * .031, -.307, -.02, .014, .036, .014, skin, elbow); thumb.rotation.z = side * -.3;
    arms.push({ shoulder, elbow, side });
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.name = `Officer hip ${side}`; hip.position.set(side * .096, .97, 0); rig.add(hip);
    loft([[-.431, .055, .059], [-.34, .067, .071], [-.095, .085, .089], [.017, .088, .09]], trousers, hip, { exponent: .92, fold: .018 });
    const knee = new THREE.Group(); knee.name = `Officer knee ${side}`; knee.position.y = -.429; hip.add(knee);
    loft([[-.427, .043, .047], [-.31, .05, .053], [-.147, .062, .067], [.011, .056, .06]], trousers, knee, { fold: .02 });
    const ankle = new THREE.Group(); ankle.name = `Officer ankle ${side}`; ankle.position.set(0, -.429, 0); knee.add(ankle);
    loft([[-.058, .052, .068, -.012], [.005, .049, .051], [.067, .044, .044]], leather, ankle);
    ellipsoid(0, -.058, -.059, .061, .044, .115, leather, ankle);
    loft([[-.112, .058, .104, -.057], [-.097, .06, .108, -.057]], leather, ankle, { exponent: .8 });
    box(0, -.036, -.088, .047, .009, .048, trousers, ankle);
    legs.push({ hip, knee, ankle, side });
  }

  // The mantle sits against the upper back and opens a little during motion.
  const capeGeometry = ownGeometry(new THREE.PlaneGeometry(.44, .55, 8, 8));
  const capePosition = capeGeometry.attributes.position;
  for (let i = 0; i < capePosition.count; i += 1) {
    const t = (.275 - capePosition.getY(i)) / .55;
    capePosition.setX(i, capePosition.getX(i) * (.82 + t * .16));
    capePosition.setZ(i, .018 + Math.sin(t * Math.PI) * .027 + Math.cos(capePosition.getX(i) * 35) * t * .006);
  }
  capeGeometry.computeVertexNormals();
  const capeBase = Float32Array.from(capePosition.array);
  const cape = mesh(capeGeometry, capeMaterial, torso); cape.position.set(0, 1.225, .106);
  ellipsoid(-.12, 1.471, .042, .013, .009, .016, brass, torso);

  // Batch within each articulated bone, keeping draw calls independent of detail.
  group.updateMatrixWorld(true);
  const boneGroups = [];
  group.traverse(object => { if (object.isGroup) boneGroups.push(object); });
  for (const bone of boneGroups) {
    const batches = new Map();
    for (const child of [...bone.children]) {
      if (!child.isMesh || child === cape) continue;
      if (!batches.has(child.material)) batches.set(child.material, []);
      batches.get(child.material).push(child);
    }
    for (const [mat, children] of batches) {
      if (children.length < 2) continue;
      const parts = children.map(child => {
        const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        return geometry.applyMatrix4(child.matrix);
      });
      const combined = mergeGeometries(parts, false);
      parts.forEach(part => part.dispose());
      if (!combined) throw new Error('Avatar geometry batching failed');
      mesh(ownGeometry(combined), mat, bone);
      children.forEach(child => child.removeFromParent());
    }
  }

  let elapsed = 0, motion = 0, stridePhase = 0, normalFrame = 0, disposed = false;
  function update(delta = 0, state = {}) {
    if (disposed) return;
    const dt = Math.min(Math.max(Number.isFinite(delta) ? delta : 0, 0), .1);
    elapsed = Number.isFinite(state.time) ? state.time : elapsed + dt;
    const speed = Number.isFinite(state.speed) ? Math.max(0, state.speed) : 1;
    const target = state.moving ? Math.min(1, speed / 2.2) : 0;
    motion += (target - motion) * (1 - Math.exp(-dt * 12));
    stridePhase += dt * (5.5 + Math.min(speed, 5) * 1.3) * Math.min(1, motion * 2);
    const stride = Math.sin(stridePhase);
    rig.position.y = -.036 * motion + Math.cos(stridePhase * 2) * .003 * motion;
    torso.rotation.y = stride * .032 * motion;
    torso.rotation.z = stride * .012 * motion;
    torso.rotation.x = .017 * motion;
    head.rotation.y = -torso.rotation.y * .6 + Math.sin(elapsed * .55) * .018 * (1 - motion);
    head.rotation.x = Math.sin(elapsed * 1.8) * .004 * (1 - motion);
    for (const { shoulder, elbow, side } of arms) {
      shoulder.rotation.x = Math.cos(stridePhase) * side * .31 * motion - .028;
      shoulder.rotation.z = side * (.065 + Math.sin(elapsed * 1.8) * .004 * (1 - motion));
      elbow.rotation.x = .09 + Math.max(0, Math.cos(stridePhase) * side) * .19 * motion;
    }
    // Two-bone IK holds ankles level and lifts each foot during the swing phase.
    for (const { hip, knee, ankle, side } of legs) {
      const phase = stridePhase + (side === 1 ? Math.PI : 0);
      const forward = Math.cos(phase) * .23 * motion;
      const lift = Math.max(0, Math.sin(phase)) ** 1.5 * .09 * motion;
      const down = Math.min(.857, .858 + rig.position.y - lift);
      const distance = Math.min(.857, Math.hypot(forward, down));
      const bend = 2 * Math.acos(Math.max(0, Math.min(1, distance / .858)));
      hip.rotation.x = Math.atan2(forward, down) + bend / 2;
      knee.rotation.x = -bend;
      ankle.rotation.x = -(hip.rotation.x + knee.rotation.x);
    }
    for (let i = 0; i < capePosition.count; i += 1) {
      const t = (.275 - capeBase[i * 3 + 1]) / .55;
      const flutter = Math.sin(elapsed * (2 + motion * 2) + capeBase[i * 3] * 8) * .006;
      capePosition.setZ(i, capeBase[i * 3 + 2] + t * t * (flutter + motion * .045));
    }
    capePosition.needsUpdate = true;
    if (++normalFrame % 4 === 0) capeGeometry.computeVertexNormals();
  }
  const scale = Number.isFinite(options.scale) ? Math.max(.5, Math.min(2, options.scale)) : 1;
  group.scale.setScalar(scale);
  function dispose() {
    if (disposed) return;
    disposed = true;
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    group.clear();
  }
  function setColor(value) { const next = color(value, coatColor); coat.color.set(next); capeMaterial.color.set(next); }
  return { group, update, dispose, setColor, height: 1.86 * scale, radius: .31 * scale };
}
