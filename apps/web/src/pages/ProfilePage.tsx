import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CurrencyCode,
  fromMinorUnits,
  supportedCurrencies,
  type TasteDeclaration,
  type TasteProfile,
  type TasteTrait,
  toMinorUnits,
} from "@vadevi/contracts";
import { descriptorText, resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { WineLink } from "../components/WineLink";
import { trailFrom } from "../library/trail";
import {
  getTasteDeclaration,
  getTasteProfile,
  saveTasteDeclaration,
  writeTasteBio,
} from "../services/taste";

type Named = Pick<TasteTrait, "key" | "kind" | "label">;

/**
 * The reader's taste: what their own tastings show, measured against their
 * own average, with the wines behind each trait — and, apart, what they say
 * of it themselves. Nothing here is a model's opinion: the summary at the top
 * is written from the same numbers by fixed sentences.
 */
export function ProfilePage() {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const { user } = useAuth();
  const profileQuery = useQuery({
    enabled: user !== null,
    queryFn: ({ signal }) => getTasteProfile(user!, locale, signal),
    queryKey: ["taste-profile", locale],
  });
  const profile: TasteProfile | null = profileQuery.data ?? null;
  const backHere = trailFrom(t("taste.title"), "/profile");

  const money = (minor: number, currency: CurrencyCode) =>
    new Intl.NumberFormat(i18n.language, {
      currency,
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
      style: "currency",
    }).format(fromMinorUnits(minor, currency));
  const percent = (share: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0, style: "percent" }).format(
      share,
    );
  const list = (items: string[]) =>
    new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(items);

  /** A trait as the reader's language says it. */
  const nameOf = (trait: Named): string => {
    switch (trait.kind) {
      case "type":
        return i18n.exists(`quickLog.wineType.${trait.key}`)
          ? t(`quickLog.wineType.${trait.key}`)
          : trait.label;
      case "country":
        return (
          new Intl.DisplayNames([i18n.language], { type: "region" }).of(trait.key) ?? trait.key
        );
      case "descriptor":
        return descriptorText(trait.key, locale)?.label ?? trait.label;
      case "acidity":
      case "body":
      case "finish":
      case "sweetness":
      case "tannin":
        return t(`taste.level.${trait.kind}.${trait.key}`);
      case "price": {
        const [currency, band] = trait.key.split(":") as [CurrencyCode, string];
        const bounds: Record<string, [number | null, number | null]> = {
          "10_20": [1_000, 2_000],
          "20_40": [2_000, 4_000],
          "40_plus": [4_000, null],
          under_10: [null, 1_000],
        };
        const [low, high] = bounds[band] ?? [null, null];
        return t(`taste.price.${band}`, {
          high: high === null ? "" : money(high, currency),
          low: low === null ? "" : money(low, currency),
        });
      }
      default:
        return trait.label;
    }
  };
  /** The same, inside a sentence: wine types as the plural a sentence wants. */
  const inSentence = (trait: Named) =>
    trait.kind === "type" && i18n.exists(`taste.typePlural.${trait.key}`)
      ? t(`taste.typePlural.${trait.key}`)
      : nameOf(trait);
  const points = (value: number) =>
    new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 1,
      signDisplay: "always",
    }).format(value);

  const bio = (taste: TasteProfile): string[] => {
    const sentences: string[] = [];
    if (taste.likes.length > 0) {
      sentences.push(t("taste.bio.likes", { list: list(taste.likes.slice(0, 3).map(inSentence)) }));
    }
    if (taste.dislikes.length > 0) {
      sentences.push(
        t("taste.bio.dislikes", { list: list(taste.dislikes.slice(0, 2).map(inSentence)) }),
      );
    }
    const topType = taste.habits.mostTasted.find((entry) => entry.kind === "type");
    const topCountry = taste.habits.mostTasted.find((entry) => entry.kind === "country");
    if (topType !== undefined) {
      sentences.push(
        topCountry === undefined
          ? t("taste.bio.mostlyType", { share: percent(topType.share), type: inSentence(topType) })
          : t("taste.bio.mostly", {
              country: nameOf(topCountry),
              countryShare: percent(topCountry.share),
              share: percent(topType.share),
              type: inSentence(topType),
            }),
      );
    }
    const price = taste.habits.prices[0];
    if (price !== undefined) {
      sentences.push(t("taste.bio.price", { price: money(price.medianUnitMinor, price.currency) }));
    }
    const tension = taste.tensions[0];
    if (tension !== undefined)
      sentences.push(t("taste.bio.tension", { label: inSentence(tension) }));
    return sentences;
  };

  const traitList = (traits: TasteTrait[]) => (
    <ul className="taste-traits">
      {traits.map((trait) => (
        <li key={`${trait.kind}-${trait.key}`}>
          <div className="taste-traits__head">
            <strong>{nameOf(trait)}</strong>
            <span className="taste-traits__points" data-up={trait.pointsVersusAverage > 0}>
              {t("taste.points", {
                count: trait.notes,
                points: points(trait.pointsVersusAverage),
              })}
            </span>
          </div>
          <p className="section-help">
            {trait.wines.map((wine, index) => (
              <span key={wine.wineId}>
                {index === 0 ? "" : " · "}
                <WineLink state={backHere} wine={wine} />
              </span>
            ))}
          </p>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="library-page taste-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("taste.eyebrow")}</p>
          <h1>{t("taste.title")}</h1>
          <p>{t("taste.intro")}</p>
        </div>
      </header>

      {profile === null ? (
        <p role={profileQuery.isError ? "alert" : "status"}>
          {profileQuery.isError ? t("stats.error") : t("stats.loading")}
        </p>
      ) : profile.confidence === "insufficient" ? (
        <p className="settings-card">
          {t("taste.insufficient", { count: profile.sampleSize, minimum: profile.minimumNotes })}
        </p>
      ) : (
        <>
          <section aria-labelledby="taste-summary" className="settings-card taste-summary">
            <h2 id="taste-summary">{t("taste.summaryTitle")}</h2>
            <p>{bio(profile).join(" ")}</p>
            <WrittenBio />
            <p className="section-help">
              {t("taste.basis", {
                average:
                  profile.averageScore === null
                    ? "—"
                    : new Intl.NumberFormat(i18n.language).format(profile.averageScore),
                confidence: t(`assistant.confidence.${profile.confidence}`),
                count: profile.sampleSize,
              })}
            </p>
          </section>

          {profile.likes.length === 0 && profile.dislikes.length === 0 ? null : (
            <div className="taste-columns">
              {profile.likes.length === 0 ? null : (
                <section aria-labelledby="taste-likes" className="settings-card">
                  <h2 id="taste-likes">{t("taste.likesTitle")}</h2>
                  {traitList(profile.likes)}
                </section>
              )}
              {profile.dislikes.length === 0 ? null : (
                <section aria-labelledby="taste-dislikes" className="settings-card">
                  <h2 id="taste-dislikes">{t("taste.dislikesTitle")}</h2>
                  {traitList(profile.dislikes)}
                </section>
              )}
            </div>
          )}
          <p className="section-help">{t("taste.pointsNote")}</p>

          {profile.habits.mostTasted.length === 0 ? null : (
            <section aria-labelledby="taste-most" className="settings-card">
              <h2 id="taste-most">{t("taste.mostTastedTitle")}</h2>
              <ul className="library-chips">
                {profile.habits.mostTasted.map((entry) => (
                  <li key={`${entry.kind}-${entry.key}`}>
                    {nameOf(entry)} · {percent(entry.share)}
                  </li>
                ))}
              </ul>
              {profile.tensions.length === 0 ? null : (
                <p className="section-help">
                  {t("taste.tensions", {
                    count: profile.tensions.length,
                    list: list(profile.tensions.map(inSentence)),
                  })}
                </p>
              )}
            </section>
          )}

          {profile.inCellar.length === 0 ? null : (
            <section aria-labelledby="taste-cellar" className="settings-card">
              <h2 id="taste-cellar">{t("taste.cellarTitle")}</h2>
              <p className="section-help">{t("taste.cellarHint")}</p>
              <ul className="stats-list">
                {profile.inCellar.map((wine) => (
                  <li key={wine.wineId}>
                    <WineLink state={backHere} wine={wine} />
                    <span className="section-help"> · {list(wine.matches.map(nameOf))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {profile.habits.prices.length === 0 &&
          profile.habits.rebought.length === 0 &&
          profile.habits.boughtNotLiked.length === 0 ? null : (
            <section aria-labelledby="taste-buying" className="settings-card">
              <h2 id="taste-buying">{t("taste.buyingTitle")}</h2>
              {profile.habits.prices.map((price) => (
                <p key={price.currency}>
                  {t("taste.typicalPrice", {
                    count: price.purchases,
                    price: money(price.medianUnitMinor, price.currency),
                  })}
                </p>
              ))}
              {profile.habits.rebought.length === 0 ? null : (
                <>
                  <h3>{t("taste.rebought")}</h3>
                  <ul className="stats-list">
                    {profile.habits.rebought.map((wine) => (
                      <li key={wine.wineId}>
                        <WineLink state={backHere} wine={wine} /> · ×{wine.purchases}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {profile.habits.boughtNotLiked.length === 0 ? null : (
                <>
                  <h3>{t("taste.boughtNotLiked")}</h3>
                  <ul className="stats-list">
                    {profile.habits.boughtNotLiked.map((wine) => (
                      <li key={wine.wineId}>
                        <WineLink state={backHere} wine={wine} /> · {wine.score}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {profile.evolution === null ? null : (
            <section aria-labelledby="taste-evolution" className="settings-card">
              <h2 id="taste-evolution">{t("taste.evolutionTitle")}</h2>
              <p>
                {t("taste.evolutionLine", {
                  earlier: profile.evolution.earlierNotes,
                  earlierAverage: profile.evolution.earlierAverage ?? "—",
                  recent: profile.evolution.recentNotes,
                  recentAverage: profile.evolution.recentAverage ?? "—",
                })}
              </p>
              {profile.evolution.shifts.length === 0 ? null : (
                <ul className="stats-list">
                  {profile.evolution.shifts.map((shift) => (
                    <li key={`${shift.kind}-${shift.key}`}>
                      {t("taste.shift", {
                        from: percent(shift.earlierShare),
                        label: nameOf(shift),
                        to: percent(shift.recentShare),
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <DeclaredTaste />

      <p className="section-help taste-links">
        <Link className="text-link" to="/vicenc">
          {t("taste.askVicenc")}
        </Link>
        <Link className="text-link" to="/stats">
          {t("stats.title")}
        </Link>
      </p>
    </section>
  );
}

/**
 * The same facts told by Vicenç, on request: one call from the day's
 * allowance, kept only if every number in it is one of the reader's own.
 */
function WrittenBio() {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const { user } = useAuth();
  const [state, setState] = useState<
    | { kind: "idle" | "writing" | "error" }
    | {
        kind: "done";
        status: "insufficient" | "not_kept" | "unavailable" | "written";
        text: string | null;
      }
  >({ kind: "idle" });

  async function write() {
    if (user === null) return;
    setState({ kind: "writing" });
    try {
      const result = await writeTasteBio(user, locale);
      setState({ kind: "done", status: result.status, text: result.text });
    } catch {
      setState({ kind: "error" });
    }
  }

  if (state.kind === "done" && state.status === "written" && state.text !== null) {
    return (
      <blockquote className="taste-written">
        <p>{state.text}</p>
        <footer className="section-help">{t("taste.written.note")}</footer>
      </blockquote>
    );
  }
  return (
    <div className="taste-form__actions">
      <button
        className="action-link action-link--secondary"
        disabled={state.kind === "writing"}
        onClick={() => void write()}
        type="button"
      >
        {state.kind === "writing" ? t("taste.written.writing") : t("taste.written.action")}
      </button>
      {state.kind === "error" ? (
        <p role="alert">{t("taste.written.error")}</p>
      ) : state.kind === "done" ? (
        <p role="status">
          {t(`taste.written.${state.status === "written" ? "not_kept" : state.status}`)}
        </p>
      ) : null}
    </div>
  );
}

/** The reader's own words about their taste, saved over the version shown. */
function DeclaredTaste() {
  const { user } = useAuth();
  const query = useQuery({
    enabled: user !== null,
    queryFn: ({ signal }) => getTasteDeclaration(user!, signal),
    queryKey: ["taste-declaration"],
  });
  // Kept here, so "Saved" outlives the form starting afresh.
  const [status, setStatus] = useState<SaveStatus>("idle");
  // A new version — saved here, or found saved elsewhere — starts the form
  // afresh from it.
  return query.data === undefined ? null : (
    <DeclaredForm
      key={query.data.version}
      loaded={query.data}
      reload={() => void query.refetch()}
      setStatus={setStatus}
      status={status}
    />
  );
}

function formFrom(loaded: TasteDeclaration) {
  const major = (minor: number | null) =>
    minor === null || loaded.budget === null
      ? ""
      : String(fromMinorUnits(minor, loaded.budget.currency));
  return {
    currency: loaded.budget?.currency ?? ("EUR" as CurrencyCode),
    dislikes: loaded.dislikes ?? "",
    exploring: loaded.exploring ?? "",
    high: major(loaded.budget?.highMinor ?? null),
    likes: loaded.likes ?? "",
    low: major(loaded.budget?.lowMinor ?? null),
    note: loaded.note ?? "",
  };
}

type SaveStatus = "conflict" | "error" | "idle" | "saved" | "saving";

function DeclaredForm({
  loaded,
  reload,
  setStatus,
  status,
}: {
  loaded: TasteDeclaration;
  reload: () => void;
  setStatus: (status: SaveStatus) => void;
  status: SaveStatus;
}) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formFrom(loaded));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (user === null) return;
    setStatus("saving");
    const amount = (value: string) => {
      const parsed = Number.parseFloat(value.replace(",", "."));
      return value.trim() === "" || Number.isNaN(parsed)
        ? null
        : toMinorUnits(parsed, form.currency);
    };
    const low = amount(form.low);
    const high = amount(form.high);
    try {
      const result = await saveTasteDeclaration(user, {
        budget:
          low === null && high === null
            ? null
            : { currency: form.currency, highMinor: high, lowMinor: low },
        dislikes: form.dislikes.trim() || null,
        exploring: form.exploring.trim() || null,
        likes: form.likes.trim() || null,
        note: form.note.trim() || null,
        version: loaded.version,
      });
      if (result.kind === "conflict") {
        setStatus("conflict");
        reload();
      } else {
        queryClient.setQueryData(["taste-declaration"], result.declaration);
        // Vicenç and this page read it from now on.
        void queryClient.invalidateQueries({ queryKey: ["taste-profile"] });
        setStatus("saved");
      }
    } catch {
      setStatus("error");
    }
  }

  const field = (name: "dislikes" | "exploring" | "likes") => (
    <label className="taste-form__field">
      <span>{t(`taste.declared.${name}`)}</span>
      <textarea
        maxLength={500}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
        placeholder={t(`taste.declared.${name}Placeholder`)}
        rows={2}
        value={form[name]}
      />
    </label>
  );

  return (
    <section aria-labelledby="taste-declared" className="settings-card">
      <h2 id="taste-declared">{t("taste.declared.title")}</h2>
      <p className="section-help">{t("taste.declared.intro")}</p>
      <form className="taste-form" onSubmit={(event) => void save(event)}>
        {field("likes")}
        {field("dislikes")}
        {field("exploring")}
        <fieldset className="taste-form__budget">
          <legend>{t("taste.declared.budget")}</legend>
          <select
            aria-label={t("taste.declared.currency")}
            onChange={(event) => setForm({ ...form, currency: event.target.value as CurrencyCode })}
            value={form.currency}
          >
            {supportedCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          <label>
            <span>{t("taste.declared.from")}</span>
            <input
              inputMode="decimal"
              onChange={(event) => setForm({ ...form, low: event.target.value })}
              value={form.low}
            />
          </label>
          <label>
            <span>{t("taste.declared.to")}</span>
            <input
              inputMode="decimal"
              onChange={(event) => setForm({ ...form, high: event.target.value })}
              value={form.high}
            />
          </label>
        </fieldset>
        <label className="taste-form__field">
          <span>{t("taste.declared.note")}</span>
          <textarea
            maxLength={1_000}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            rows={3}
            value={form.note}
          />
        </label>
        <div className="taste-form__actions">
          <button
            className="action-link action-link--primary"
            disabled={status === "saving"}
            type="submit"
          >
            {status === "saving" ? t("taste.declared.saving") : t("taste.declared.save")}
          </button>
          {status === "saved" || status === "conflict" || status === "error" ? (
            <p role={status === "error" ? "alert" : "status"}>{t(`taste.declared.${status}`)}</p>
          ) : null}
        </div>
        {loaded.updatedAt === null ? null : (
          <p className="section-help">
            {t("taste.declared.updated", {
              date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
                new Date(loaded.updatedAt),
              ),
            })}
          </p>
        )}
      </form>
    </section>
  );
}
