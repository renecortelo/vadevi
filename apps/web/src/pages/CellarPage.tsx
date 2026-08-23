import type { Bottle, BottleListResponse, WineSummary } from "@vadevi/contracts";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { parseDecimalInput } from "../lib/decimal";
import { useAuth } from "../auth/AuthContext";
import { offlineDatabase, partitionId } from "../offline/database";
import { WinePicker } from "../components/WinePicker";
import { createIdempotencyKey } from "../security/idempotency";
import { getWineMemory } from "../services/api";
import { createPurchase, getBottles, updateBottle } from "../services/cellar";
import { useSession } from "../session/SessionContext";

const emptyInventory: BottleListResponse["data"]["inventory"] = {
  finished: 0,
  gifted: 0,
  opened: 0,
  owned: 0,
  removed: 0,
  totalAvailable: 0,
};

export function CellarPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const userId = user?.uid ?? "";
  const [response, setResponse] = useState<BottleListResponse>({
    data: { bottles: [], inventory: emptyInventory },
  });
  const [wines, setWines] = useState<WineSummary[]>([]);
  const [usingCache, setUsingCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wineId, setWineId] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [quantity, setQuantity] = useState("1");

  const loadCache = useCallback(async () => {
    if (userId.length === 0) return;
    const [cellar, memory] = await Promise.all([
      offlineDatabase.cellar.get(partitionId(userId, spaceId)),
      offlineDatabase.snapshots.where("[userId+spaceId]").equals([userId, spaceId]).toArray(),
    ]);
    if (cellar !== undefined) setResponse(cellar.response);
    setWines(memory.map((snapshot) => snapshot.wine));
    setUsingCache(true);
  }, [spaceId, userId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    if (user === null || !navigator.onLine) {
      await loadCache();
      setLoading(false);
      return;
    }
    try {
      const [cellar, memory] = await Promise.all([
        getBottles(user, spaceId),
        getWineMemory(user, spaceId, { limit: 100 }),
      ]);
      setResponse(cellar);
      setWines(memory.data);
      setUsingCache(false);
      await offlineDatabase.cellar.put({
        id: partitionId(user.uid, spaceId),
        response: cellar,
        spaceId,
        updatedAt: new Date().toISOString(),
        userId: user.uid,
      });
    } catch {
      setError(true);
      await loadCache();
    } finally {
      setLoading(false);
    }
  }, [loadCache, spaceId, user]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const wineById = useMemo(
    () => new Map(wines.map((wine): [string, WineSummary] => [wine.id, wine])),
    [wines],
  );

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user === null || !navigator.onLine || wineId.length === 0) return;
    const parsedAmount = parseDecimalInput(amount) ?? Number.NaN;
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0 || parsedQuantity < 1) return;
    setSaving(true);
    setError(false);
    try {
      await createPurchase(
        user,
        spaceId,
        {
          createBottles: true,
          currency,
          merchantName,
          purchasedAt: new Date().toISOString(),
          quantity: parsedQuantity,
          unitAmountMinor: Math.round(parsedAmount * 100),
          wineId,
        },
        createIdempotencyKey(),
      );
      setAmount("");
      setMerchantName("");
      setQuantity("1");
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function transition(bottle: Bottle, state: Bottle["state"]) {
    if (user === null || !navigator.onLine) return;
    setSaving(true);
    setError(false);
    try {
      await updateBottle(user, spaceId, bottle.id, {
        occurredAt: new Date().toISOString(),
        state,
        version: bottle.version,
      });
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="phase5-page">
      <header className="page-heading phase5-heading">
        <div>
          <p className="eyebrow">{t("cellar.eyebrow")}</p>
          <h1>{t("cellar.title")}</h1>
          <p>{t("cellar.body")}</p>
        </div>
        <nav aria-label={t("cellar.relatedLabel")} className="phase5-links">
          <Link to="/wishlist">{t("cellar.openWishlist")}</Link>
          <Link to="/shop">{t("cellar.openShop")}</Link>
        </nav>
      </header>

      {usingCache ? <p className="offline-banner">{t("cellar.cached")}</p> : null}
      {error ? <p className="form-error">{t("cellar.error")}</p> : null}

      <section aria-label={t("cellar.inventoryTitle")} className="inventory-grid">
        {(["owned", "opened", "finished", "gifted"] as const).map((state) => (
          <article className="inventory-card" key={state}>
            <span>{t(`cellar.state.${state}`)}</span>
            <strong>{response.data.inventory[state]}</strong>
          </article>
        ))}
        <article className="inventory-card inventory-card--accent">
          <span>{t("cellar.available")}</span>
          <strong>{response.data.inventory.totalAvailable}</strong>
        </article>
      </section>

      <section className="phase5-form-card">
        <h2>{t("cellar.purchaseTitle")}</h2>
        <p>{navigator.onLine ? t("cellar.purchaseBody") : t("cellar.onlineRequired")}</p>
        <form className="phase5-form" onSubmit={(event) => void submitPurchase(event)}>
          <WinePicker
            label={t("cellar.wine")}
            onChange={setWineId}
            onCreated={() => load()}
            required
            value={wineId}
            wines={wines}
          />
          <label>
            {t("cellar.merchant")}
            <input
              maxLength={200}
              onChange={(event) => setMerchantName(event.target.value)}
              required
              value={merchantName}
            />
          </label>
          <label>
            {t("cellar.unitPrice")}
            <input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              required
              value={amount}
            />
          </label>
          <label>
            {t("cellar.currency")}
            <input
              maxLength={3}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              pattern="[A-Z]{3}"
              required
              value={currency}
            />
          </label>
          <label>
            {t("cellar.quantity")}
            <input
              max="100"
              min="1"
              onChange={(event) => setQuantity(event.target.value)}
              required
              type="number"
              value={quantity}
            />
          </label>
          <button
            className="primary-button"
            disabled={saving || !navigator.onLine || wines.length === 0}
          >
            {saving ? t("cellar.saving") : t("cellar.recordPurchase")}
          </button>
        </form>
      </section>

      <section>
        <h2>{t("cellar.bottlesTitle")}</h2>
        {loading ? <p>{t("cellar.loading")}</p> : null}
        {!loading && response.data.bottles.length === 0 ? (
          <div className="empty-state">
            <p>{t("cellar.empty")}</p>
          </div>
        ) : (
          <div className="bottle-grid">
            {response.data.bottles.map((bottle: Bottle) => {
              const wine = wineById.get(bottle.wineId);
              return (
                <article className="bottle-card" key={bottle.id}>
                  <span className="evidence-chip" data-evidence="observed">
                    {t(`cellar.state.${bottle.state}`)}
                  </span>
                  <h3>{wine?.displayName ?? t("cellar.unknownWine")}</h3>
                  <p>{wine?.producerName ?? "—"}</p>
                  {bottle.storageLocation === null ? null : <p>{bottle.storageLocation}</p>}
                  <div className="phase5-card-actions">
                    {bottle.state === "owned" ? (
                      <>
                        <button
                          disabled={saving || !navigator.onLine}
                          onClick={() => void transition(bottle, "opened")}
                          type="button"
                        >
                          {t("cellar.openBottle")}
                        </button>
                        <button
                          disabled={saving || !navigator.onLine}
                          onClick={() => void transition(bottle, "gifted")}
                          type="button"
                        >
                          {t("cellar.giftBottle")}
                        </button>
                      </>
                    ) : null}
                    {bottle.state === "opened" ? (
                      <button
                        disabled={saving || !navigator.onLine}
                        onClick={() => void transition(bottle, "finished")}
                        type="button"
                      >
                        {t("cellar.finishBottle")}
                      </button>
                    ) : null}
                    {bottle.state === "owned" || bottle.state === "opened" ? (
                      <button
                        disabled={saving || !navigator.onLine}
                        onClick={() => void transition(bottle, "removed")}
                        type="button"
                      >
                        {t("cellar.removeBottle")}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
