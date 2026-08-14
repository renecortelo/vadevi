import type { WineSummary, WishlistItem, WishlistListResponse } from "@vadevi/contracts";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { offlineDatabase, partitionId } from "../offline/database";
import { createIdempotencyKey } from "../security/idempotency";
import { getWineMemory } from "../services/api";
import { createWishlistItem, getWishlist, updateWishlistItem } from "../services/cellar";
import { useSession } from "../session/SessionContext";

export function WishlistPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const userId = user?.uid ?? "";
  const [response, setResponse] = useState<WishlistListResponse>({ data: [] });
  const [wines, setWines] = useState<WineSummary[]>([]);
  const [usingCache, setUsingCache] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wineId, setWineId] = useState("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState("2");
  const [targetPrice, setTargetPrice] = useState("");
  const [targetCurrency, setTargetCurrency] = useState("EUR");

  const loadCache = useCallback(async () => {
    if (userId.length === 0) return;
    const [wishlist, memory] = await Promise.all([
      offlineDatabase.wishlist.get(partitionId(userId, spaceId)),
      offlineDatabase.snapshots.where("[userId+spaceId]").equals([userId, spaceId]).toArray(),
    ]);
    if (wishlist !== undefined) setResponse(wishlist.response);
    setWines(memory.map((snapshot) => snapshot.wine));
    setUsingCache(true);
  }, [spaceId, userId]);

  const load = useCallback(async () => {
    setError(false);
    if (user === null || !navigator.onLine) return loadCache();
    try {
      const [wishlist, memory] = await Promise.all([
        getWishlist(user, spaceId),
        getWineMemory(user, spaceId, { limit: 100 }),
      ]);
      setResponse(wishlist);
      setWines(memory.data);
      setUsingCache(false);
      await offlineDatabase.wishlist.put({
        id: partitionId(user.uid, spaceId),
        response: wishlist,
        spaceId,
        updatedAt: new Date().toISOString(),
        userId: user.uid,
      });
    } catch {
      setError(true);
      await loadCache();
    }
  }, [loadCache, spaceId, user]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const wineById = useMemo(
    () => new Map(wines.map((wine): [string, WineSummary] => [wine.id, wine])),
    [wines],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user === null || !navigator.onLine || wineId.length === 0) return;
    const parsedTarget = targetPrice.length === 0 ? null : Number.parseFloat(targetPrice);
    setSaving(true);
    setError(false);
    try {
      await createWishlistItem(
        user,
        spaceId,
        {
          priority: Number.parseInt(priority, 10),
          reason,
          ...(parsedTarget === null || !Number.isFinite(parsedTarget)
            ? {}
            : { targetAmountMinor: Math.round(parsedTarget * 100), targetCurrency }),
          wineId,
        },
        createIdempotencyKey(),
      );
      setReason("");
      setTargetPrice("");
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function close(item: WishlistItem, state: "dismissed" | "purchased") {
    if (user === null || !navigator.onLine) return;
    setSaving(true);
    try {
      await updateWishlistItem(user, spaceId, item.id, { state, version: item.version });
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
          <p className="eyebrow">{t("wishlist.eyebrow")}</p>
          <h1>{t("wishlist.title")}</h1>
          <p>{t("wishlist.body")}</p>
        </div>
        <nav aria-label={t("wishlist.relatedLabel")} className="phase5-links">
          <Link to="/cellar">{t("wishlist.openCellar")}</Link>
          <Link to="/shop">{t("wishlist.openShop")}</Link>
        </nav>
      </header>
      {usingCache ? <p className="offline-banner">{t("wishlist.cached")}</p> : null}
      {error ? <p className="form-error">{t("wishlist.error")}</p> : null}
      <section className="phase5-form-card">
        <h2>{t("wishlist.addTitle")}</h2>
        <form className="phase5-form" onSubmit={(event) => void submit(event)}>
          <label>
            {t("wishlist.wine")}
            <select onChange={(event) => setWineId(event.target.value)} required value={wineId}>
              <option value="">{t("wishlist.chooseWine")}</option>
              {wines.map((wine) => (
                <option key={wine.id} value={wine.id}>
                  {wine.producerName} · {wine.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("wishlist.reason")}
            <input
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          </label>
          <label>
            {t("wishlist.priority")}
            <select onChange={(event) => setPriority(event.target.value)} value={priority}>
              <option value="1">{t("wishlist.priorityValue.1")}</option>
              <option value="2">{t("wishlist.priorityValue.2")}</option>
              <option value="3">{t("wishlist.priorityValue.3")}</option>
            </select>
          </label>
          <label>
            {t("wishlist.targetPrice")}
            <input
              min="0"
              onChange={(event) => setTargetPrice(event.target.value)}
              step="0.01"
              type="number"
              value={targetPrice}
            />
          </label>
          <label>
            {t("cellar.currency")}
            <input
              maxLength={3}
              onChange={(event) => setTargetCurrency(event.target.value.toUpperCase())}
              pattern="[A-Z]{3}"
              required={targetPrice.length > 0}
              value={targetCurrency}
            />
          </label>
          <button
            className="primary-button"
            disabled={saving || !navigator.onLine || wines.length === 0}
          >
            {saving ? t("wishlist.saving") : t("wishlist.addAction")}
          </button>
        </form>
        {!navigator.onLine ? <p>{t("wishlist.onlineRequired")}</p> : null}
      </section>
      <section>
        <h2>{t("wishlist.itemsTitle")}</h2>
        {response.data.length === 0 ? (
          <div className="empty-state">
            <p>{t("wishlist.empty")}</p>
          </div>
        ) : (
          <div className="wishlist-grid">
            {response.data.map((item: WishlistItem) => {
              const wine = wineById.get(item.wineId);
              return (
                <article className="wishlist-card" key={item.id}>
                  <span className="evidence-chip" data-evidence="personal">
                    {t(`wishlist.state.${item.state}`)}
                  </span>
                  <h3>{wine?.displayName ?? t("wishlist.unknownWine")}</h3>
                  <p>{item.reason}</p>
                  <p>{t("wishlist.priorityDisplay", { priority: item.priority })}</p>
                  {item.targetAmountMinor === null ? null : (
                    <strong>
                      {new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: item.targetCurrency ?? "EUR",
                      }).format(item.targetAmountMinor / 100)}
                    </strong>
                  )}
                  {item.state === "active" ? (
                    <div className="phase5-card-actions">
                      <button
                        disabled={saving || !navigator.onLine}
                        onClick={() => void close(item, "purchased")}
                        type="button"
                      >
                        {t("wishlist.markPurchased")}
                      </button>
                      <button
                        disabled={saving || !navigator.onLine}
                        onClick={() => void close(item, "dismissed")}
                        type="button"
                      >
                        {t("wishlist.dismiss")}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
