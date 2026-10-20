import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * A wheel to find one thing among many by narrowing: aromas by family and
 * group, wine colours by kind and hue. The same drawing serves every wheel —
 * the library's, the tasting picker's, a member's own — so each only says
 * what its rings hold.
 *
 * It shows two rings around a centre: the level in focus at the centre, its
 * parts in the inner ring, and their parts in the outer one. Touching a part
 * that has parts of its own goes into it; touching one that has none chooses
 * it; touching the centre steps back out. Every part is a button to a
 * keyboard and a screen reader, named and marked when chosen.
 */
export type WheelNode = {
  children?: WheelNode[];
  /** Its colour on the wheel. */
  color: string;
  id: string;
  /** Its label's colour, where the default would not read on it. */
  ink?: string;
  label: string;
  /** Drawn faintly: present in the vocabulary, absent from what is shown. */
  muted?: boolean;
  /** Its share of the ring; one by default. */
  weight?: number;
};

const centreRadius = 25;
const innerRadius = 62;
const outerRadius = 99;

function polar(radius: number, angle: number): [number, number] {
  const radians = ((angle - 90) * Math.PI) / 180;
  return [radius * Math.cos(radians), radius * Math.sin(radians)];
}

/** The ring slice between two angles, in degrees clockwise from the top. */
function slice(inner: number, outer: number, start: number, end: number): string {
  const sweep = end - start;
  // A whole ring cannot be drawn as one arc: two halves.
  if (sweep >= 359.99) {
    return `${slice(inner, outer, start, start + 180)} ${slice(inner, outer, start + 180, end)}`;
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

/** A part's share: its own weight, or its parts' together. */
function weightOf(node: WheelNode): number {
  if (node.children !== undefined && node.children.length > 0) {
    return node.children.reduce((sum, child) => sum + weightOf(child), 0);
  }
  return node.weight ?? 1;
}

type Placed = { end: number; node: WheelNode; start: number };

function place(nodes: readonly WheelNode[], start: number, end: number): Placed[] {
  const total = nodes.reduce((sum, node) => sum + weightOf(node), 0);
  let at = start;
  return nodes.map((node) => {
    const span = ((end - start) * weightOf(node)) / total;
    const placed = { end: at + span, node, start: at };
    at += span;
    return placed;
  });
}

/** A label along the middle of its slice, turned so it reads upright. */
function Label({
  end,
  ink,
  radius,
  size,
  start,
  text,
  thickness,
}: {
  end: number;
  ink: string | undefined;
  radius: number;
  size: number;
  start: number;
  text: string;
  thickness: number;
}) {
  const middle = (start + end) / 2;
  // As large as it may be, but no longer than the ring is thick and no taller
  // than the slice is wide; a slice too narrow to read keeps no label.
  const along = (radius * Math.PI * (end - start)) / 180;
  const fitted = Math.min(size, (thickness * 0.92) / Math.max(1, text.length * 0.56), along * 0.8);
  if (fitted < 2.6) return null;
  const [x, y] = polar(radius, middle);
  // Radial, outward on the right half and inward on the left, so no word
  // hangs upside down.
  const turn = middle <= 180 ? middle - 90 : middle + 90;
  return (
    <text
      className="wheel__label"
      dominantBaseline="middle"
      style={ink === undefined ? undefined : { fill: ink }}
      fontSize={fitted}
      textAnchor="middle"
      transform={`rotate(${turn} ${x} ${y})`}
      x={x}
      y={y}
    >
      {text}
    </text>
  );
}

export function Wheel({
  label,
  onSelect,
  root,
  selected,
}: {
  /** The wheel's own name, for assistive technology. */
  label: string;
  onSelect: (node: WheelNode) => void;
  root: WheelNode;
  selected: string | null;
}) {
  const { t } = useTranslation();
  // The path from the root to the level in focus, by id: the nodes are read
  // afresh from the current root, so a change of language relabels them.
  const [trail, setTrail] = useState<string[]>([]);
  const path = trail.reduce<WheelNode[]>(
    (nodes, id) => {
      const next = nodes.at(-1)!.children?.find((child) => child.id === id);
      return next === undefined ? nodes : [...nodes, next];
    },
    [root],
  );
  const setPath = (nodes: WheelNode[]) => setTrail(nodes.slice(1).map((node) => node.id));
  const focus = path.at(-1)!;
  const inner = place(focus.children ?? [], 0, 360);
  const outer = inner.flatMap((placed) =>
    place(placed.node.children ?? [], placed.start, placed.end),
  );
  // At the last level there is no rim: its ring reaches the edge.
  const ringEdge = outer.length === 0 ? outerRadius : innerRadius;

  const choose = (node: WheelNode, parent: WheelNode | null) => {
    if (node.children !== undefined && node.children.length > 0) {
      setPath(parent === null ? [...path, node] : [...path, parent, node]);
      return;
    }
    // A part chosen from the outer ring brings its own ring to the middle.
    if (parent !== null) setPath([...path, parent]);
    onSelect(node);
  };
  const back = () => {
    if (path.length > 1) setPath(path.slice(0, -1));
  };
  const keys = (action: () => void) => (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };
  const segment = (placed: Placed, inside: number, outside: number, parent: WheelNode | null) => {
    const { end, node, start } = placed;
    const chosen = node.id === selected;
    return (
      <g
        aria-label={node.label}
        aria-pressed={node.children === undefined ? chosen : undefined}
        className={`wheel__part${node.muted === true ? " wheel__part--muted" : ""}${chosen ? " wheel__part--chosen" : ""}`}
        key={node.id}
        onClick={() => choose(node, parent)}
        onKeyDown={keys(() => choose(node, parent))}
        role="button"
        tabIndex={0}
      >
        <path d={slice(inside, outside, start, end)} fill={node.color} />
      </g>
    );
  };
  const labelSize = (count: number) => (count > 40 ? 5 : count > 20 ? 6 : 7);

  return (
    <div className="wheel">
      <svg aria-label={label} className="wheel__svg" role="group" viewBox="-102 -102 204 204">
        {inner.map((placed) => segment(placed, centreRadius, ringEdge, null))}
        {outer.map((placed) => {
          const parent = inner.find(
            (item) => item.start <= placed.start && placed.end <= item.end + 1e-6,
          );
          return segment(placed, innerRadius, outerRadius, parent?.node ?? null);
        })}
        <g aria-hidden="true" className="wheel__labels">
          {inner.map(({ end, node, start }) => (
            <Label
              end={end}
              ink={node.ink}
              key={node.id}
              radius={(centreRadius + ringEdge) / 2}
              size={labelSize(inner.length)}
              start={start}
              text={node.label}
              thickness={ringEdge - centreRadius}
            />
          ))}
          {outer.map(({ end, node, start }) => (
            <Label
              end={end}
              ink={node.ink}
              key={node.id}
              radius={(innerRadius + outerRadius) / 2}
              size={labelSize(outer.length)}
              start={start}
              text={node.label}
              thickness={outerRadius - innerRadius}
            />
          ))}
        </g>
        <g
          aria-label={
            path.length > 1 ? t("library.wheels.back", { name: focus.label }) : focus.label
          }
          className="wheel__centre"
          onClick={back}
          onKeyDown={keys(back)}
          role={path.length > 1 ? "button" : undefined}
          tabIndex={path.length > 1 ? 0 : undefined}
        >
          <circle
            fill={path.length > 1 ? focus.color : "var(--color-surface-raised)"}
            r={centreRadius - 1}
          />
          <text
            className="wheel__centre-label"
            dominantBaseline="middle"
            style={path.length > 1 ? { fill: focus.ink ?? "#2b0709" } : undefined}
            fontSize={6}
            textAnchor="middle"
          >
            {path.length > 1 ? "↩ " : ""}
            {focus.label}
          </text>
        </g>
      </svg>
    </div>
  );
}
