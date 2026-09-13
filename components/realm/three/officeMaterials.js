import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original CC0 maps are bundled locally. Provenance and checksums are in
// public/realms/assets/materials/pbr-v1/manifest.json; no runtime CDN calls.
export const OFFICE_MATERIAL_ASSETS = Object.freeze({
  oak: 'oak_veneer_03', masonry: 'sandstone_blocks_05', mineral: 'grey_plaster_03', textile: 'fabric_pattern_07',
});
const ROOT = '/realms/assets/materials/pbr-v1/';

export function createOfficeMaterialLibrary(THREE, { load = typeof document !== 'undefined' } = {}) {
  const textures = new Map(), pending = [];
  let disposed = false, loaded = 0, failed = 0;
  const loader = load ? new THREE.TextureLoader() : null;
  function texture(asset, channel) {
    if (!loader) return null;
    const url = ROOT + asset + '-' + channel + '.jpg';
    if (textures.has(url)) return textures.get(url);
    const fallback = document.createElement('canvas');
    fallback.width = fallback.height = 2;
    const context = fallback.getContext('2d');
    if (context) { context.fillStyle = channel === 'normal' ? '#8080ff' : '#ffffff'; context.fillRect(0, 0, 2, 2); }
    // The texture identity never changes: the lightweight material shares this
    // object even when a user switches quality before the download completes.
    const result = new THREE.CanvasTexture(fallback);
    result.colorSpace = channel === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.anisotropy = 4;
    result.name = url;
    textures.set(url, result);
    pending.push(new Promise(resolve => {
      loader.load(url, source => {
        if (!disposed) {
          // WebGL immutable storage cannot grow from the 2px fallback to 1K.
          // Release the old GPU allocation while retaining the shared JS object.
          result.dispose(); result.image = source.image; result.needsUpdate = true; loaded += 1;
        }
        source.dispose(); resolve();
      }, undefined, () => { failed += 1; resolve(); });
    }));
    return result;
  }
  function maps(kind, normalStrength = .5) {
    const asset = OFFICE_MATERIAL_ASSETS[kind];
    if (!asset) throw new Error('Unknown office material: ' + kind);
    return {
      ...(kind !== 'textile' ? { map: texture(asset, 'color') } : {}),
      normalMap: texture(asset, 'normal'), roughnessMap: texture(asset, 'roughness'),
      normalScale: new THREE.Vector2(normalStrength, normalStrength),
    };
  }
  return {
    maps,
    ready: () => Promise.all(pending).then(() => ({ loaded, failed })),
    dispose() { if (disposed) return; disposed = true; textures.forEach(value => value.dispose()); textures.clear(); },
  };
}

/** Metric planar UVs are baked before batching, so stone blocks and wood grain
 * keep a consistent scale across walls, furniture and mouldings. */
export function projectOfficeUVs(geometry, meters = 2) {
  const positions = geometry.attributes.position, normals = geometry.attributes.normal, uv = geometry.attributes.uv;
  if (!positions || !normals || !uv) return;
  for (let i = 0; i < positions.count; i += 1) {
    const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const horizontal = ny >= nx && ny >= nz;
    uv.setXY(i, (horizontal || nz >= nx ? x : z) / meters, (horizontal ? z : y) / meters);
  }
  uv.needsUpdate = true;
}

/** Static floor instances need their own metric UVs: a unit-box UV stretches
 * the same grain over both half-length and full-length planks. Bake them into
 * one draw call, retaining per-piece tint and deterministic grain offsets. */
export function bakeOfficeSurfaceInstances(THREE, instances, meters) {
  const parts = [], transform = new THREE.Matrix4(), tint = new THREE.Color();
  try {
    for (let piece = 0; piece < instances.count; piece++) {
      const geometry = instances.geometry.index ? instances.geometry.toNonIndexed() : instances.geometry.clone();
      parts.push(geometry);
      instances.getMatrixAt(piece, transform);
      transform.premultiply(instances.matrixWorld);
      geometry.applyMatrix4(transform);
      projectOfficeUVs(geometry, meters);
      const uv = geometry.attributes.uv;
      const offsetU = (piece * 73 % 97) / 97, offsetV = (piece * 31 % 89) / 89;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + offsetU, uv.getY(i) + offsetV);
      tint.setRGB(1, 1, 1);
      if (instances.instanceColor) instances.getColorAt(piece, tint);
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const combined = mergeGeometries(parts, false);
    if (!combined) throw new Error('Cannot bake office surface instances');
    combined.computeBoundingSphere();
    return combined;
  } finally { parts.forEach(geometry => geometry.dispose()); }
}
