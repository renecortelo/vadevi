import type { TastingDescriptorInputSchema, WineType } from "@vadevi/contracts";
import {
  aromaDescriptors,
  aromaNames,
  resolveSupportedLocale,
  type TastingPhase,
} from "@vadevi/i18n/runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";

import { Wheel, type WheelNode } from "../library/Wheel";
import { aromaNodeId, aromaWheel, colourKinds, colourWheel, hueNodeId } from "../library/wheels";
import { hueOptionsFor } from "./deep-tasting-fields";

type Kind = (typeof colourKinds)[number]["kind"];
type Descriptor = z.infer<typeof TastingDescriptorInputSchema>;

/**
 * The tasting's colour, chosen on the colour wheel: only the hues this kind of
 * wine can show, by the kind that shows them. The note keeps the colour's name
 * in the taster's language, as the list did. A colour saved earlier that the
 * wheel does not hold — said in other words, or in another language — is shown
 * and kept until another is chosen; touching the chosen colour again clears it.
 */
export function HueWheel({
  onChange,
  value,
  wineType,
}: {
  onChange: (label: string | undefined, kind: Kind | undefined) => void;
  value: string | undefined;
  wineType: WineType | null;
}) {
  const { t } = useTranslation();
  const label = (hue: string) => t(`tasting.hueOption.${hue}`);
  const all = colourKinds.flatMap((entry) => entry.hues as readonly string[]);
  const current = value === undefined ? undefined : all.find((hue) => label(hue) === value);
  // A colour already chosen stays on the wheel even if the wine's type changed since.
  const offered = new Set([
    ...hueOptionsFor(wineType),
    ...(current === undefined ? [] : [current]),
  ]);
  const whole = colourWheel(t);
  const kinds = (whole.children ?? [])
    .map((kind) => ({
      ...kind,
      children: (kind.children ?? []).filter((hue) => offered.has(hue.id.slice("hue:".length))),
    }))
    .filter((kind) => kind.children.length > 0);
  // One kind alone (a rosé) is the wheel itself, not a ring of one.
  const root: WheelNode = kinds.length === 1 ? kinds[0]! : { ...whole, children: kinds };
  const kindOf = (hue: string) =>
    colourKinds.find((entry) => (entry.hues as readonly string[]).includes(hue))?.kind;

  return (
    <div className="wheel-field">
      <span className="wheel-field__label">{t("tasting.field.hue")}</span>
      <Wheel
        detail={(node) => {
          const kind = kindOf(node.id.slice("hue:".length));
          return kind === undefined
            ? null
            : t("library.wheels.colourOf", { kind: t(`tasting.value.${kind}`) });
        }}
        label={t("tasting.field.hue")}
        onSelect={(node) => {
          const hue = node.id.slice("hue:".length);
          if (hue === current) onChange(undefined, undefined);
          else onChange(label(hue), kindOf(hue));
        }}
        root={root}
        selected={current === undefined ? null : hueNodeId(current)}
      />
      {value !== undefined && value !== "" && current === undefined ? (
        <p className="section-help">{t("tasting.hueKept", { value })}</p>
      ) : null}
    </div>
  );
}

const codeOfTerm = new Map(
  aromaDescriptors.map((descriptor) => [descriptor.term, descriptor.code]),
);
const termOfCode = new Map(
  aromaDescriptors.map((descriptor) => [descriptor.code, descriptor.term]),
);

/**
 * The nose's aromas, found on the aroma wheel: by family and group, as many as
 * the taster noticed. Folded away until asked for, beside the cues it adds to;
 * an aroma chosen here is a cue like the others, listed with them beneath and
 * given an intensity there.
 */
export function AromaWheel({
  descriptors,
  onChange,
  phase,
}: {
  descriptors: Descriptor[];
  onChange: (descriptors: Descriptor[]) => void;
  phase: TastingPhase;
}) {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const [open, setOpen] = useState(false);
  const chosen = descriptors.flatMap((entry) => {
    const term = termOfCode.get(entry.code);
    return term === undefined ? [] : [aromaNodeId(term)];
  });

  return (
    <div className="wheel-field">
      <button
        aria-expanded={open}
        className="action-link action-link--secondary wheel-field__toggle"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {open ? t("tasting.aromaWheel.close") : t("tasting.aromaWheel.open")}
      </button>
      {open ? (
        <Wheel
          label={t("library.wheels.aromas")}
          onSelect={(node) => {
            const code = codeOfTerm.get(node.id.slice("aroma:".length));
            if (code === undefined) return;
            onChange(
              descriptors.some((entry) => entry.code === code)
                ? descriptors.filter((entry) => entry.code !== code)
                : [...descriptors, { code, phase }],
            );
          }}
          root={aromaWheel(t, (term) => aromaNames[term]?.[locale] ?? term)}
          selected={chosen}
        />
      ) : null}
    </div>
  );
}
