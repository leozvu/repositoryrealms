function nodeKey(x, y) {
  return `${x},${y}`;
}

function centerOf(node) {
  return { x: node.x + 0.5, y: node.y + 0.5 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function realmLineOfSight(start, target, isWalkable, sampleStep = .2) {
  if (typeof isWalkable !== 'function') return false;
  const length = distance(start, target);
  const samples = Math.max(1, Math.ceil(length / Math.max(.08, sampleStep)));
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    if (!isWalkable({
      x: start.x + (target.x - start.x) * progress,
      y: start.y + (target.y - start.y) * progress,
    })) return false;
  }
  return true;
}

function nearestWalkableNode(point, { cols, rows, isWalkable }) {
  const origin = {
    x: Math.max(1, Math.min(cols - 2, Math.floor(Number(point?.x) || 1))),
    y: Math.max(1, Math.min(rows - 2, Math.floor(Number(point?.y) || 1))),
  };
  if (isWalkable(centerOf(origin))) return origin;

  for (let radius = 1; radius <= 4; radius += 1) {
    for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
      for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
        if (x < 1 || y < 1 || x > cols - 2 || y > rows - 2) continue;
        if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) !== radius) continue;
        if (isWalkable(centerOf({ x, y }))) return { x, y };
      }
    }
  }
  return null;
}

function compressPath(nodes) {
  if (nodes.length < 3) return nodes;
  const compressed = [nodes[0]];
  let previousDirection = null;
  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    const direction = `${Math.sign(current.x - previous.x)},${Math.sign(current.y - previous.y)}`;
    if (previousDirection && direction !== previousDirection) compressed.push(previous);
    previousDirection = direction;
  }
  compressed.push(nodes[nodes.length - 1]);
  return compressed;
}

function smoothPath(start, nodes, isWalkable) {
  if (nodes.length < 2) return nodes;
  const smoothed = [];
  let anchor = start;
  let cursor = 0;
  while (cursor < nodes.length) {
    let furthest = cursor;
    for (let candidate = nodes.length - 1; candidate >= cursor; candidate -= 1) {
      if (realmLineOfSight(anchor, nodes[candidate], isWalkable)) {
        furthest = candidate;
        break;
      }
    }
    smoothed.push(nodes[furthest]);
    anchor = nodes[furthest];
    cursor = furthest + 1;
  }
  return smoothed;
}

export function findRealmPath({ start, target, cols, rows, isWalkable }) {
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || typeof isWalkable !== 'function') return [];
  const startNode = nearestWalkableNode(start, { cols, rows, isWalkable });
  const targetNode = nearestWalkableNode(target, { cols, rows, isWalkable });
  if (!startNode || !targetNode) return [];

  const startKey = nodeKey(startNode.x, startNode.y);
  const targetKey = nodeKey(targetNode.x, targetNode.y);
  if (startKey === targetKey) {
    return isWalkable(target) ? [{ x: Number(target.x), y: Number(target.y) }] : [centerOf(targetNode)];
  }

  const open = new Map([[startKey, { ...startNode, score: 0 }]]);
  const cameFrom = new Map();
  const distanceFromStart = new Map([[startKey, 0]]);
  const estimate = (node) => {
    const dx = Math.abs(node.x - targetNode.x);
    const dy = Math.abs(node.y - targetNode.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  while (open.size) {
    let currentKey = null;
    let current = null;
    let lowest = Number.POSITIVE_INFINITY;
    for (const [key, candidate] of open) {
      const score = (distanceFromStart.get(key) || 0) + estimate(candidate);
      if (score < lowest) {
        currentKey = key;
        current = candidate;
        lowest = score;
      }
    }
    open.delete(currentKey);

    if (currentKey === targetKey) {
      const nodes = [targetNode];
      let cursor = currentKey;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor);
        const [x, y] = cursor.split(',').map(Number);
        nodes.push({ x, y });
      }
      nodes.reverse();
      const waypoints = compressPath(nodes).slice(1).map(centerOf);
      if (isWalkable(target)) waypoints[waypoints.length - 1] = { x: Number(target.x), y: Number(target.y) };
      return smoothPath(
        { x: Number(start.x), y: Number(start.y) },
        waypoints,
        isWalkable,
      );
    }

    const neighbors = [
      { x: current.x + 1, y: current.y, cost: 1 },
      { x: current.x - 1, y: current.y, cost: 1 },
      { x: current.x, y: current.y + 1, cost: 1 },
      { x: current.x, y: current.y - 1, cost: 1 },
      { x: current.x + 1, y: current.y + 1, cost: Math.SQRT2 },
      { x: current.x - 1, y: current.y + 1, cost: Math.SQRT2 },
      { x: current.x + 1, y: current.y - 1, cost: Math.SQRT2 },
      { x: current.x - 1, y: current.y - 1, cost: Math.SQRT2 },
    ];
    for (const neighbor of neighbors) {
      if (neighbor.x < 1 || neighbor.y < 1 || neighbor.x > cols - 2 || neighbor.y > rows - 2) continue;
      if (!isWalkable(centerOf(neighbor))) continue;
      const diagonal = neighbor.x !== current.x && neighbor.y !== current.y;
      if (diagonal && (
        !isWalkable(centerOf({ x: neighbor.x, y: current.y }))
        || !isWalkable(centerOf({ x: current.x, y: neighbor.y }))
      )) continue;
      const neighborKey = nodeKey(neighbor.x, neighbor.y);
      const nextDistance = (distanceFromStart.get(currentKey) || 0) + neighbor.cost;
      if (nextDistance >= (distanceFromStart.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborKey, currentKey);
      distanceFromStart.set(neighborKey, nextDistance);
      open.set(neighborKey, { ...neighbor, score: nextDistance + estimate(neighbor) });
    }
  }

  return [];
}
