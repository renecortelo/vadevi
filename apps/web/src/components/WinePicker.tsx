import { useState } from "react";
import { useTranslation } from "react-i18next";

import { NewWineInline } from "./NewWineInline";
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
 */

export function WinePicker({
  label,
  onChange,
  onCreated,
  required = false,
  value,
  wines,
}: {
  label: string;
  onChange: (wineId: string) => void;
  /** Lets the screen reload its own list once a wine exists. */
  onCreated: (wineId: string) => Promise<void> | void;
  required?: boolean;
  value: string;
  wines: PickableWine[];
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);

  return (
    <div className="wine-picker-field">
      <label htmlFor="wine-picker">{label}</label>
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
        {wines.map((wine) => (
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
