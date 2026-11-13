import {
  type CurrencyCode,
  fromMinorUnits,
  supportedCurrencies,
  toMinorUnits,
  type WineLookupItem,
  type WishlistItem,
  type WishlistListResponse,
} from "@vadevi/contracts";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { parseDecimalInput } from "../lib/decimal";
import { useAuth } from "../auth/AuthContext";
import { offlineDatabase, partitionId } from "../offline/database";
import { createIdempotencyKey } from "../security/idempotency";
import { lookupWines } from "../services/api";
import { createWishlistItem, getWishlist, updateWishlistItem } from "../services/cellar";
import { WinePicker } from "../components/WinePicker";
import { useSession } from "../session/SessionContext";
import { LoadMoreButton } from "../components/LoadMoreButton";
import { useLatestLoad } from "../lib/latest-load";
import { useLoadMore } from "../lib/load-more";

export function WishlistPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const userId = user?.uid ?? "";
  const [response, setResponse] = useState<WishlistListResponse>({
    data: [],
    hasMore: false,
    nextCursor: null,
  });
  const [wines, setWines] = useState<WineLookupItem[]>([]);
  const [usingCache, setUsingCache] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wineId, setWineId] = useState("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState("2");
  const [targetPrice, setTargetPrice] = useState("");
  const [targetCurrency, setTargetCurrency] = useState<CurrencyCode>("EUR");

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

  const startLoad = useLatestLoad();
  const { loading: loadingMore, loadMore, restart } = useLoadMore();
  const load = useCallback(async () => {
    const isLatest = startLoad();
    restart();
    setError(false);
    if (user === null || !navigator.onLine) return loadCache();
    try {
      const [wishlist, memory] = await Promise.all([
        getWishlist(user, spaceId),
        lookupWines(user, spaceId),
      ]);
      // A Space switched mid-load: this answer is the old Space's.
      if (!isLatest()) return;
      setResponse(wishlist);
      setWines(memory);
      setUsingCache(false);
      await offlineDatabase.wishlist.put({
        id: partitionId(user.uid, spaceId),
        response: wishlist,
        spaceId,
        updatedAt: new Date().toISOString(),
        userId: user.uid,
      });
    } catch {
      if (!isLatest()) return;
      setError(true);
      await loadCache();
    }
  }, [loadCache, restart, spaceId, startLoad, user]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const wineById = useMemo(
    () => new Map(wines.map((wine): [string, WineLookupItem] => [wine.id, wine])),
    [wines],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user === null || !navigator.onLine || wineId.length === 0) return;
    const parsedTarget = parseDecimalInput(targetPrice);
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
            : { targetAmountMinor: toMinorUnits(parsedTarget, targetCurrency), targetCurrency }),
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

  /** Refresh the pickable wines from the server as the reader types. Without
   *  this the picker can only offer the page of wines already loaded, which is
   *  where the old hundred-wine ceiling still bit. */
  function showMore() {
    const cursor = response.nextCursor;
    if (user === null || cursor === null) return;
    void loadMore(
      () => getWishlist(user, spaceId, undefined, undefined, cursor),
      (page) => setResponse((current) => ({ ...page, data: [...current.data, ...page.data] })),
    );
  }

  async function searchWines(query: string) {
    if (user === null || !navigator.onLine) return;
    try {
      setWines(await lookupWines(user, spaceId, query));
    } catch {
      // Keep whatever is already offered; the reader can still pick from it.
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
      </header>
      {usingCache ? <p className="offline-banner">{t("wishlist.cached")}</p> : null}
      {error ? <p className="form-error">{t("wishlist.error")}</p> : null}
      <section className="phase5-form-card">
        <h2>{t("wishlist.addTitle")}</h2>
        <form className="phase5-form" onSubmit={(event) => void submit(event)}>
          <WinePicker
            onSearch={searchWines}
            label={t("wishlist.wine")}
            onChange={setWineId}
            onCreated={() => load()}
            required
            value={wineId}
            wines={wines}
          />
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
              inputMode="decimal"
              onChange={(event) => setTargetPrice(event.target.value)}
              value={targetPrice}
            />
          </label>
          <label>
            {t("cellar.currency")}
            <select
              onChange={(event) => setTargetCurrency(event.target.value as CurrencyCode)}
              value={targetCurrency}
            >
              {supportedCurrencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
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
              const wine = item.wine ?? wineById.get(item.wineId);
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
                      }).format(
                        fromMinorUnits(item.targetAmountMinor, item.targetCurrency ?? "EUR"),
                      )}
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
        {(response.nextCursor ?? null) === null ? null : (
          <LoadMoreButton
            count={response.data.length}
            loading={loadingMore}
            onClick={() => showMore()}
          />
        )}
      </section>
    </section>
  );
}
