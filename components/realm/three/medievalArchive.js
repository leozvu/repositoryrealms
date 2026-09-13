import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Metre-authored archive kit. Geometry is original to this project; timber
 * reuses the hall's licensed local maps. All parts join its static material
 * batches, so a binding/page/peg does not become its own runtime draw call. */
export function buildMedievalArchive(THREE, { materials: m, ownGeometry, ownMaterial, group, obstacle, floorY = 0 }) {
  const archive = new THREE.Group();
  archive.name = 'Joined oak archive';
  archive.position.y = floorY;
  archive.userData.physicalScale = true;
  group.add(archive);
  const shapes = new Map(), cabinets = [], books = [];
  const leather = ownMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .88, vertexColors: true }));
  const paper = ownMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .96, vertexColors: true }));
  leather.name = 'Archive matte leather bindings';
  paper.name = 'Archive cut paper and gatherings';
  const palette = ['#574235', '#695344', '#414939', '#483d35', '#5a4840', '#716450'];

  function geometry(w, h, d, radius = 0) {
    const key = [w, h, d, radius].join(':');
    if (!shapes.has(key)) {
      const value = ownGeometry(radius ? new RoundedBoxGeometry(w, h, d, 1, radius) : new THREE.BoxGeometry(w, h, d));
      const p = value.attributes.position, n = value.attributes.normal, uv = value.attributes.uv;
      const longAxis = w >= h && w >= d ? 0 : h >= d ? 1 : 2;
      for (let i = 0; i < p.count; i++) {
        const v = [p.getX(i), p.getY(i), p.getZ(i)];
        const normal = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))];
        const face = normal.indexOf(Math.max(...normal));
        const u = face === longAxis ? (longAxis + 1) % 3 : longAxis;
        const t = [0, 1, 2].find(axis => axis !== face && axis !== u);
        // UVs follow the member, not the world: a rotated upright keeps grain.
        uv.setXY(i, v[u] / 1.35, v[t] / 1.35);
      }
      shapes.set(key, value);
    }
    return shapes.get(key);
  }
  function mesh(name, shape, material, parent, position, tint) {
    let source = shape;
    if (tint) {
      // Clone only coloured book surfaces, retaining shared timber geometry.
      source = ownGeometry(shape.clone());
      const color = new THREE.Color(tint), colors = new Float32Array(source.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
      source.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const value = new THREE.Mesh(source, material);
    value.name = name; value.position.set(...position);
    value.castShadow = value.receiveShadow = true;
    value.userData.preserveUV = true;
    parent.add(value);
    return value;
  }
  function part(name, w, h, d, x, y, z, material, parent, { radius = 0, tint } = {}) {
    return mesh(name, geometry(w, h, d, radius), material, parent, [x, y, z], tint);
  }
  function paperRule(name, width, height, position, parent, facing) {
    const key = `rule:${width}:${height}`;
    if (!shapes.has(key)) shapes.set(key, ownGeometry(new THREE.PlaneGeometry(width, height)));
    const rule = mesh(name, shapes.get(key), paper, parent, position, '#b2a58a');
    if (facing === 'top') rule.rotation.x = -Math.PI / 2;
    else rule.rotation.y = Math.PI;
    return rule;
  }

  // A closed curved spine with a flat inner face. Six arc segments carry the
  // silhouette; unlike a cylinder segment it has no open cut face or end caps.
  function spineGeometry(thickness, height, depth, segments = 6) {
    const key = `spine:${thickness}:${height}:${depth}:${segments}`;
    if (!shapes.has(key)) {
      const profile = new THREE.Shape();
      for (let i = 0; i <= segments; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / segments;
        const x = Math.sin(angle) * thickness / 2, z = Math.cos(angle) * depth;
        if (i === 0) profile.moveTo(x, z); else profile.lineTo(x, z);
      }
      profile.closePath();
      const value = ownGeometry(new THREE.ExtrudeGeometry(profile, { depth: height, bevelEnabled: false, steps: 1, curveSegments: 1 }));
      value.rotateX(Math.PI / 2); value.translate(0, height / 2, 0);
      shapes.set(key, value);
    }
    return shapes.get(key);
  }

  function volume(parent, index, width, height, depth, position, horizontal = false) {
    const book = new THREE.Group();
    book.name = 'Bound archive volume ' + index;
    book.position.set(...position);
    book.rotation.z = horizontal ? Math.PI / 2 : 0;
    book.rotation.y = horizontal ? (index % 3 - 1) * .025 : 0;
    parent.add(book);
    const tint = palette[index % palette.length], cover = .006;
    for (const side of [-1, 1]) {
      part('Leather covered board', cover, height, depth, side * (width - cover) / 2, 0, 0, leather, book, { tint });
      // Incised perimeter rules are geometry inset onto the visible board, not
      // painted fake titles or an invented ERP record.
      if (horizontal) for (const z of [-1, 1]) part('Blind cover rule', .001, height - .035, .0012,
        side * (width / 2 + .0006), 0, z * (depth / 2 - .018), leather, book, { tint: '#392e27' });
    }
    const pageBlock = part('Recessed page block', width - cover * 2 - .002, height - .014, depth - .024,
      0, 0, -.003, paper, book, { tint: index % 3 === 0 ? '#c9bca0' : '#d9cdb2' });
    mesh('Rounded leather spine', spineGeometry(width, height - .002, .013), leather, book, [0, 0, depth / 2 - .012], tint);
    for (const bandY of [-.29, 0, .29]) {
      mesh('Raised sewing support', spineGeometry(width + .002, .01, .016, 4), leather, book,
        [0, height * bandY, depth / 2 - .012], tint);
    }
    // Folded gatherings remain visible at the fore-edge and top without
    // creating a separate mesh for every paper leaf.
    for (let gathering = 1; gathering < 5; gathering++) {
      const x = -width / 2 + cover + (width - cover * 2) * gathering / 5;
      paperRule('Gathering at fore-edge', .0009, height - .02, [x, 0, -depth / 2 + .0085], book, 'fore');
      paperRule('Gathering at head', .0009, depth - .03, [x, height / 2 - .0065, -.004], book, 'top');
    }
    if (index % 4 === 0) {
      // A short plain vellum tab identifies an archival volume spatially; it
      // carries no unreadable decorative copy or application data.
      part('Vellum spine tab', width * .62, .036, .0015, 0, -height * .18, depth / 2 + .002,
        paper, book, { tint: '#bcb298' });
    }
    book.userData.dimensions = { width, height, depth, coverThickness: cover };
    books.push({ object: book, pageBlock, horizontal });
    return book;
  }

  let index = 0;
  for (const centerX of [-12.6, -9.45, -6.3]) {
    const cabinet = new THREE.Group();
    cabinet.name = 'Pegged archive cabinet ' + centerX;
    cabinet.position.set(centerX, 0, -9.25); archive.add(cabinet);
    // Kept inside the existing collider, including the crown and front pegs.
    for (const side of [-1, 1]) for (const z of [-.46, .43]) {
      part('Cabinet upright', .105, 2.63, .105, side * 1.345, 1.315, z, m.wood, cabinet, { radius: .004 });
      for (const y of [.21, .77, 1.33, 1.89, 2.47]) {
        part('Shelf joint peg', .014, .014, .008, side * 1.345, y, z + .057, m.darkWood, cabinet);
      }
    }
    // Narrow rear boards have real joints; both side panels are framed rather
    // than giant solid boxes, with visible rails taking each shelf's load.
    for (let board = 0; board < 12; board++) part('Cabinet back board', .217, 2.48, .025,
      -1.21 + board * .22, 1.36, -.478, m.darkWood, cabinet);
    for (const side of [-1, 1]) for (const y of [.18, 2.48]) part('Side panel rail', .075, .09, .9,
      side * 1.345, y, -.015, m.wood, cabinet, { radius: .003 });
    for (const side of [-1, 1]) for (const z of [-.3, 0, .3]) part('Side panel board', .03, 2.18, .292,
      side * 1.34, 1.33, z - .015, m.wood, cabinet);
    for (let shelf = 0; shelf < 5; shelf++) {
      const y = .235 + shelf * .56;
      for (const z of [-.26, .19]) part('Shelf oak plank', 2.63, .044, .438,
        0, y - .022, z, m.oak, cabinet, { radius: .002 });
      part('Shelf front nosing', 2.65, .061, .044, 0, y - .03, .431, m.wood, cabinet, { radius: .003 });
      if (shelf === 4) continue;
      for (const side of [-1, 1]) part('Shelf bearing cleat', .052, .043, .81,
        side * 1.282, y - .064, -.02, m.darkWood, cabinet);
      let x = -1.2;
      for (let number = 0; number < 15; number++) {
        const width = .062 + (index % 6) * .009, height = .285 + (index * 7 % 5) * .022, depth = .225 + (index * 3 % 4) * .019;
        x += width / 2;
        volume(cabinet, index++, width, height, depth, [x, y + height / 2, .18 + (number % 3) * .015]);
        x += width / 2 + .006 + (number === 5 || number === 10 ? .045 : 0);
      }
      let stackY = y;
      for (let stack = 0; stack < 3; stack++) {
        const thickness = .053 + stack * .008, height = .335 + (index % 3) * .012;
        volume(cabinet, index++, thickness, height, .258, [.94 + (stack % 2) * .012, stackY + thickness / 2, .17], true);
        stackY += thickness;
      }
    }
    part('Cabinet crown lower moulding', 2.88, .075, 1.04, 0, 2.62, -.005, m.wood, cabinet, { radius: .004 });
    part('Cabinet crown cap', 2.94, .045, 1.1, 0, 2.68, -.005, m.oak, cabinet, { radius: .003 });
    obstacle(`bookcase-${centerX}`, centerX, -9.25, 2.96, 1.15, 3.65);
    cabinets.push(cabinet);
  }
  archive.updateMatrixWorld(true);
  return { archive, cabinets, books, dimensions: { cabinetWidth: 2.94, cabinetHeight: 2.7025, cabinetDepth: 1.1 },
    provenance: { geometry: 'Original procedural construction, metres; medieval-inspired, not a historical reconstruction', timberMaps: 'Existing pbr-v1 manifest; CC0-1.0', newDownloads: 0 } };
}
