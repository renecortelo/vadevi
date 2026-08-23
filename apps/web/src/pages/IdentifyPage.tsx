import type { IdentificationResponse } from "@vadevi/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import {
  openScannerStream,
  prepareDecoder,
  scanFrame,
  scanImageFile,
  stopStream,
} from "../media/barcode";
import { countryOptionsFor } from "../components/country-options";
import { confirmIdentification, identifyWine } from "../services/api";
import { useSession } from "../session/SessionContext";

type Candidate = IdentificationResponse["data"]["candidates"][number];

/** The wine fields a user can confirm or correct. */
type WineDraft = {
  countryCode: string;
  displayName: string;
  producerName: string;
  region: string;
  vintageYear: string;
  wineType: string;
};

const emptyDraft: WineDraft = {
  countryCode: "",
  displayName: "",
  producerName: "",
  region: "",
  vintageYear: "",
  wineType: "",
};

function draftFromCandidate(candidate: Candidate): WineDraft {
  const fields = candidate.fields;
  return {
    countryCode: fields.countryCode?.value ?? "",
    displayName: fields.displayName?.value ?? "",
    producerName: fields.producerName?.value ?? "",
    region: fields.region?.value ?? "",
    vintageYear: fields.vintageYear === undefined ? "" : String(fields.vintageYear.value),
    wineType: fields.wineType?.value ?? "",
  };
}

/**
 * Shows where a proposed value came from and how far to trust it. §21 rules out
 * a numeric match score, so this stays qualitative.
 */
function FieldProvenance({
  candidate,
  name,
}: {
  candidate: Candidate;
  name: keyof Candidate["fields"];
}) {
  const { t } = useTranslation();
  const field = candidate.fields[name];
  if (field === undefined) return null;
  return (
    <small className="field-provenance" data-confidence={field.confidence}>
      {t(`identify.confidence.${field.confidence}`)} · {t(`identify.evidence.${field.evidence}`)}
    </small>
  );
}

/**
 * Photo-assisted Quick Log entry (§5.1).
 *
 * The sequence is deliberate: a scan or a hint produces an expiring *proposal*,
 * the user reviews every field with its provenance, and only an explicit
 * confirmation creates a wine. Manual entry is always reachable, so the whole
 * screen works with every optional provider disabled.
 */
export function IdentifyPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const navigate = useNavigate();
  const spaceId = bootstrap.data.user.activeSpaceId;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftResponse, setDraftResponse] = useState<IdentificationResponse["data"] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wine, setWine] = useState<WineDraft>(emptyDraft);

  // Releasing the camera matters: an abandoned track keeps the recording
  // indicator lit even after the user navigates away.
  useEffect(() => () => stopStream(streamRef.current), []);

  // Fetch the decoder while the member is still reading the screen, so pressing
  // Scan does not begin with a wait. A browser with a native detector does
  // nothing here.
  useEffect(prepareDecoder, []);

  async function startScanning() {
    setScanNotice(null);
    const stream = await openScannerStream();
    if (stream === null) {
      setScanNotice(t("identify.cameraUnavailable"));
      return;
    }
    streamRef.current = stream;
    setScanning(true);
    if (videoRef.current !== null) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
    void pollForBarcode();
  }

  async function pollForBarcode() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const video = videoRef.current;
      if (video === null || streamRef.current === null) return;
      const outcome = await scanFrame(video);
      if (outcome.kind === "found") {
        stopScanning();
        await runIdentification({ barcode: outcome.barcode });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    stopScanning();
    setScanNotice(t("identify.scanTimeout"));
  }

  async function readPhotograph(file: File | undefined) {
    if (file === undefined) return;
    setScanNotice(null);
    setBusy(true);
    try {
      const outcome = await scanImageFile(file);
      if (outcome.kind === "found") {
        await runIdentification({ barcode: outcome.barcode });
        return;
      }
      setScanNotice(t("identify.photoNoBarcode"));
    } finally {
      setBusy(false);
    }
  }

  function stopScanning() {
    stopStream(streamRef.current);
    streamRef.current = null;
    setScanning(false);
  }

  async function runIdentification(input: { barcode?: string; manualHint?: string }) {
    if (user === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await identifyWine(user, spaceId, {
        locale: bootstrap.data.user.preferredLocale,
        ...input,
      });
      setDraftResponse(response.data);
      const first = response.data.candidates[0];
      setSelectedId(first?.candidateId ?? null);
      setWine(first === undefined ? emptyDraft : draftFromCandidate(first));
    } catch {
      setError(t("identify.identifyError"));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user === null || draftResponse === null) return;
    setBusy(true);
    setError(null);
    try {
      const wineId = await confirmIdentification(user, spaceId, draftResponse.id, {
        confirm: true,
        ...(selectedId === null ? {} : { candidateId: selectedId }),
        wine: {
          identityStatus: "confirmed",
          nonVintage: wine.vintageYear.length === 0,
          producerName: wine.producerName,
          displayName: wine.displayName,
          ...(wine.countryCode.length === 0 ? {} : { countryCode: wine.countryCode.toUpperCase() }),
          ...(wine.region.length === 0 ? {} : { region: wine.region }),
          ...(wine.vintageYear.length === 0
            ? {}
            : { vintageYear: Number.parseInt(wine.vintageYear, 10) }),
          ...(wine.wineType.length === 0 ? {} : { wineType: wine.wineType as "red" | "white" }),
        },
      });
      await navigate(`/wines/${wineId}/evidence`);
    } catch {
      setError(t("identify.confirmError"));
    } finally {
      setBusy(false);
    }
  }

  const candidates = draftResponse?.candidates ?? [];
  const selected =
    (candidates as Candidate[]).find((entry: Candidate) => entry.candidateId === selectedId) ??
    null;

  return (
    <section className="identify-page">
      <header className="page-heading">
        <p className="eyebrow">{t("identify.eyebrow")}</p>
        <h1>{t("identify.title")}</h1>
        <p>{t("identify.body")}</p>
      </header>

      <section aria-labelledby="scan-title" className="settings-card">
        <h2 id="scan-title">{t("identify.scanTitle")}</h2>
        <p>{t("identify.scanBody")}</p>
        <div className="hero__actions">
          {scanning ? (
            <button className="text-button" onClick={stopScanning} type="button">
              {t("identify.stopScan")}
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void startScanning()}
              type="button"
            >
              {t("identify.startScan")}
            </button>
          )}
          {/*
            One photograph, decoded on the device. It needs no live camera
            stream, so it works where a stream is refused, where the browser is
            older, and where a curved bottle will not hold focus long enough for
            a live scan to lock on.
          */}
          <label className="action-link action-link--secondary" htmlFor="identify-photo">
            {t("identify.photoAction")}
          </label>
          <input
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={busy}
            id="identify-photo"
            onChange={(event) => {
              void readPhotograph(event.target.files?.[0]);
              event.target.value = "";
            }}
            type="file"
          />
        </div>
        <video
          aria-label={t("identify.cameraLabel")}
          className="identify-video"
          hidden={!scanning}
          muted
          playsInline
          ref={videoRef}
        />
        {scanNotice === null ? null : (
          <p className="cache-note" role="status">
            {scanNotice}
          </p>
        )}

        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void runIdentification({ manualHint: hint });
          }}
        >
          <label htmlFor="identify-hint">{t("identify.hintLabel")}</label>
          <input
            id="identify-hint"
            onChange={(event) => setHint(event.target.value)}
            placeholder={t("identify.hintPlaceholder")}
            value={hint}
          />
          <button className="action-link action-link--secondary" disabled={busy} type="submit">
            {t("identify.searchAction")}
          </button>
        </form>
      </section>

      {draftResponse === null ? null : (
        <section aria-labelledby="candidates-title" className="settings-card">
          <h2 id="candidates-title">{t("identify.candidatesTitle")}</h2>
          {draftResponse.status === "manual_required" ? (
            <p className="cache-note">{t("identify.noCandidates")}</p>
          ) : (
            <ul className="member-list">
              {(candidates as Candidate[]).map((candidate: Candidate) => (
                <li key={candidate.candidateId}>
                  <label>
                    <input
                      checked={candidate.candidateId === selectedId}
                      name="candidate"
                      onChange={() => {
                        setSelectedId(candidate.candidateId);
                        setWine(draftFromCandidate(candidate));
                      }}
                      type="radio"
                    />
                    <span>
                      <strong>
                        {candidate.fields.producerName?.value ?? t("identify.unknownProducer")}
                      </strong>{" "}
                      {candidate.fields.displayName?.value ?? ""}
                      <small> · {t(`identify.origin.${candidate.origin}`)}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {(draftResponse.warnings as string[])
            // `no_candidates` is skipped: the line above already says it, in the
            // reader's own language, and saying it twice reads as a fault.
            .filter((warning: string) => warning !== "no_candidates")
            .map((warning: string) => (
              <p className="cache-note" key={warning}>
                {t(`identify.warning.${warning}`, { defaultValue: warning })}
              </p>
            ))}
        </section>
      )}

      {draftResponse === null ? null : (
        <form className="settings-card field-stack" onSubmit={(event) => void confirm(event)}>
          <h2>{t("identify.reviewTitle")}</h2>
          <p>{t("identify.reviewBody")}</p>

          <label htmlFor="wine-producer">{t("quickLog.producer")}</label>
          <input
            id="wine-producer"
            onChange={(event) => setWine({ ...wine, producerName: event.target.value })}
            required
            value={wine.producerName}
          />
          {selected === null ? null : <FieldProvenance candidate={selected} name="producerName" />}

          <label htmlFor="wine-name">{t("quickLog.wineName")}</label>
          <input
            id="wine-name"
            onChange={(event) => setWine({ ...wine, displayName: event.target.value })}
            required
            value={wine.displayName}
          />
          {selected === null ? null : <FieldProvenance candidate={selected} name="displayName" />}

          <label htmlFor="wine-vintage">{t("quickLog.vintage")}</label>
          <input
            id="wine-vintage"
            inputMode="numeric"
            onChange={(event) => setWine({ ...wine, vintageYear: event.target.value })}
            value={wine.vintageYear}
          />
          {selected === null ? null : <FieldProvenance candidate={selected} name="vintageYear" />}

          <label htmlFor="wine-region">{t("quickLog.region")}</label>
          <input
            id="wine-region"
            onChange={(event) => setWine({ ...wine, region: event.target.value })}
            value={wine.region}
          />
          {selected === null ? null : <FieldProvenance candidate={selected} name="region" />}

          <label htmlFor="wine-country">{t("memory.countryFilter")}</label>
          <select
            id="wine-country"
            onChange={(event) => setWine({ ...wine, countryCode: event.target.value })}
            value={wine.countryCode}
          >
            <option value="">{t("memory.countryAny")}</option>
            {countryOptionsFor(i18n.language, wine.countryCode).map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>

          <label htmlFor="wine-type">{t("quickLog.type")}</label>
          <select
            id="wine-type"
            onChange={(event) => setWine({ ...wine, wineType: event.target.value })}
            value={wine.wineType}
          >
            <option value="">{t("memory.allTypes")}</option>
            {(["red", "white", "rose", "sparkling", "fortified", "orange", "other"] as const).map(
              (type) => (
                <option key={type} value={type}>
                  {t(`quickLog.wineType.${type}`)}
                </option>
              ),
            )}
          </select>

          <div className="hero__actions">
            <button className="primary-button" disabled={busy} type="submit">
              {t("identify.confirmAction")}
            </button>
          </div>
          <p className="cache-note">{t("identify.expiryNote")}</p>
        </form>
      )}

      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
