import type { TasteProfile } from "@vadevi/contracts";
import { aromaDescriptors, aromaNames, resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Wheel, type WheelNode } from "../library/Wheel";
import { aromaNodeId, aromaWheel, colourWheel, hueNodeId } from "../library/wheels";

type Kind = "aromas" | "colours";

/**
 * A wheel cut down to what the reader noticed: each part as large as the
 * tastings that named it, and a part no tasting named left out. Each node's
 * tastings, its parts' together, are kept for the centre to say.
 */
function noticed(
  node: WheelNode,
  count: ReadonlyMap<string, number>,
  totals: Map<string, number>,
): WheelNode | null {
  if (node.children === undefined || node.children.length === 0) {
    const notes = count.get(node.id) ?? 0;
    if (notes === 0) return null;
    totals.set(node.id, notes);
    return { ...node, muted: false, weight: notes };
  }
  const children = node.children.flatMap((child) => {
    const kept = noticed(child, count, totals);
    return kept === null ? [] : [kept];
  });
  if (children.length === 0) return null;
  totals.set(
    node.id,
    children.reduce((sum, child) => sum + (totals.get(child.id) ?? 0), 0),
  );
  return { ...node, children };
}

const termOfCode = new Map(
  aromaDescriptors.map((descriptor) => [descriptor.code, descriptor.term]),
);

/**
 * The reader's own wheels, in their taste profile: the aromas they chose in
 * their tastings and the colours they saw, each as large as how often. Only
 * their own records; nothing they did not note is drawn.
 */
export function TasteWheels({ wheels }: { wheels: TasteProfile["wheels"] }) {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const [kind, setKind] = useState<Kind>("aromas");
  const [selected, setSelected] = useState<string | null>(null);

  const aromaCounts = new Map(
    wheels.descriptors.flatMap((entry) => {
      const term = termOfCode.get(entry.code);
      return term === undefined ? [] : [[aromaNodeId(term), entry.notes] as const];
    }),
  );
  const hueCounts = new Map(wheels.hues.map((entry) => [hueNodeId(entry.code), entry.notes]));
  const totals = new Map<string, number>();
  const root =
    kind === "aromas"
      ? noticed(
          aromaWheel(t, (term) => aromaNames[term]?.[locale] ?? term),
          aromaCounts,
          totals,
        )
      : noticed(colourWheel(t), hueCounts, totals);
  const switchTo = (next: Kind) => {
    setKind(next);
    setSelected(null);
  };

  return (
    <section aria-labelledby="taste-wheels" className="settings-card wheel-card">
      <h2 id="taste-wheels">{t("taste.wheels.title")}</h2>
      <p className="section-help">{t("taste.wheels.intro")}</p>
      <div aria-label={t("taste.wheels.title")} className="segmented-control" role="group">
        {(["aromas", "colours"] as const).map((option) => (
          <button
            aria-pressed={kind === option}
            key={option}
            onClick={() => switchTo(option)}
            type="button"
          >
            {t(`library.wheels.${option}`)}
          </button>
        ))}
      </div>
      {root === null ? (
        <p className="section-help">
          {kind === "aromas" ? t("taste.wheels.noAromas") : t("taste.wheels.noColours")}
        </p>
      ) : (
        <Wheel
          detail={(node) => {
            const notes = totals.get(node.id);
            return notes === undefined ? null : t("taste.wheels.notes", { count: notes });
          }}
          key={kind}
          label={t(`library.wheels.${kind}`)}
          onSelect={(node) => setSelected(node.id === selected ? null : node.id)}
          root={root}
          selected={selected}
        />
      )}
    </section>
  );
}
