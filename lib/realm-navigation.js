function nodeKey(x, y) {
  return `${x},${y}`;
}

function centerOf(node) {
  return { x: node.x + 0.5, y: node.y + 0.5 };
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
  const estimate = (node) => Math.abs(node.x - targetNode.x) + Math.abs(node.y - targetNode.y);

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
      return waypoints;
    }

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];
    for (const neighbor of neighbors) {
      if (neighbor.x < 1 || neighbor.y < 1 || neighbor.x > cols - 2 || neighbor.y > rows - 2) continue;
      if (!isWalkable(centerOf(neighbor))) continue;
      const neighborKey = nodeKey(neighbor.x, neighbor.y);
      const nextDistance = (distanceFromStart.get(currentKey) || 0) + 1;
      if (nextDistance >= (distanceFromStart.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborKey, currentKey);
      distanceFromStart.set(neighborKey, nextDistance);
      open.set(neighborKey, { ...neighbor, score: nextDistance + estimate(neighbor) });
    }
  }

  return [];
}
