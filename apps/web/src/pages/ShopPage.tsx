import type {
  PriceObservation,
  PriceObservationListResponse,
  WineSummary,
} from "@vadevi/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { offlineDatabase } from "../offline/database";
import { createIdempotencyKey } from "../security/idempotency";
import { createPriceObservation, getPriceObservations, getWineMemory } from "../services/api";
import { useSession } from "../session/SessionContext";

function priceSnapshotId(userId: string, spaceId: string, wineId: string) {
  return `${userId}:${spaceId}:${wineId}`;
}

export function ShopPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const [wines, setWines] = useState<WineSummary[]>([]);
  const [wineId, setWineId] = useState("");
  const [prices, setPrices] = useState<PriceObservationListResponse>({
    data: { observations: [], warnings: [] },
  });
  const [usingCache, setUsingCache] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [merchantName, setMerchantName] = useState("");
  const [channel, setChannel] = useState<PriceObservation["channel"]>("physical");
  const [sourceType, setSourceType] = useState<"merchant" | "receipt" | "shelf">("shelf");
  const [vintageMatch, setVintageMatch] = useState<PriceObservation["vintageMatch"]>("unknown");

  const loadPrices = useCallback(async () => {
    if (wineId.length === 0 || user === null) {
      setPrices({ data: { observations: [], warnings: [] } });
      return;
    }
    const id = priceSnapshotId(user.uid, spaceId, wineId);
    if (!navigator.onLine) {
      const cached = await offlineDatabase.prices.get(id);
      if (cached !== undefined) setPrices(cached.response);
      setUsingCache(true);
      return;
    }
    try {
      const response = await getPriceObservations(user, spaceId, wineId, { freshnessDays: 90 });
      setPrices(response);
      setUsingCache(false);
      await offlineDatabase.prices.put({
        id,
        response,
        spaceId,
        updatedAt: new Date().toISOString(),
        userId: user.uid,
        wineId,
      });
    } catch {
      setError(true);
      const cached = await offlineDatabase.prices.get(id);
      if (cached !== undefined) setPrices(cached.response);
      setUsingCache(true);
    }
  }, [spaceId, user, wineId]);

  useEffect(() => {
    if (user === null) return;
    if (!navigator.onLine) {
      void offlineDatabase.snapshots
        .where("[userId+spaceId]")
        .equals([user.uid, spaceId])
        .toArray()
        .then((rows) => setWines(rows.map((row) => row.wine)));
      return;
    }
    void getWineMemory(user, spaceId, { limit: 100 })
      .then((response) => setWines(response.data))
      .catch(() => setError(true));
  }, [spaceId, user]);

  useEffect(() => {
    queueMicrotask(() => void loadPrices());
  }, [loadPrices]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user === null || !navigator.onLine || wineId.length === 0) return;
    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return;
    setSaving(true);
    setError(false);
    try {
      await createPriceObservation(
        user,
        spaceId,
        wineId,
        {
          amountMinor: Math.round(parsedAmount * 100),
          channel,
          currency,
          merchantName: merchantName.length === 0 ? undefined : merchantName,
          observedAt: new Date().toISOString(),
          sourceType,
          vintageMatch,
        },
        createIdempotencyKey(),
      );
      setAmount("");
      await loadPrices();
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
          <p className="eyebrow">{t("shop.eyebrow")}</p>
          <h1>{t("shop.title")}</h1>
          <p>{t("shop.body")}</p>
        </div>
        <nav aria-label={t("shop.relatedLabel")} className="phase5-links">
          <Link to="/cellar">{t("shop.openCellar")}</Link>
          <Link to="/wishlist">{t("shop.openWishlist")}</Link>
        </nav>
      </header>
      {usingCache ? <p className="offline-banner">{t("shop.cached")}</p> : null}
      {error ? <p className="form-error">{t("shop.error")}</p> : null}
      <label className="shop-wine-picker">
        {t("shop.wine")}
        <select onChange={(event) => setWineId(event.target.value)} value={wineId}>
          <option value="">{t("shop.chooseWine")}</option>
          {wines.map((wine) => (
            <option key={wine.id} value={wine.id}>
              {wine.producerName} · {wine.displayName}
            </option>
          ))}
        </select>
      </label>
      <section className="phase5-form-card">
        <h2>{t("shop.recordTitle")}</h2>
        <p>{t("shop.coverageWarning")}</p>
        <form className="phase5-form" onSubmit={(event) => void submit(event)}>
          <label>
            {t("shop.amount")}
            <input
              min="0"
              onChange={(event) => setAmount(event.target.value)}
              required
              step="0.01"
              type="number"
              value={amount}
            />
          </label>
          <label>
            {t("shop.currency")}
            <input
              maxLength={3}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              pattern="[A-Z]{3}"
              required
              value={currency}
            />
          </label>
          <label>
            {t("shop.merchant")}
            <input
              maxLength={200}
              onChange={(event) => setMerchantName(event.target.value)}
              required={sourceType === "merchant"}
              value={merchantName}
            />
          </label>
          <label>
            {t("shop.channel")}
            <select
              onChange={(event) => setChannel(event.target.value as PriceObservation["channel"])}
              value={channel}
            >
              <option value="physical">{t("shop.channelValue.physical")}</option>
              <option value="online">{t("shop.channelValue.online")}</option>
              <option value="unknown">{t("shop.channelValue.unknown")}</option>
            </select>
          </label>
          <label>
            {t("shop.sourceType")}
            <select
              onChange={(event) => setSourceType(event.target.value as typeof sourceType)}
              value={sourceType}
            >
              <option value="shelf">{t("shop.sourceValue.shelf")}</option>
              <option value="receipt">{t("shop.sourceValue.receipt")}</option>
              <option value="merchant">{t("shop.sourceValue.merchant")}</option>
            </select>
          </label>
          <label>
            {t("shop.vintageMatch")}
            <select
              onChange={(event) =>
                setVintageMatch(event.target.value as PriceObservation["vintageMatch"])
              }
              value={vintageMatch}
            >
              <option value="yes">{t("shop.matchValue.yes")}</option>
              <option value="no">{t("shop.matchValue.no")}</option>
              <option value="unknown">{t("shop.matchValue.unknown")}</option>
            </select>
          </label>
          <button
            className="primary-button"
            disabled={saving || !navigator.onLine || wineId.length === 0}
          >
            {saving ? t("shop.saving") : t("shop.recordAction")}
          </button>
        </form>
        {!navigator.onLine ? <p>{t("shop.onlineRequired")}</p> : null}
      </section>
      <section>
        <h2>{t("shop.observationsTitle")}</h2>
        {prices.data.observations.length === 0 ? (
          <div className="empty-state">
            <p>{t("shop.empty")}</p>
          </div>
        ) : (
          <div className="price-grid">
            {prices.data.observations.map((price: PriceObservation) => (
              <article className="price-card" key={price.id}>
                <div className="price-card__heading">
                  <strong>
                    {new Intl.NumberFormat(i18n.language, {
                      style: "currency",
                      currency: price.currency,
                    }).format(price.amountMinor / 100)}
                  </strong>
                  {price.isStale ? <span>{t("shop.stale")}</span> : <span>{t("shop.recent")}</span>}
                </div>
                <p>{price.merchantName ?? t("shop.merchantUnknown")}</p>
                <dl>
                  <div>
                    <dt>{t("shop.observedAt")}</dt>
                    <dd>
                      <time dateTime={price.observedAt}>
                        {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
                          new Date(price.observedAt),
                        )}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("shop.sourceType")}</dt>
                    <dd>{t(`shop.sourceValue.${price.sourceType}`)}</dd>
                  </div>
                  <div>
                    <dt>{t("shop.vintageMatch")}</dt>
                    <dd>{t(`shop.matchValue.${price.vintageMatch}`)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
