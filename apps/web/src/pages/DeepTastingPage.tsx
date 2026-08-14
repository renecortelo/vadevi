import { DeepTastingNoteSchema, type DeepTastingRequest } from "@vadevi/contracts";
import type { TastingContextSchema, TastingDescriptorInputSchema } from "@vadevi/contracts";
import {
  resolveSupportedLocale,
  tastingDescriptors,
  type TastingPhase,
} from "@vadevi/i18n/runtime";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import type { z } from "zod";

import { useAuth } from "../auth/AuthContext";
import { type DeepTastingDraft, offlineDatabase, type SyncConflict } from "../offline/database";
import { deepTastingChangedEvent } from "../offline/events";
import { useOfflineSync } from "../offline/OfflineSyncContext";
import { deepDraftId, deepNoteToRequest, queueDeepTasting } from "../offline/phase3";
import { createUlid } from "../security/ulid";
import { getDeepTastingNote } from "../services/api";
import { useSession } from "../session/SessionContext";

type TastingContext = z.infer<typeof TastingContextSchema>;
type Descriptor = z.infer<typeof TastingDescriptorInputSchema>;
type Step = "appearance" | "nose" | "palate" | "context" | "conclusion";

const steps: Step[] = ["appearance", "nose", "palate", "context", "conclusion"];

function localDateTime(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function newDraft(options: {
  noteId: string;
  sessionId: string | null;
  sessionWineId: string | null;
  spaceId: string;
  userId: string;
  wineId: string;
}): DeepTastingDraft {
  const now = new Date().toISOString();
  return {
    id: deepDraftId(options.userId, options.spaceId, options.wineId, options.sessionWineId),
    note: null,
    noteId: options.noteId,
    payload: {
      clientId: options.noteId,
      descriptors: [],
      mode: "deep",
      sessionWineId: options.sessionWineId,
      state: "draft",
      tastedAt: now,
      wineId: options.wineId,
    },
    sessionId: options.sessionId,
    spaceId: options.spaceId,
    updatedAt: now,
    userId: options.userId,
  };
}

function ScaleField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number | undefined) => void;
  value: number | undefined;
}) {
  const { t } = useTranslation();
  return (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
        value={value ?? ""}
      >
        <option value="">{t("tasting.notSet")}</option>
        {[1, 2, 3, 4, 5].map((scale) => (
          <option key={scale} value={scale}>
            {scale} · {t(`tasting.scale.${scale}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DescriptorPicker({
  descriptors,
  locale,
  onChange,
  phase,
}: {
  descriptors: Descriptor[];
  locale: ReturnType<typeof resolveSupportedLocale>;
  onChange: (descriptors: Descriptor[]) => void;
  phase: TastingPhase;
}) {
  const { t } = useTranslation();
  const choices = tastingDescriptors.filter((descriptor) => descriptor.phase === phase);
  return (
    <fieldset className="descriptor-fieldset">
      <legend>{t("tasting.descriptors")}</legend>
      <p>{t("tasting.descriptorHelp")}</p>
      <div className="descriptor-grid descriptor-grid--detailed">
        {choices.map((descriptor) => {
          const selected = descriptors.find((entry) => entry.code === descriptor.code);
          const text = descriptor.text[locale];
          return (
            <div className="descriptor-choice" key={descriptor.code}>
              <label className="descriptor-chip">
                <input
                  checked={selected !== undefined}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...descriptors, { code: descriptor.code, phase }]
                        : descriptors.filter((entry) => entry.code !== descriptor.code),
                    )
                  }
                  type="checkbox"
                />
                <span>{text.label}</span>
              </label>
              <small>{text.help}</small>
              {selected === undefined ? null : (
                <select
                  aria-label={t("tasting.descriptorIntensity", { descriptor: text.label })}
                  onChange={(event) => {
                    const intensity =
                      event.target.value === "" ? undefined : Number(event.target.value);
                    onChange(
                      descriptors.map((entry) => {
                        if (entry.code !== descriptor.code) return entry;
                        const next = { code: entry.code, phase: entry.phase } as Descriptor;
                        if (intensity !== undefined) Object.assign(next, { intensity });
                        return next;
                      }),
                    );
                  }}
                  value={selected.intensity ?? ""}
                >
                  <option value="">{t("tasting.intensityOptional")}</option>
                  {[1, 2, 3, 4, 5].map((scale) => (
                    <option key={scale} value={scale}>
                      {scale}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function DeepTastingPage() {
  const { i18n, t } = useTranslation();
  const { wineId = "" } = useParams();
  const [searchParameters] = useSearchParams();
  const sessionId = searchParameters.get("sessionId");
  const sessionWineId = searchParameters.get("sessionWineId");
  const existingNoteId = searchParameters.get("noteId");
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const { flush, refreshStatus, status } = useOfflineSync();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const userId = user?.uid ?? "";
  const locale = resolveSupportedLocale(i18n.language);
  const [draft, setDraft] = useState<DeepTastingDraft>(() =>
    newDraft({
      noteId: existingNoteId ?? createUlid(),
      sessionId,
      sessionWineId,
      spaceId,
      userId,
      wineId,
    }),
  );
  const [step, setStep] = useState<Step>("appearance");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const [wineLabel, setWineLabel] = useState("");

  const draftId = deepDraftId(userId, spaceId, wineId, sessionWineId);
  const loadLocal = useCallback(async () => {
    const stored = await offlineDatabase.deepDrafts.get(draftId);
    const [conflicts, wineSnapshot] = await Promise.all([
      offlineDatabase.conflicts
        .where("[userId+spaceId]")
        .equals([userId, spaceId])
        .filter(
          (candidate) =>
            candidate.resourceType === "deep_tasting_note" &&
            candidate.resourceId === (existingNoteId ?? stored?.noteId),
        )
        .first(),
      offlineDatabase.snapshots
        .where("[userId+spaceId]")
        .equals([userId, spaceId])
        .filter((snapshot) => snapshot.wine.id === wineId)
        .first(),
    ]);
    if (stored !== undefined) setDraft(stored);
    setConflict(conflicts ?? null);
    if (wineSnapshot !== undefined) {
      setWineLabel(`${wineSnapshot.wine.producerName} · ${wineSnapshot.wine.displayName}`);
    }
    setReady(true);
  }, [draftId, existingNoteId, spaceId, userId, wineId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadLocal();
      if (!active || user === null || existingNoteId === null || !navigator.onLine) {
        return;
      }
      try {
        const note = await getDeepTastingNote(user, spaceId, existingNoteId);
        if (!active) return;
        const next: DeepTastingDraft = {
          id: draftId,
          note,
          noteId: note.id,
          payload: { ...deepNoteToRequest(note), clientId: note.id },
          sessionId,
          spaceId,
          updatedAt: new Date().toISOString(),
          userId: user.uid,
        };
        await offlineDatabase.deepDrafts.put(next);
        setDraft(next);
      } catch {
        // The device copy remains authoritative until the user can reconnect.
      }
    })();
    return () => {
      active = false;
    };
  }, [draftId, existingNoteId, loadLocal, sessionId, spaceId, user]);

  useEffect(() => {
    if (!ready || saved) return;
    const timeout = globalThis.setTimeout(() => {
      void offlineDatabase.deepDrafts.put({
        ...draft,
        id: draftId,
        updatedAt: new Date().toISOString(),
      });
    }, 350);
    return () => globalThis.clearTimeout(timeout);
  }, [draft, draftId, ready, saved]);

  useEffect(() => {
    const changed = (event: Event) => {
      const eventSpace = (event as CustomEvent<{ spaceId: string }>).detail.spaceId;
      if (eventSpace === spaceId) void loadLocal();
    };
    globalThis.addEventListener(deepTastingChangedEvent, changed);
    return () => globalThis.removeEventListener(deepTastingChangedEvent, changed);
  }, [loadLocal, spaceId]);

  function update<Key extends keyof DeepTastingRequest>(
    key: Key,
    value: DeepTastingRequest[Key] | undefined,
  ) {
    setSaved(false);
    setDraft((current) => {
      const payload = { ...current.payload };
      if (value === undefined) delete payload[key];
      else Object.assign(payload, { [key]: value });
      return { ...current, payload };
    });
  }

  function updateContext<Key extends keyof TastingContext>(
    key: Key,
    value: TastingContext[Key] | undefined,
  ) {
    const context = { ...(draft.payload.context ?? {}) };
    if (value === undefined) delete context[key];
    else Object.assign(context, { [key]: value });
    update("context", context);
  }

  function phaseDescriptors(phase: TastingPhase) {
    return draft.payload.descriptors.filter((descriptor: Descriptor) => descriptor.phase === phase);
  }

  function updateDescriptors(phase: TastingPhase, descriptors: Descriptor[]) {
    update("descriptors", [
      ...draft.payload.descriptors.filter((descriptor: Descriptor) => descriptor.phase !== phase),
      ...descriptors,
    ]);
  }

  async function save(submit: boolean) {
    setError(false);
    try {
      const next = {
        ...draft,
        payload: {
          ...draft.payload,
          state: submit ? "submitted" : "draft",
        },
      } satisfies DeepTastingDraft;
      setDraft(next);
      await queueDeepTasting(next, submit);
      setSaved(true);
      await refreshStatus();
      if (navigator.onLine) void flush(spaceId);
    } catch {
      setError(true);
    }
  }

  async function chooseServerVersion() {
    if (conflict === null) return;
    const parsed = DeepTastingNoteSchema.safeParse(conflict.serverPayload);
    if (!parsed.success) {
      setError(true);
      return;
    }
    const note = parsed.data;
    const next: DeepTastingDraft = {
      ...draft,
      note,
      noteId: note.id,
      payload: { ...deepNoteToRequest(note), clientId: note.id },
      updatedAt: new Date().toISOString(),
    };
    await offlineDatabase.transaction(
      "rw",
      offlineDatabase.conflicts,
      offlineDatabase.deepDrafts,
      offlineDatabase.mutations,
      async () => {
        await offlineDatabase.conflicts.delete(conflict.id);
        await offlineDatabase.mutations.delete(conflict.id);
        await offlineDatabase.deepDrafts.put(next);
      },
    );
    setDraft(next);
    setConflict(null);
    await refreshStatus();
  }

  async function chooseLocalVersion() {
    if (conflict === null) return;
    const parsed = DeepTastingNoteSchema.safeParse(conflict.serverPayload);
    if (!parsed.success) {
      setError(true);
      return;
    }
    const server = parsed.data;
    const mutation = await offlineDatabase.mutations.get(conflict.id);
    if (mutation === undefined) return;
    await offlineDatabase.transaction(
      "rw",
      offlineDatabase.conflicts,
      offlineDatabase.deepDrafts,
      offlineDatabase.mutations,
      async () => {
        await offlineDatabase.conflicts.delete(conflict.id);
        await offlineDatabase.mutations.put({
          ...mutation,
          baseVersion: server.version,
          state: "queued",
        });
        await offlineDatabase.deepDrafts.put({ ...draft, note: server });
      },
    );
    setDraft((current) => ({ ...current, note: server }));
    setConflict(null);
    await refreshStatus();
    if (navigator.onLine) void flush(spaceId);
  }

  const section: Record<Step, ReactNode> = {
    appearance: (
      <fieldset className="form-section tasting-section">
        <legend>{t("tasting.step.appearance")}</legend>
        <p className="section-help">{t("tasting.help.appearance")}</p>
        <div className="form-grid">
          <label>
            <span>{t("tasting.field.clarity")}</span>
            <select
              onChange={(event) =>
                update(
                  "appearanceClarity",
                  (event.target.value || undefined) as
                    DeepTastingRequest["appearanceClarity"] | undefined,
                )
              }
              value={draft.payload.appearanceClarity ?? ""}
            >
              <option value="">{t("tasting.notSet")}</option>
              <option value="clear">{t("tasting.value.clear")}</option>
              <option value="hazy">{t("tasting.value.hazy")}</option>
            </select>
          </label>
          <label>
            <span>{t("tasting.field.colorFamily")}</span>
            <select
              onChange={(event) =>
                update(
                  "appearanceColorFamily",
                  (event.target.value || undefined) as
                    DeepTastingRequest["appearanceColorFamily"] | undefined,
                )
              }
              value={draft.payload.appearanceColorFamily ?? ""}
            >
              <option value="">{t("tasting.notSet")}</option>
              {(["white", "rose", "red", "orange", "brown"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`tasting.value.${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <span>{t("tasting.field.hue")}</span>
          <input
            maxLength={80}
            onChange={(event) => update("appearanceHue", event.target.value || undefined)}
            value={draft.payload.appearanceHue ?? ""}
          />
        </label>
        <div className="form-grid form-grid--three">
          <ScaleField
            label={t("tasting.field.intensity")}
            onChange={(value) => update("appearanceIntensity", value)}
            value={draft.payload.appearanceIntensity}
          />
          <ScaleField
            label={t("tasting.field.rimEvolution")}
            onChange={(value) => update("rimEvolution", value)}
            value={draft.payload.rimEvolution}
          />
          <ScaleField
            label={t("tasting.field.viscosity")}
            onChange={(value) => update("viscosity", value)}
            value={draft.payload.viscosity}
          />
        </div>
        <DescriptorPicker
          descriptors={phaseDescriptors("appearance")}
          locale={locale}
          onChange={(value) => updateDescriptors("appearance", value)}
          phase="appearance"
        />
        <label>
          <span>{t("tasting.field.appearanceText")}</span>
          <textarea
            maxLength={2000}
            onChange={(event) => update("appearanceText", event.target.value || undefined)}
            value={draft.payload.appearanceText ?? ""}
          />
        </label>
      </fieldset>
    ),
    nose: (
      <fieldset className="form-section tasting-section">
        <legend>{t("tasting.step.nose")}</legend>
        <p className="section-help">{t("tasting.help.nose")}</p>
        <label>
          <span>{t("tasting.field.noseCondition")}</span>
          <select
            onChange={(event) =>
              update(
                "noseCondition",
                (event.target.value || undefined) as
                  DeepTastingRequest["noseCondition"] | undefined,
              )
            }
            value={draft.payload.noseCondition ?? ""}
          >
            <option value="">{t("tasting.notSet")}</option>
            <option value="clean">{t("tasting.value.clean")}</option>
            <option value="possible_fault">{t("tasting.value.possible_fault")}</option>
          </select>
        </label>
        <div className="form-grid form-grid--three">
          <ScaleField
            label={t("tasting.field.intensity")}
            onChange={(value) => update("noseIntensity", value)}
            value={draft.payload.noseIntensity}
          />
          <ScaleField
            label={t("tasting.field.freshness")}
            onChange={(value) => update("noseFreshness", value)}
            value={draft.payload.noseFreshness}
          />
          <ScaleField
            label={t("tasting.field.development")}
            onChange={(value) => update("noseDevelopment", value)}
            value={draft.payload.noseDevelopment}
          />
        </div>
        <DescriptorPicker
          descriptors={phaseDescriptors("nose")}
          locale={locale}
          onChange={(value) => updateDescriptors("nose", value)}
          phase="nose"
        />
        <label>
          <span>{t("tasting.field.noseText")}</span>
          <textarea
            maxLength={2000}
            onChange={(event) => update("noseText", event.target.value || undefined)}
            value={draft.payload.noseText ?? ""}
          />
        </label>
      </fieldset>
    ),
    palate: (
      <fieldset className="form-section tasting-section">
        <legend>{t("tasting.step.palate")}</legend>
        <p className="section-help">{t("tasting.help.palate")}</p>
        <div className="scale-grid">
          {(
            [
              ["sweetness", "sweetness"],
              ["acidity", "acidity"],
              ["tanninLevel", "tannin"],
              ["alcoholPerception", "alcohol"],
              ["body", "body"],
              ["flavorIntensity", "flavorIntensity"],
              ["finishLength", "finish"],
              ["balance", "balance"],
              ["complexity", "complexity"],
            ] as const
          ).map(([field, label]) => (
            <ScaleField
              key={field}
              label={t(`tasting.field.${label}`)}
              onChange={(value) => update(field, value)}
              value={draft.payload[field]}
            />
          ))}
        </div>
        <div className="form-grid">
          <label>
            <span>{t("tasting.field.tanninTexture")}</span>
            <select
              onChange={(event) =>
                update(
                  "tanninTexture",
                  (event.target.value || undefined) as
                    DeepTastingRequest["tanninTexture"] | undefined,
                )
              }
              value={draft.payload.tanninTexture ?? ""}
            >
              <option value="">{t("tasting.notSet")}</option>
              {(["silky", "fine", "grippy", "coarse"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`tasting.value.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("tasting.field.palateTexture")}</span>
            <select
              onChange={(event) =>
                update(
                  "palateTexture",
                  (event.target.value || undefined) as
                    DeepTastingRequest["palateTexture"] | undefined,
                )
              }
              value={draft.payload.palateTexture ?? ""}
            >
              <option value="">{t("tasting.notSet")}</option>
              {(["lean", "round", "creamy", "oily", "other"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`tasting.value.${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DescriptorPicker
          descriptors={phaseDescriptors("palate")}
          locale={locale}
          onChange={(value) => updateDescriptors("palate", value)}
          phase="palate"
        />
        <label>
          <span>{t("tasting.field.palateText")}</span>
          <textarea
            maxLength={2000}
            onChange={(event) => update("palateText", event.target.value || undefined)}
            value={draft.payload.palateText ?? ""}
          />
        </label>
      </fieldset>
    ),
    context: (
      <fieldset className="form-section tasting-section">
        <legend>{t("tasting.step.context")}</legend>
        <p className="section-help">{t("tasting.help.context")}</p>
        <div className="form-grid">
          <label>
            <span>{t("tasting.field.servingTemperature")}</span>
            <input
              max={50}
              min={-10}
              onChange={(event) =>
                updateContext(
                  "servingTemperatureTenthsC",
                  event.target.value === ""
                    ? undefined
                    : Math.round(Number(event.target.value) * 10),
                )
              }
              step="0.1"
              type="number"
              value={
                draft.payload.context?.servingTemperatureTenthsC === undefined
                  ? ""
                  : draft.payload.context.servingTemperatureTenthsC / 10
              }
            />
          </label>
          <label>
            <span>{t("tasting.field.openedState")}</span>
            <select
              onChange={(event) =>
                updateContext(
                  "openedState",
                  (event.target.value || undefined) as TastingContext["openedState"],
                )
              }
              value={draft.payload.context?.openedState ?? ""}
            >
              <option value="">{t("tasting.notSet")}</option>
              {(["just_opened", "open", "preserved", "unknown"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`tasting.value.${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid form-grid--three">
          <label>
            <span>{t("tasting.field.minutesOpen")}</span>
            <input
              min={0}
              onChange={(event) =>
                updateContext(
                  "minutesOpen",
                  event.target.value === "" ? undefined : Number(event.target.value),
                )
              }
              type="number"
              value={draft.payload.context?.minutesOpen ?? ""}
            />
          </label>
          <label className="check-row">
            <input
              checked={draft.payload.context?.decanted ?? false}
              onChange={(event) => updateContext("decanted", event.target.checked)}
              type="checkbox"
            />
            <span>{t("tasting.field.decanted")}</span>
          </label>
          <label>
            <span>{t("tasting.field.aerationMinutes")}</span>
            <input
              min={0}
              onChange={(event) =>
                updateContext(
                  "aerationMinutes",
                  event.target.value === "" ? undefined : Number(event.target.value),
                )
              }
              type="number"
              value={draft.payload.context?.aerationMinutes ?? ""}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            <span>{t("tasting.field.preservationMethod")}</span>
            <input
              maxLength={160}
              onChange={(event) =>
                updateContext("preservationMethod", event.target.value || undefined)
              }
              value={draft.payload.context?.preservationMethod ?? ""}
            />
          </label>
          <label>
            <span>{t("tasting.field.bottleCondition")}</span>
            <input
              maxLength={160}
              onChange={(event) =>
                updateContext("bottleCondition", event.target.value || undefined)
              }
              value={draft.payload.context?.bottleCondition ?? ""}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            <span>{t("tasting.field.glass")}</span>
            <select
              onChange={(event) =>
                updateContext("glass", (event.target.value || undefined) as TastingContext["glass"])
              }
              value={draft.payload.context?.glass ?? ""}
            >
              <option value="">{t("tasting.notSet")}</option>
              {(
                [
                  "tulip",
                  "bordeaux",
                  "burgundy",
                  "flute",
                  "small_wine",
                  "tumbler",
                  "restaurant_generic",
                  "other",
                ] as const
              ).map((value) => (
                <option key={value} value={value}>
                  {t(`tasting.value.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("tasting.field.environment")}</span>
            <select
              onChange={(event) =>
                updateContext(
                  "environment",
                  (event.target.value || undefined) as TastingContext["environment"],
                )
              }
              value={draft.payload.context?.environment ?? ""}
            >
              <option value="">{t("tasting.notSet")}</option>
              {(
                [
                  "home",
                  "restaurant",
                  "bar",
                  "winery",
                  "class",
                  "event",
                  "outdoors",
                  "other",
                ] as const
              ).map((value) => (
                <option key={value} value={value}>
                  {t(`tasting.value.${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid form-grid--three">
          <label>
            <span>{t("tasting.field.roomTemperature")}</span>
            <input
              max={60}
              min={-10}
              onChange={(event) =>
                updateContext(
                  "roomTemperatureTenthsC",
                  event.target.value === ""
                    ? undefined
                    : Math.round(Number(event.target.value) * 10),
                )
              }
              step="0.1"
              type="number"
              value={
                draft.payload.context?.roomTemperatureTenthsC === undefined
                  ? ""
                  : draft.payload.context.roomTemperatureTenthsC / 10
              }
            />
          </label>
          <ScaleField
            label={t("tasting.field.light")}
            onChange={(value) => updateContext("lightLevel", value)}
            value={draft.payload.context?.lightLevel}
          />
          <ScaleField
            label={t("tasting.field.noise")}
            onChange={(value) => updateContext("noiseLevel", value)}
            value={draft.payload.context?.noiseLevel}
          />
          <ScaleField
            label={t("tasting.field.ambientSmell")}
            onChange={(value) => updateContext("ambientSmellLevel", value)}
            value={draft.payload.context?.ambientSmellLevel}
          />
        </div>
        <div className="form-grid">
          <label>
            <span>{t("tasting.field.food")}</span>
            <input
              maxLength={500}
              onChange={(event) => updateContext("foodText", event.target.value || undefined)}
              value={draft.payload.context?.foodText ?? ""}
            />
          </label>
          <label>
            <span>{t("tasting.field.palateCleanser")}</span>
            <input
              maxLength={160}
              onChange={(event) => updateContext("palateCleanser", event.target.value || undefined)}
              value={draft.payload.context?.palateCleanser ?? ""}
            />
          </label>
        </div>
      </fieldset>
    ),
    conclusion: (
      <fieldset className="form-section tasting-section">
        <legend>{t("tasting.step.conclusion")}</legend>
        <p className="section-help">{t("tasting.help.conclusion")}</p>
        <div className="form-grid">
          <label>
            <span>{t("quickLog.tastedAt")}</span>
            <input
              onChange={(event) => update("tastedAt", new Date(event.target.value).toISOString())}
              type="datetime-local"
              value={localDateTime(draft.payload.tastedAt)}
            />
          </label>
          <label>
            <span>{t("quickLog.score")}</span>
            <input
              max={100}
              min={0}
              onChange={(event) =>
                update(
                  "score100",
                  event.target.value === "" ? undefined : Number(event.target.value),
                )
              }
              type="number"
              value={draft.payload.score100 ?? ""}
            />
          </label>
        </div>
        <div className="form-grid form-grid--three">
          <label>
            <span>{t("quickLog.sentiment")}</span>
            <select
              onChange={(event) =>
                update(
                  "sentiment",
                  (event.target.value || undefined) as DeepTastingRequest["sentiment"],
                )
              }
              value={draft.payload.sentiment ?? ""}
            >
              <option value="">{t("tasting.notSet")}</option>
              {(["dislike", "neutral", "like"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`quickLog.sentimentValue.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {(["wouldDrinkAgain", "wouldBuy"] as const).map((field) => (
            <label key={field}>
              <span>{t(field === "wouldBuy" ? "quickLog.buyAgain" : "quickLog.drinkAgain")}</span>
              <select
                onChange={(event) =>
                  update(
                    field,
                    (event.target.value || undefined) as DeepTastingRequest[typeof field],
                  )
                }
                value={draft.payload[field] ?? ""}
              >
                <option value="">{t("tasting.notSet")}</option>
                {(["yes", "no", "unsure"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`commonChoice.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="scale-grid">
          {(
            [
              ["perceivedValue", "perceivedValue"],
              ["pairingSuccess", "pairingSuccess"],
              ["tastingConfidence", "confidence"],
            ] as const
          ).map(([field, label]) => (
            <ScaleField
              key={field}
              label={t(`tasting.field.${label}`)}
              onChange={(value) => update(field, value)}
              value={draft.payload[field]}
            />
          ))}
        </div>
        <label>
          <span>{t("tasting.field.expectation")}</span>
          <select
            onChange={(event) =>
              update(
                "expectationResult",
                (event.target.value || undefined) as DeepTastingRequest["expectationResult"],
              )
            }
            value={draft.payload.expectationResult ?? ""}
          >
            <option value="">{t("tasting.notSet")}</option>
            {(["below", "met", "above", "unknown"] as const).map((value) => (
              <option key={value} value={value}>
                {t(`tasting.value.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input
            checked={draft.payload.memorable ?? false}
            onChange={(event) => update("memorable", event.target.checked)}
            type="checkbox"
          />
          <span>{t("tasting.field.memorable")}</span>
        </label>
        <label>
          <span>{t("tasting.field.conclusionText")}</span>
          <textarea
            maxLength={2000}
            onChange={(event) => update("conclusionText", event.target.value || undefined)}
            value={draft.payload.conclusionText ?? ""}
          />
        </label>
      </fieldset>
    ),
  };

  const stepIndex = steps.indexOf(step);
  const backPath = sessionId === null ? "/memory" : `/sessions/${sessionId}`;
  const parsedServerConflict = DeepTastingNoteSchema.safeParse(conflict?.serverPayload);
  const serverConflictConclusion = parsedServerConflict.success
    ? parsedServerConflict.data.conclusionText
    : undefined;
  return (
    <section className="tasting-page">
      <header className="page-heading tasting-heading">
        <div>
          <p className="eyebrow">{t("tasting.eyebrow")}</p>
          <h1>{t("tasting.title")}</h1>
          <p>{wineLabel || t("tasting.wineFallback")}</p>
        </div>
        <Link className="text-link" to={backPath}>
          {t("tasting.backAction")}
        </Link>
      </header>

      <nav aria-label={t("tasting.progressLabel")} className="tasting-progress">
        {steps.map((item, index) => (
          <button
            aria-current={item === step ? "step" : undefined}
            className={item === step ? "tasting-progress__active" : ""}
            key={item}
            onClick={() => setStep(item)}
            type="button"
          >
            <span>{index + 1}</span>
            {t(`tasting.step.${item}`)}
          </button>
        ))}
      </nav>

      {conflict === null ? null : (
        <section className="attention-panel" role="alert">
          <h2>{t("tasting.conflictTitle")}</h2>
          <p>{t("tasting.conflictBody")}</p>
          <div className="conflict-text-grid">
            <div>
              <h3>{t("memory.localVersion")}</h3>
              <p>{draft.payload.conclusionText || t("tasting.noConclusion")}</p>
            </div>
            <div>
              <h3>{t("memory.serverVersion")}</h3>
              <p>{serverConflictConclusion || t("tasting.noConclusion")}</p>
            </div>
          </div>
          <div className="hero__actions">
            <button
              className="primary-button"
              onClick={() => void chooseLocalVersion()}
              type="button"
            >
              {t("tasting.keepLocal")}
            </button>
            <button
              className="action-link action-link--secondary"
              onClick={() => void chooseServerVersion()}
              type="button"
            >
              {t("memory.keepServer")}
            </button>
          </div>
        </section>
      )}

      {section[step]}

      <footer className="tasting-actions">
        <p className="local-save-state" role="status">
          {saved ? t(`sync.${status}`) : t("tasting.autosave")}
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {t("tasting.saveError")}
          </p>
        ) : null}
        <div className="hero__actions tasting-actions__buttons">
          <button
            className="action-link action-link--secondary"
            disabled={stepIndex === 0}
            onClick={() => setStep(steps[stepIndex - 1] ?? "appearance")}
            type="button"
          >
            {t("tasting.previousAction")}
          </button>
          <button className="text-button" onClick={() => void save(false)} type="button">
            {t("tasting.saveDraftAction")}
          </button>
          {stepIndex === steps.length - 1 ? (
            <button className="primary-button" onClick={() => void save(true)} type="button">
              {t("tasting.submitAction")}
            </button>
          ) : (
            <button
              className="primary-button"
              onClick={() => setStep(steps[stepIndex + 1] ?? "conclusion")}
              type="button"
            >
              {t("tasting.nextAction")}
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
