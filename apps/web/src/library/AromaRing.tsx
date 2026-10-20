import { type AromaDescriptor, aromaFamilies } from "@vadevi/i18n/runtime";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { slice } from "./ring";
import { familyColours } from "./wheels";

/**
 * A grape's aromas at a glance, as a small ring of the wheel's families: each
 * family as large as the aromas of it its sources name, in the wheel's
 * colours, with the families and their counts written beside it — the ring is
 * a picture of that list — and the way to the whole wheel.
 */
export function AromaRing({ descriptors }: { descriptors: readonly AromaDescriptor[] }) {
  const { t } = useTranslation();
  const counts = aromaFamilies
    .map((family) => ({
      count: descriptors.filter((descriptor) => descriptor.family === family).length,
      family,
    }))
    .filter((entry) => entry.count > 0);
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return null;
  const gap = counts.length > 1 ? 3 : 0;
  const placed = counts.reduce<{ end: number; family: string; start: number }[]>((items, entry) => {
    const start = items.at(-1)?.end ?? 0;
    return [...items, { end: start + (360 * entry.count) / total, family: entry.family, start }];
  }, []);

  return (
    <div className="aroma-ring">
      <svg aria-hidden="true" className="aroma-ring__svg" viewBox="-100 -100 200 200">
        {placed.map(({ end, family, start }) => (
          <path
            d={slice(start + gap / 2, end - gap / 2, 52, 92)}
            key={family}
            style={{ fill: familyColours[family as keyof typeof familyColours] }}
          />
        ))}
      </svg>
      <div>
        <ul aria-label={t("library.wheels.byFamily")} className="aroma-ring__legend">
          {counts.map(({ count, family }) => (
            <li key={family}>
              <span
                aria-hidden="true"
                className="wheel__dot"
                style={{ background: familyColours[family] }}
              />
              {t(`library.aromaFamily.${family}`)}
              <span className="aroma-ring__count">{count}</span>
            </li>
          ))}
        </ul>
        <Link className="text-link" to="/library?tab=wheels">
          {t("library.wheels.seeWheel")}
        </Link>
      </div>
    </div>
  );
}
