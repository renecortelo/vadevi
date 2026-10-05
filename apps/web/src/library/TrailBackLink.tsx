import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useLibraryTrail } from "./trail";

/** "← Back to Viña Tondonia", where there is somewhere to go back to. */
export function TrailBackLink() {
  const { t } = useTranslation();
  const trail = useLibraryTrail();
  if (trail === null) return null;
  return (
    <Link className="text-link" to={trail.libraryTrail.path}>
      ← {t("library.backTo", { name: trail.libraryTrail.label })}
    </Link>
  );
}
