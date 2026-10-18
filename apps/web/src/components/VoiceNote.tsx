import type { VoiceExtractResponse } from "@vadevi/contracts";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { VoiceIcon } from "../brand/NavIcons";
import { ApiError } from "../services/api";
import { extractVoice, sendVoiceReview, transcribeVoice } from "../services/voice";

type Proposal = VoiceExtractResponse["data"];
type Stage = "editing" | "filling" | "idle" | "recording" | "transcribing";
type Applied = { filled: string[]; suggestions: string[] };

/** Two minutes: enough for a full note, and what the API is sized for. */
const longest = 120_000;

/** The browser's own format: Chrome records webm/opus, Safari mp4/aac. */
function recorderType(): string | undefined {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (globalThis.MediaRecorder?.isTypeSupported?.(type) === true) return type;
  }
  return undefined;
}

const quotaSpent = (reason: unknown) => reason instanceof ApiError && reason.status === 429;

/**
 * Describe a wine aloud and the form fills itself: record, read and correct
 * what was heard, then let the app propose the fields — which fill only what
 * is still empty, and nothing is saved until the reader saves the form.
 * Whatever is already in the form is never lost, whatever fails.
 */
export function VoiceNote({
  hint = "voice.hint",
  kind,
  online,
  onProposal,
  snapshot,
  spaceId,
}: {
  /** What to say, for the form it fills (a catalog key). */
  hint?: string;
  /** Which form it fills, for a note sent for review. */
  kind: "deep" | "quick" | "wine";
  /** Both steps need the network; offline the form is filled by hand. */
  online: boolean;
  /** Fills the form; it may first look something up (the wine being added). */
  onProposal: (proposal: Proposal) => Applied | Promise<Applied>;
  /** The form as the reader has left it, for a note sent for review. */
  snapshot: () => Record<string, unknown>;
  spaceId: string;
}) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const locale = resolveSupportedLocale(i18n.language);
  const [stage, setStage] = useState<Stage>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    filled: string[];
    severalWines: boolean;
    suggestions: string[];
  } | null>(null);
  // The last proposal and the words it was read from, to send for review if
  // the reader chooses to; and how that went.
  const [proposed, setProposed] = useState<{ proposal: Proposal; text: string } | null>(null);
  const [review, setReview] = useState<"error" | "idle" | "limit" | "sending" | "sent">("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const fail = (key: string) => {
    setError(t(key));
    setStage(text === "" ? "idle" : "editing");
  };

  async function start() {
    setError(null);
    setResult(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("voice.errorMicrophone");
      return;
    }
    const type = recorderType();
    const next = new MediaRecorder(stream, type === undefined ? {} : { mimeType: type });
    const chunks: Blob[] = [];
    next.ondataavailable = (event) => chunks.push(event.data);
    next.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (recorder.current !== next) return; // cancelled
      recorder.current = null;
      const audio = new Blob(chunks, { type: next.mimeType });
      if (user === null || audio.size === 0) {
        fail("voice.errorService");
        return;
      }
      setStage("transcribing");
      transcribeVoice(user, spaceId, audio, locale)
        .then((heard) => {
          setText(heard);
          setStage("editing");
        })
        .catch((reason: unknown) =>
          fail(quotaSpent(reason) ? "voice.errorQuota" : "voice.errorService"),
        );
    };
    recorder.current = next;
    next.start();
    setStage("recording");
    timer.current = window.setTimeout(() => next.stop(), longest);
  }

  function stop() {
    recorder.current?.stop();
  }

  function cancel() {
    const current = recorder.current;
    recorder.current = null;
    current?.stop();
    setStage(text === "" ? "idle" : "editing");
  }

  async function fill() {
    if (user === null || text.trim() === "") return;
    setStage("filling");
    setError(null);
    try {
      const proposal = await extractVoice(
        user,
        spaceId,
        text,
        locale,
        new Date().toLocaleDateString("sv"),
      );
      const applied = await onProposal(proposal);
      setProposed({ proposal, text });
      setReview("idle");
      setResult({ ...applied, severalWines: proposal.severalWines });
      setStage("editing");
    } catch (reason) {
      fail(quotaSpent(reason) ? "voice.errorQuota" : "voice.errorService");
    }
  }

  /** The note as heard, as proposed and as the form now stands: kept 30 days. */
  async function sendForReview() {
    if (user === null || proposed === null) return;
    setReview("sending");
    try {
      await sendVoiceReview(user, spaceId, {
        form: snapshot(),
        kind,
        locale,
        proposal: proposed.proposal,
        text: proposed.text,
      });
      setReview("sent");
    } catch (reason) {
      setReview(quotaSpent(reason) ? "limit" : "error");
    }
  }

  return (
    <section aria-labelledby="voice-note-title" className="voice-note settings-card">
      <h2 id="voice-note-title">
        <VoiceIcon /> {t("voice.title")}
      </h2>
      <p className="section-help">{t(hint)}</p>
      <p className="section-help">{t("voice.privacy")}</p>
      <div className="voice-note__actions">
        {stage === "recording" ? (
          <>
            <button className="primary-button" onClick={stop} type="button">
              {t("voice.stop")}
            </button>
            <button className="secondary-button" onClick={cancel} type="button">
              {t("voice.cancel")}
            </button>
          </>
        ) : (
          <button
            className="secondary-button"
            disabled={!online || stage === "transcribing" || stage === "filling"}
            onClick={() => void start()}
            type="button"
          >
            {text === "" ? t("voice.record") : t("voice.again")}
          </button>
        )}
      </div>
      <p aria-live="polite" className="section-help" role="status">
        {stage === "recording"
          ? t("voice.recording")
          : stage === "transcribing"
            ? t("voice.transcribing")
            : stage === "filling"
              ? t("voice.filling")
              : ""}
      </p>
      {online ? null : <p className="section-help">{t("voice.offline")}</p>}
      {error === null ? null : <p role="alert">{error}</p>}
      {stage === "editing" || stage === "filling" || (text !== "" && stage !== "recording") ? (
        <>
          <label htmlFor="voice-note-text">{t("voice.transcript")}</label>
          <textarea
            id="voice-note-text"
            onChange={(event) => setText(event.target.value)}
            rows={5}
            value={text}
          />
          <button
            className="primary-button"
            disabled={!online || stage === "filling" || text.trim() === ""}
            onClick={() => void fill()}
            type="button"
          >
            {t("voice.fill")}
          </button>
        </>
      ) : null}
      {result === null ? null : (
        <div className="section-help" role="status">
          <p>{t("voice.filled", { count: result.filled.length })}</p>
          {result.suggestions.length === 0 ? null : (
            <p>{t("voice.suggestions", { fields: result.suggestions.join(", ") })}</p>
          )}
          {result.severalWines ? <p>{t("voice.severalWines")}</p> : null}
        </div>
      )}
      {proposed === null ? null : (
        <div className="voice-note__review">
          <p className="section-help">{t("voice.reviewHint")}</p>
          <button
            className="secondary-button"
            disabled={!online || review === "sending" || review === "sent"}
            onClick={() => void sendForReview()}
            type="button"
          >
            {t("voice.reviewSend")}
          </button>
          <p aria-live="polite" className="section-help" role="status">
            {review === "sent"
              ? t("voice.reviewSent")
              : review === "limit"
                ? t("voice.reviewLimit")
                : review === "error"
                  ? t("voice.reviewError")
                  : ""}
          </p>
        </div>
      )}
    </section>
  );
}
