import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** One authored construction kit in metres. It shares the hall's material and
 * disposal ownership and is baked into its static batches, not a second scene. */
export function buildMedievalWorkBay(THREE, { materials: m, ownGeometry, group, obstacle, floorY = 0 }) {
  const bay = new THREE.Group();
  bay.name = 'Medieval archive work bay';
  bay.position.set(-11, floorY, -5);
  bay.userData.physicalScale = true;
  group.add(bay);
  const parts = {};
  const shapes = new Map();
  function part(name, w, h, d, x, y, z, material = m.wood, parent = bay, radius = .004) {
    const key = [w, h, d, radius].join(':');
    if (!shapes.has(key)) {
      const g = ownGeometry(new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, Math.min(w, h, d) * .12)));
      // Grain follows the longest construction axis before the part is rotated.
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      const axis = w >= h && w >= d ? 0 : h >= d ? 1 : 2;
      for (let i = 0; i < p.count; i++) {
        const v = [p.getX(i), p.getY(i), p.getZ(i)];
        const normal = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))];
        const face = normal.indexOf(Math.max(...normal));
        const u = face === axis ? (axis + 1) % 3 : axis;
        const t = [0, 1, 2].find(a => a !== face && a !== u) ?? (axis + 2) % 3;
        uv.setXY(i, v[u] / 1.35, v[t] / 1.35);
      }
      shapes.set(key, g);
    }
    const mesh = new THREE.Mesh(shapes.get(key), material);
    mesh.name = name; mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.preserveUV = true;
    parent.add(mesh); parts[name] = mesh;
    return mesh;
  }
  function turned(name, points, x, y, z, material, parent = bay) {
    const geometry = ownGeometry(new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), 16));
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.preserveUV = true; parent.add(mesh); parts[name] = mesh;
    return mesh;
  }
  function brace(name, a, b, width, depth, material = m.darkWood, parent = bay) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const beam = part(name, width, start.distanceTo(end), depth, 0, 0, 0, material, parent);
    beam.position.copy(start).add(end).multiplyScalar(.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    return beam;
  }

  // Pegged, braced screen defines the edge of a quiet bay without a false door.
  // It sits clear of the library's existing approach and all eight ERP portals.
  for (const z of [-3.1, 3.35]) {
    part('Stone plinth ' + z, .4, .18, .4, -3.3, .09, z, m.paleStone);
    part('Oak post ' + z, .19, 3.55, .19, -3.3, 1.95, z, m.darkWood);
    brace('Knee brace ' + z, [-3.3, 2.7, z], [-3.3, 3.55, z + (z < 0 ? .9 : -.9)], .14, .14);
    obstacle('work-bay-post-' + z, -14.3, -5 + z, .4, .4, 3.85);
  }
  part('Bay head beam', .22, .24, 6.9, -3.3, 3.68, .1, m.darkWood);
  for (const z of [-2.6, -1.5, -.4, .7, 1.8, 2.9]) {
    part('Wainscot panel ' + z, .065, .78, 1.04, -3.32, .61, z, m.wood);
    part('Wainscot stile ' + z, .105, 1.08, .065, -3.27, .64, z - .54, m.darkWood);
  }
  part('Wainscot cap', .15, .065, 6.72, -3.27, 1.17, .1, m.oak);
  obstacle('work-bay-screen', -14.3, -4.9, .18, 6.8, 1.23);

  const desk = new THREE.Group(); desk.name = 'Pegged oak writing desk';
  desk.position.set(1, 0, -.8); bay.add(desk);
  // Surface is 75 cm above the actual floor, with separate boards and end caps.
  for (let i = 0; i < 4; i++) {
    const plank = part('Desk plank ' + i, 2.08, .046, .207, 0, .727, -.315 + i * .211, m.oak, desk, .003);
    const uv = ownGeometry(plank.geometry.clone()); plank.geometry = uv;
    for (let v = 0; v < uv.attributes.uv.count; v++) uv.attributes.uv.setXY(v, uv.attributes.uv.getX(v) + i * .173, uv.attributes.uv.getY(v) + i * .271);
  }
  for (const x of [-1.067, 1.067]) part('Desk breadboard ' + x, .065, .046, .844, x, .727, .0015, m.oak, desk);
  for (const x of [-.88, .88]) for (const z of [-.32, .32]) {
    part('Desk leg ' + x + z, .085, .7, .085, x, .35, z, m.wood, desk);
    part('Desk peg ' + x + z, .018, .018, .01, x, .665, z + (z > 0 ? .048 : -.048), m.darkWood, desk);
  }
  for (const z of [-.33, .33]) part('Desk apron ' + z, 1.79, .06, .04, 0, .67, z, m.wood, desk);
  for (const x of [-.88, .88]) {
    part('Desk side rail ' + x, .042, .075, .66, x, .655, 0, m.wood, desk);
    part('Desk lower side rail ' + x, .045, .052, .66, x, .18, 0, m.wood, desk);
  }
  part('Desk rear stretcher', 1.79, .055, .045, 0, .18, -.32, m.wood, desk);
  part('Drawer housing', .45, .105, .49, .56, .65, -.01, m.darkWood, desk);
  part('Drawer face', .42, .09, .032, .56, .65, .257, m.oak, desk);
  turned('Drawer peg handle', [[.011, 0], [.014, .018], [.024, .024], [.024, .035]], .56, .65, .29, m.darkWood, desk).rotation.x = Math.PI / 2;
  obstacle('archive-reading-table', -10, -5.8, 2.2, .87);

  function chair(name, x, z, angle = 0) {
    const chair = new THREE.Group(); chair.name = name;
    chair.position.set(x, 0, z); chair.rotation.y = angle; bay.add(chair);
    for (const lx of [-.22, .22]) for (const lz of [-.205, .205]) {
      brace(name + ' leg ' + lx + lz, [lx * 1.13, .015, lz * 1.12], [lx, .435, lz], .045, .045, m.wood, chair);
    }
    part(name + ' seat', .51, .035, .47, 0, .415, 0, m.oak, chair);
    // A gently domed sewn cushion: small enough for the visible weave to read.
    const cushion = part(name + ' cushion', .455, .05, .415, 0, .452, -.008, m.cloth, chair, .014);
    for (const lx of [-.22, .22]) {
      part(name + ' rear post ' + lx, .045, .59, .055, lx, .695, .22, m.wood, chair);
      part(name + ' side stretcher ' + lx, .035, .035, .43, lx, .18, 0, m.wood, chair);
    }
    for (const lx of [-.12, 0, .12]) part(name + ' back slat ' + lx, .066, .35, .024, lx, .742, .226, m.oak, chair);
    part(name + ' crest rail', .51, .075, .065, 0, .975, .22, m.oak, chair);
    part(name + ' rear stretcher', .44, .03, .03, 0, .18, .205, m.wood, chair);
    obstacle(name, -11 + x, -5 + z, .59, .59);
    return { chair, cushion };
  }
  const writingChair = chair('Writing chair', 1, .22);
  chair('Reading chair', -1.65, -.65, -.65);

  const ledger = new THREE.Group(); ledger.name = 'Open bound ledger';
  ledger.position.set(.82, .75, -.72); ledger.rotation.y = -.1; bay.add(ledger);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.rotation.z = side * .065; ledger.add(leaf);
    part('Leather board ' + side, .225, .008, .31, side * .119, .008, 0, m.leather, leaf);
    part('Page block ' + side, .211, .018, .292, side * .118, .021, 0, m.paper, leaf);
    for (let row = 0; row < 11; row++) {
      // Fine rules only: no invented ERP amounts or unreadable fake body copy.
      part('Ledger ruling ' + side + row, .16, .0008, .001, side * .117, .0305, -.112 + row * .021, m.wood, leaf, 0);
    }
  }
  turned('Ceramic ink pot', [[.04, 0], [.055, .015], [.053, .067], [.027, .082], [.026, .095], [.018, .095], [.018, .085]], 1.72, .75, -.97, m.darkStone);
  brace('Quill shaft', [1.72, .79, -.97], [1.65, 1.01, -1.04], .002, .002, m.ivory);
  const featherShape = new THREE.Shape(); featherShape.moveTo(0, 0); featherShape.quadraticCurveTo(-.045, .09, 0, .17); featherShape.quadraticCurveTo(.023, .08, 0, 0);
  const feather = new THREE.Mesh(ownGeometry(new THREE.ShapeGeometry(featherShape, 8)), m.ivory);
  feather.name = 'Quill feather'; feather.position.set(1.65, .98, -1.04); feather.rotation.z = -.38; bay.add(feather);
  turned('Seal handle', [[.029, 0], [.029, .008], [.013, .015], [.015, .065], [.022, .078], [.015, .09]], 1.57, .75, -.57, m.wood);
  part('Seal die', .05, .007, .05, 1.57, .753, -.57, m.brass);
  part('Folded linen', .25, .019, .19, .25, .761, -1.03, m.cloth);
  for (let i = 0; i < 3; i++) {
    part('Stacked folio pages ' + i, .25, .032, .32, -.85, .08 + i * .047, -2.85, m.paper);
    part('Stacked folio cover ' + i, .263, .006, .333, -.85, .098 + i * .047, -2.85, i % 2 ? m.leather : m.red);
  }
  part('Folio bench', 1.6, .075, .44, -.6, .39, -2.85, m.oak);
  for (const x of [-1.2, 0]) part('Bench leg ' + x, .1, .36, .32, x, .18, -2.85, m.wood);
  // Move the folios onto the bench, rather than burying them in its frame.
  for (const [name, mesh] of Object.entries(parts)) if (name.startsWith('Stacked folio')) mesh.position.y += .35;
  obstacle('Folio bench', -11.6, -7.85, 1.65, .5);

  bay.updateMatrixWorld(true);
  return { bay, desk, writingChair: writingChair.chair,
    dimensions: { deskHeight: .75, deskWidth: 2.2, deskDepth: .844, seatHeight: .477 },
    anchors: { desktop: { x: -10, y: floorY + .75, z: -5.8 }, seat: { x: -10, y: floorY + .477, z: -4.78 } } };
}
