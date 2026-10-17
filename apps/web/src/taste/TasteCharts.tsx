import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";

import { CountUp } from "../motion/CountUp";
import { useArrival } from "../motion/useArrival";

type Row = { key: string; label: string; notes: number; points: number };

/**
 * Above and below the reader's own average: one row per trait, a bar to the
 * right in green for what they score higher, to the left in red for what
 * they score lower, the average the line in the middle. The bars grow from
 * that line as the chart comes into view; the figure is written beside each.
 */
export function DivergingBars({ rows }: { rows: readonly Row[] }) {
  const { i18n, t } = useTranslation();
  const arrival = useArrival<HTMLUListElement>();
  const largest = Math.max(1, ...rows.map((row) => Math.abs(row.points)));
  const signed = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 1,
    signDisplay: "always",
  });
  return (
    <ul className="taste-diverging" {...arrival.props}>
      {rows.map((row, index) => {
        const share = Math.abs(row.points) / largest;
        return (
          <li key={row.key} style={{ "--motion-index": index } as CSSProperties}>
            <span className="taste-diverging__label">{row.label}</span>
            <span aria-hidden="true" className="taste-diverging__track">
              <span
                className={row.points >= 0 ? "is-above" : "is-below"}
                style={{ inlineSize: `${share * 50}%` }}
              />
            </span>
            <span className="taste-diverging__value">
              {signed.format(Math.round(row.points * 10) / 10)}
              <span className="sr-only">
                {" "}
                {t("taste.chart.pointsVersusAverage", { count: row.notes })}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type Slice = { key: string; label: string; share: number };

/** One colour per slice, in order; the rest is always the quiet grey. */
const sliceColours = [
  "var(--color-plum)",
  "#c4624f",
  "#d9a441",
  "#7a9a5b",
  "#5b7fa3",
  "#8a5a9e",
  "#4f9a94",
  "#b5793c",
  "#a3485f",
  "#6f7f3a",
];

/**
 * What the reader drinks most, as a ring: what together holds most of their
 * tastings (the API lists up to four fifths of them) and the rest, each slice
 * drawn round in turn as the ring comes into view, the shares written in its
 * legend — in two columns when there are many.
 */
export function Donut({ slices }: { slices: readonly Slice[] }) {
  const { i18n, t } = useTranslation();
  const arrival = useArrival<HTMLDivElement>();
  const percent = new Intl.NumberFormat(i18n.language, { style: "percent" });
  const top = slices.slice(0, sliceColours.length);
  const listed = top.reduce((sum, slice) => sum + slice.share, 0);
  const rest = Math.max(0, 1 - listed);
  const parts =
    rest > 0.005 ? [...top, { key: "rest", label: t("taste.chart.rest"), share: rest }] : top;
  // A wine of several grapes counts for each: the ring then shares out what
  // the legend says, so it still closes.
  const whole = Math.max(1, listed + rest);
  const radius = 15.9155; // a circumference of 100
  // Where each slice starts round the ring, from the top.
  const starts = parts.map((_, index) =>
    parts.slice(0, index).reduce((sum, part) => sum + (part.share / whole) * 100, 0),
  );
  const colour = (index: number, key: string) =>
    key === "rest" ? "var(--color-border)" : sliceColours[index]!;
  return (
    <div className="taste-donut" {...arrival.props}>
      <svg aria-hidden="true" viewBox="0 0 42 42">
        <circle className="taste-donut__ground" cx="21" cy="21" r={radius} />
        {parts.map((part, index) => {
          const length = (part.share / whole) * 100;
          const offset = 25 - starts[index]!;
          return (
            <circle
              className="taste-donut__slice"
              cx="21"
              cy="21"
              key={part.key}
              r={radius}
              strokeDasharray={`${arrival.arrived ? length : 0} ${100 - (arrival.arrived ? length : 0)}`}
              strokeDashoffset={offset}
              style={{ "--motion-index": index, stroke: colour(index, part.key) } as CSSProperties}
            />
          );
        })}
      </svg>
      <ul
        className={parts.length > 4 ? "taste-donut__legend is-two-columns" : "taste-donut__legend"}
        style={{ "--legend-rows": Math.ceil(parts.length / 2) } as CSSProperties}
      >
        {parts.map((part, index) => (
          <li key={part.key}>
            <span
              aria-hidden="true"
              className="taste-donut__swatch"
              style={{ background: colour(index, part.key) }}
            />
            <span>{part.label}</span>
            <strong>
              <CountUp
                format={(whole) => percent.format(whole / 100)}
                play={arrival.arrived}
                value={Math.round(part.share * 100)}
              />
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A choice of rings, one kind of thing at a time: types, countries, grapes. */
export function DonutByKind({
  groups,
  label,
}: {
  groups: readonly { kind: string; name: string; slices: readonly Slice[] }[];
  label: string;
}) {
  const [chosen, setChosen] = useState(groups[0]?.kind ?? "");
  const group = groups.find((candidate) => candidate.kind === chosen) ?? groups[0];
  if (group === undefined) return null;
  return (
    <>
      {groups.length < 2 ? null : (
        <div aria-label={label} className="segmented-control" role="group">
          {groups.map((candidate) => (
            <button
              aria-pressed={candidate.kind === group.kind}
              key={candidate.kind}
              onClick={() => setChosen(candidate.kind)}
              type="button"
            >
              {candidate.name}
            </button>
          ))}
        </div>
      )}
      <Donut key={group.kind} slices={group.slices} />
    </>
  );
}

/**
 * Then and now: for each thing whose share of the reader's tastings moved,
 * a bar for the time before and one for the last twelve months.
 */
export function ShiftBars({
  rows,
}: {
  rows: readonly { key: string; label: string; now: number; then: number }[];
}) {
  const { i18n, t } = useTranslation();
  const arrival = useArrival<HTMLUListElement>();
  const percent = new Intl.NumberFormat(i18n.language, { style: "percent" });
  const largest = Math.max(0.01, ...rows.flatMap((row) => [row.now, row.then]));
  return (
    <ul className="taste-shifts" {...arrival.props}>
      {rows.map((row, index) => (
        <li key={row.key} style={{ "--motion-index": index } as CSSProperties}>
          <span className="taste-shifts__label">{row.label}</span>
          <span className="taste-shifts__pair">
            <span aria-hidden="true" className="stats-bars__track is-then">
              <span style={{ inlineSize: `${(row.then / largest) * 100}%` }} />
            </span>
            <span className="taste-shifts__value">
              {t("taste.chart.then")} {percent.format(row.then)}
            </span>
            <span aria-hidden="true" className="stats-bars__track">
              <span style={{ inlineSize: `${(row.now / largest) * 100}%` }} />
            </span>
            <span className="taste-shifts__value">
              {t("taste.chart.now")} {percent.format(row.now)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
