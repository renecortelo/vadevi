import { useState } from "react";
import { useTranslation } from "react-i18next";

import { NewWineInline } from "./NewWineInline";
import { useWineSearch } from "./use-wine-search";
import { type PickableWine, wineOptionLabel } from "./wine-label";

/** The value that reveals the two fields, rather than selecting a wine. */
const addValue = "__add__";

/**
 * Choose a wine, or add one without leaving.
 *
 * The cellar, the wishlist and the price list all needed a wine before they
 * could record anything, and offered only a list of wines already saved. Buying
 * a bottle you had never logged meant leaving the screen, logging it, and
 * finding your way back — which is the wrong order for the thing you are
 * actually doing, which is recording a purchase.
 *
 * The new wine is created as a draft, exactly as Quick Log creates one. Nothing
 * here makes a wine canonical; confirming it does, wherever that happens.
 *
 * A filter sits above the list. Scrolling a dropdown is already unpleasant at
 * forty wines, and the list the screen holds is one page deep — so typing also
 * asks the server, which is the only way to reach a wine past the first page.
 */

export function WinePicker({
  label,
  onChange,
  onCreated,
  onSearch,
  required = false,
  value,
  wines,
}: {
  label: string;
  onChange: (wineId: string) => void;
  /** Lets the screen reload its own list once a wine exists. */
  onCreated: (wineId: string) => Promise<void> | void;
  /** Asks the screen to fetch matches from the server. Without it the filter
   *  still narrows what is already loaded, which is all a short list needs. */
  onSearch?: ((query: string) => Promise<void> | void) | undefined;
  required?: boolean;
  value: string;
  wines: PickableWine[];
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const { filter, setFilter, shown } = useWineSearch(wines, onSearch);

  return (
    <div className="wine-picker-field">
      <label htmlFor="wine-picker">{label}</label>
      <input
        aria-label={t("winePicker.filterLabel")}
        className="wine-picker-field__filter"
        onChange={(event) => setFilter(event.target.value)}
        placeholder={t("winePicker.filterPlaceholder")}
        type="search"
        value={filter}
      />
      <select
        id="wine-picker"
        onChange={(event) => {
          if (event.target.value === addValue) {
            setAdding(true);
            return;
          }
          setAdding(false);
          onChange(event.target.value);
        }}
        required={required}
        value={adding ? addValue : value}
      >
        <option value="">{t("winePicker.choose")}</option>
        {shown.map((wine) => (
          <option key={wine.id} value={wine.id}>
            {wineOptionLabel(wine)}
          </option>
        ))}
        <option value={addValue}>{t("winePicker.addOption")}</option>
      </select>

      {adding ? (
        <NewWineInline
          onCreated={async (wineId) => {
            await onCreated(wineId);
            onChange(wineId);
            setAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}
