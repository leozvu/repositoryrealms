import * as THREE from 'three';

/** Keep high-quality PBR materials intact. The light tier uses vertex lighting
 * and a bounded framebuffer, so integrated GPUs can keep the same office/actions. */
export function createOfficeQuality(scene) {
  const originals = new Map(), lightweight = new Map();
  let mode = 'high';
  function lightMaterial(original) {
    if (!original.isMeshStandardMaterial) return original;
    let result = lightweight.get(original);
    if (!result) {
      result = new THREE.MeshLambertMaterial();
      for (const key of ['map', 'alphaMap', 'transparent', 'opacity', 'alphaTest', 'side', 'vertexColors', 'depthTest', 'depthWrite', 'visible', 'wireframe', 'fog']) result[key] = original[key];
      result.color = original.color;
      result.emissive = original.emissive;
      result.emissiveMap = original.emissiveMap;
      result.emissiveIntensity = original.emissiveIntensity;
      lightweight.set(original, result);
    }
    return result;
  }
  function sync() {
    scene.traverse(object => {
      if (!object.isMesh) return;
      if (!originals.has(object)) originals.set(object, object.material);
      const material = originals.get(object);
      object.material = mode === 'balanced'
        ? Array.isArray(material) ? material.map(lightMaterial) : lightMaterial(material)
        : material;
    });
    for (const object of originals.keys()) {
      let root = object;
      while (root.parent) root = root.parent;
      if (root !== scene) originals.delete(object);
    }
    const live = new Set([...originals.values()].flat());
    for (const [original, material] of lightweight) if (!live.has(original)) {
      material.dispose(); lightweight.delete(original);
    }
  }
  return {
    setMode(value) { mode = value === 'balanced' ? 'balanced' : 'high'; sync(); },
    sync,
    dispose() { lightweight.forEach(material => material.dispose()); lightweight.clear(); originals.clear(); },
  };
}

export function officePixelRatio({ mode, width, height, deviceRatio = 1, scale = 1 }) {
  const ceiling = mode === 'balanced' ? 650_000 : 2_100_000;
  const density = mode === 'balanced' ? Math.min(deviceRatio, 1) : Math.min(deviceRatio, 1.65);
  return Math.max(.2, Math.min(density, Math.sqrt(ceiling / Math.max(1, width * height))) * scale);
}

// An explicit high choice preserves PBR and shadows, but still needs a bounded
// framebuffer on slow devices. Never overwrite the user's stored preference.
export function officeResolutionFloor(mode, preference = 'auto') {
  return preference === 'clarity' ? .75 : mode === 'high' ? .55 : .45;
}

export function nextOfficeRenderBudget({ mode, manualHigh = false, scale = 1, urgent = false, preference = 'auto' }) {
  if (mode === 'high' && !manualHigh) return { mode: 'balanced', scale: 1 };
  return { mode, scale: Math.max(officeResolutionFloor(mode, preference), scale * (urgent ? .55 : .8)) };
}

/** Ignore isolated spikes; decrease resolution only after sustained slow frames.
 * Explicit quality selection resets sampling. Never claim this is a GPU benchmark. */
export function createOfficeFrameBudget() {
  let samples = [], severe = 0, healthyMs = 0;
  return {
    reset() { samples = []; severe = 0; healthyMs = 0; },
    takeRecovery() {
      if (healthyMs < 6000) return false;
      healthyMs = 0; return true;
    },
    sample(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds <= 0) return false;
      healthyMs = milliseconds <= 22 ? healthyMs + milliseconds : 0;
      severe = milliseconds > 250 ? severe + 1 : 0;
      // Eight multi-second frames would leave controls unusable for too long.
      // One compilation spike is still ignored; two consecutive stalls react.
      if (severe >= 2) { samples = []; severe = 0; return true; }
      samples.push(milliseconds);
      if (samples.length < 8) return false;
      const sorted = samples.sort((a, b) => a - b); samples = [];
      return sorted[3] > 50;
    },
  };
}
