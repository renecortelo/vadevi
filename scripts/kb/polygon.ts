/** A closed ring of [longitude, latitude] pairs, as GeoJSON writes it. */
export type Ring = [number, number][];

/** Twice the ring's signed area, in degrees²: its size, for comparing rings. */
function doubledArea(ring: Ring): number {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]!;
    const [x2, y2] = ring[index + 1]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}

/** Whether the point lies inside the ring (even–odd rule). */
export function insideRing(ring: Ring, longitude: number, latitude: number): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index]!;
    const [x2, y2] = ring[previous]!;
    if (
      y1 > latitude !== y2 > latitude &&
      longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A point inside an area drawn as one or more rings: inside the largest. Its
 * centroid where that lies inside it; otherwise — a crescent of a valley, a
 * ring of hills — the middle of the widest stretch of it along the
 * centroid's parallel, which always lies inside.
 */
export function interiorPoint(
  rings: readonly Ring[],
): { latitude: number; longitude: number } | null {
  const ring = [...rings].sort(
    (left, right) => Math.abs(doubledArea(right)) - Math.abs(doubledArea(left)),
  )[0];
  if (ring === undefined || ring.length < 4) return null;
  const area = doubledArea(ring);
  if (area === 0) return null;
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]!;
    const [x2, y2] = ring[index + 1]!;
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  cx /= 3 * area;
  cy /= 3 * area;
  if (insideRing(ring, cx, cy)) return { latitude: cy, longitude: cx };
  const crossings: number[] = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]!;
    const [x2, y2] = ring[index + 1]!;
    if (y1 > cy !== y2 > cy) crossings.push(x1 + ((cy - y1) * (x2 - x1)) / (y2 - y1));
  }
  crossings.sort((left, right) => left - right);
  let best: [number, number] | null = null;
  for (let index = 0; index + 1 < crossings.length; index += 2) {
    const stretch: [number, number] = [crossings[index]!, crossings[index + 1]!];
    if (best === null || stretch[1] - stretch[0] > best[1] - best[0]) best = stretch;
  }
  return best === null ? null : { latitude: cy, longitude: (best[0] + best[1]) / 2 };
}
