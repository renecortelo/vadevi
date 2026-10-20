/**
 * A ring's geometry, shared by the wheels and the grape card's small one: a
 * point by its angle, and a slice of the ring between two angles.
 */
export const innerRadius = 58;
export const outerRadius = 90;

export function polar(radius: number, angle: number): [number, number] {
  const radians = ((angle - 90) * Math.PI) / 180;
  return [radius * Math.cos(radians), radius * Math.sin(radians)];
}

/** The ring slice between two angles, in degrees clockwise from the top. */
export function slice(
  start: number,
  end: number,
  inner = innerRadius,
  outer = outerRadius,
): string {
  const sweep = end - start;
  if (sweep >= 359.99) {
    return `${slice(start, start + 180, inner, outer)} ${slice(start + 180, end, inner, outer)}`;
  }
  const large = sweep > 180 ? 1 : 0;
  const [x1, y1] = polar(outer, start);
  const [x2, y2] = polar(outer, end);
  const [x3, y3] = polar(inner, end);
  const [x4, y4] = polar(inner, start);
  return (
    `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} ` +
    `L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`
  );
}
