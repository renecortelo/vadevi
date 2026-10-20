import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { type LibraryTrail, useLibraryTrail } from "./trail";

/**
 * "← Back to Viña Tondonia", where there is somewhere to go back to — or, on a
 * page that always has a way back, to where it belongs (`fallback`). The page
 * it leads to gets its own way back, the next link of the chain.
 */
export function TrailBackLink({ fallback }: { fallback?: LibraryTrail } = {}) {
  const { t } = useTranslation();
  const trail = useLibraryTrail()?.libraryTrail ?? fallback;
  if (trail === undefined) return null;
  return (
    <Link
      className="text-link"
      state={trail.back === undefined ? undefined : { libraryTrail: trail.back }}
      to={trail.path}
    >
      ← {t("library.backTo", { name: trail.label })}
    </Link>
  );
}
