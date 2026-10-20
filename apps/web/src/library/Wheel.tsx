import { type CSSProperties, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * A wheel to find one thing among many by narrowing: aromas by family and
 * group, wine colours by kind and hue. The same drawing serves every wheel —
 * the library's, the tasting picker's, a member's own — so each only says
 * what its rings hold.
 *
 * One thin ring at a time: the parts of the level in focus, with gaps
 * between them. Their names are not written on the ring: the part pointed at
 * or chosen is named large in the centre, and the level's parts are listed
 * beneath as buttons — the controls a keyboard and a screen reader use; the
 * ring answers a touch too. Going into a part fans its own parts out; a
 * round button in the centre steps back.
 */
export type WheelNode = {
  children?: WheelNode[];
  /** Its colour on the wheel. */
  color: string;
  /** A small drawing beside its name in the list. */
  icon?: ReactNode;
  id: string;
  label: string;
  /** Drawn faintly: present in the vocabulary, absent from what is shown. */
  muted?: boolean;
  /** Its share of the ring; one by default. */
  weight?: number;
};

const innerRadius = 58;
const outerRadius = 90;

function polar(radius: number, angle: number): [number, number] {
  const radians = ((angle - 90) * Math.PI) / 180;
  return [radius * Math.cos(radians), radius * Math.sin(radians)];
}

/** The ring slice between two angles, in degrees clockwise from the top. */
function slice(start: number, end: number): string {
  const sweep = end - start;
  if (sweep >= 359.99) {
    return `${slice(start, start + 180)} ${slice(start + 180, end)}`;
  }
  const large = sweep > 180 ? 1 : 0;
  const [x1, y1] = polar(outerRadius, start);
  const [x2, y2] = polar(outerRadius, end);
  const [x3, y3] = polar(innerRadius, end);
  const [x4, y4] = polar(innerRadius, start);
  return (
    `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${x2} ${y2} ` +
    `L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${x4} ${y4} Z`
  );
}

/** A part's share: its own weight, or its parts' together. */
function weightOf(node: WheelNode): number {
  if (node.children !== undefined && node.children.length > 0) {
    return node.children.reduce((sum, child) => sum + weightOf(child), 0);
  }
  return node.weight ?? 1;
}

const hasParts = (node: WheelNode) => node.children !== undefined && node.children.length > 0;

/** Back up a level: a line drawn to sit with the aroma drawings. */
function ReturnIcon() {
  return (
    <svg aria-hidden="true" className="wheel__return-icon" focusable="false" viewBox="0 0 24 24">
      <path d="M9.5 6.5 5 11l4.5 4.5" />
      <path d="M5.5 11h8.25a4.75 4.75 0 0 1 0 9.5H11" />
    </svg>
  );
}

export function Wheel({
  detail,
  label,
  onSelect,
  root,
  selected,
}: {
  /** A line under a part's name in the centre: how many grapes, what kind. */
  detail?: (node: WheelNode) => string | null;
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
  const [pointed, setPointed] = useState<string | null>(null);
  const path = trail.reduce<WheelNode[]>(
    (nodes, id) => {
      const next = nodes.at(-1)!.children?.find((child) => child.id === id);
      return next === undefined ? nodes : [...nodes, next];
    },
    [root],
  );
  const focus = path.at(-1)!;
  const parts = focus.children ?? [];
  const total = parts.reduce((sum, node) => sum + weightOf(node), 0);
  // A gap between parts, smaller when there are many.
  const gap = parts.length > 30 ? 0.6 : parts.length > 12 ? 1.2 : 2;
  const placed = parts.reduce<{ end: number; node: WheelNode; start: number }[]>((items, node) => {
    const start = items.at(-1)?.end ?? 0;
    return [...items, { end: start + (360 * weightOf(node)) / Math.max(total, 1), node, start }];
  }, []);

  // A level with a single part (Flowers, whose one group is Flowers) is
  // passed through on the way in and out: it would only repeat its name.
  const lone = (node: WheelNode) => node.children?.length === 1 && hasParts(node.children[0]!);
  const choose = (node: WheelNode) => {
    setPointed(null);
    if (!hasParts(node)) {
      onSelect(node);
      return;
    }
    const ids = [node.id];
    let inside = node;
    while (lone(inside)) {
      inside = inside.children![0]!;
      ids.push(inside.id);
    }
    setTrail([...trail, ...ids]);
  };
  // Where the way back leads: the nearest level around this one with more
  // than one part.
  const backLength = (() => {
    let length = path.length - 1;
    while (length > 1 && lone(path[length - 1]!)) length -= 1;
    return length;
  })();
  const back = () => {
    setPointed(null);
    setTrail(trail.slice(0, backLength - 1));
  };

  const named =
    parts.find((node) => node.id === pointed) ?? parts.find((node) => node.id === selected) ?? null;
  const centre = named ?? focus;
  const line = named === null ? null : (detail?.(named) ?? null);

  return (
    <div className="wheel">
      <div className="wheel__stage">
        <svg aria-hidden="true" className="wheel__svg" viewBox="-100 -100 200 200">
          <g className="wheel__ring" key={focus.id}>
            {placed.map(({ end, node, start }, index) => {
              const [dx, dy] = polar(5, (start + end) / 2);
              return (
                <path
                  className={
                    `wheel__part${node.muted === true ? " wheel__part--muted" : ""}` +
                    `${node.id === selected ? " wheel__part--chosen" : ""}` +
                    `${pointed === node.id ? " wheel__part--pointed" : ""}`
                  }
                  d={slice(start + gap / 2, end - gap / 2)}
                  fill={node.color}
                  key={node.id}
                  onClick={() => choose(node)}
                  onPointerEnter={() => setPointed(node.id)}
                  onPointerLeave={() => setPointed(null)}
                  style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, "--i": index } as CSSProperties}
                />
              );
            })}
          </g>
          <g className="wheel__centre" key={`${focus.id}:${centre.id}`}>
            <text
              className="wheel__name"
              dominantBaseline="middle"
              textAnchor="middle"
              y={(line === null ? 0 : -6) + (path.length > 1 ? 9 : 0)}
            >
              {centre.label}
            </text>
            {line === null ? null : (
              <text
                className="wheel__detail"
                dominantBaseline="middle"
                textAnchor="middle"
                y={12 + (path.length > 1 ? 9 : 0)}
              >
                {line}
              </text>
            )}
          </g>
        </svg>
        {/* Inside the ring, over the name: back up to the level around this one. */}
        {path.length > 1 ? (
          <button
            aria-label={t("library.wheels.back", { name: path[backLength - 1]!.label })}
            className="wheel__return"
            onClick={back}
            title={t("library.wheels.back", { name: path[backLength - 1]!.label })}
            type="button"
          >
            <ReturnIcon />
          </button>
        ) : null}
      </div>
      <ul aria-label={`${label}: ${focus.label}`} className="wheel__list" key={focus.id}>
        {placed.map(({ node }, index) => (
          <li key={node.id} style={{ "--i": index } as CSSProperties}>
            <button
              aria-pressed={hasParts(node) ? undefined : node.id === selected}
              className={`wheel__chip${node.muted === true ? " wheel__chip--muted" : ""}`}
              onBlur={() => setPointed(null)}
              onClick={() => choose(node)}
              onFocus={() => setPointed(node.id)}
              onPointerEnter={() => setPointed(node.id)}
              onPointerLeave={() => setPointed(null)}
              type="button"
            >
              {node.icon ?? (
                <span
                  aria-hidden="true"
                  className="wheel__dot"
                  style={{ background: node.color }}
                />
              )}
              <span>{node.label}</span>
              {hasParts(node) ? (
                <span aria-hidden="true" className="wheel__more">
                  ›
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
