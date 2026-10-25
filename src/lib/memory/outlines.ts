/** Largest contour area in the 0–1000 outline space. */
export function outlineArea(path: string): number {
  let best = 0;
  for (const contour of path.split(/(?=M)/)) {
    const n = contour.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (n.length < 6) continue;
    let area = 0;
    for (let i = 0; i < n.length; i += 2) {
      const j = (i + 2) % n.length;
      area += n[i] * n[j + 1] - n[j] * n[i + 1];
    }
    best = Math.max(best, Math.abs(area) / 2);
  }
  return best;
}

/** A point inside the largest contour, normalized to 0–1. */
export function outlineAnchor(path: string): { x: number; y: number } {
  let bestArea = -1;
  let best = { x: 0.5, y: 0.5 };
  for (const contour of path.split(/(?=M)/)) {
    const n = contour.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const count = Math.floor(n.length / 2);
    if (count < 3) continue;
    let twice = 0,
      cx = 0,
      cy = 0;
    for (let i = 0; i < count; i++) {
      const x1 = n[i * 2],
        y1 = n[i * 2 + 1],
        x2 = n[((i + 1) % count) * 2],
        y2 = n[((i + 1) % count) * 2 + 1],
        cross = x1 * y2 - x2 * y1;
      twice += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }
    const area = Math.abs(twice) / 2;
    if (area > bestArea && twice !== 0) {
      bestArea = area;
      best = {
        x: Math.min(1, Math.max(0, cx / (3 * twice) / 1000)),
        y: Math.min(1, Math.max(0, cy / (3 * twice) / 1000)),
      };
    }
  }
  return best;
}
