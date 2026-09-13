/** Clip a camera boom against conservative AABBs, including near-plane padding.
 * This is independent of render triangles and never changes player navigation. */
export function constrainOfficeCamera(anchor, desired, colliders, radius = .18) {
  const delta = { x: desired.x - anchor.x, y: desired.y - anchor.y, z: desired.z - anchor.z };
  let fraction = 1;
  for (const box of colliders) {
    if (!box.cameraBounds) continue;
    const min = { x: box.minX - radius, y: box.cameraBounds.minY - radius, z: box.minZ - radius };
    const max = { x: box.maxX + radius, y: box.cameraBounds.maxY + radius, z: box.maxZ + radius };
    let entry = 0, exit = 1, intersects = true;
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(delta[axis]) < 1e-9) {
        if (anchor[axis] < min[axis] || anchor[axis] > max[axis]) { intersects = false; break; }
      } else {
        const a = (min[axis] - anchor[axis]) / delta[axis], b = (max[axis] - anchor[axis]) / delta[axis];
        entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
        if (entry > exit) { intersects = false; break; }
      }
    }
    if (intersects && exit >= 0 && entry <= 1) fraction = Math.min(fraction, Math.max(0, entry - .002));
  }
  return { x: anchor.x + delta.x * fraction, y: anchor.y + delta.y * fraction, z: anchor.z + delta.z * fraction };
}
