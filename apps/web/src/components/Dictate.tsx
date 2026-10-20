import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { VoiceIcon } from "../brand/NavIcons";
import { ApiError } from "../services/api";
import { transcribeVoice } from "../services/voice";
import { useSession } from "../session/SessionContext";
import { appendSaid } from "../voice/append";

type Stage = "idle" | "recording" | "transcribing";

/** Two minutes, as a spoken note: what the API is sized for. */
const longest = 120_000;

/** The browser's own format: Chrome records webm/opus, Safari mp4/aac. */
function recorderType(): string | undefined {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (globalThis.MediaRecorder?.isTypeSupported?.(type) === true) return type;
  }
  return undefined;
}

/**
 * A free-text field with a microphone: tap, say the note, tap again, and what
 * was heard is written after what is already there, as it was said — nothing
 * is read into other fields, nothing is interpreted, and the audio is not
 * kept. Shown only where voice is switched on and the reader is in a Space;
 * it counts against the same daily voice allowance as a spoken note.
 */
export function Dictate({
  children,
  label,
  limit = 2_000,
  onChange,
  value,
}: {
  /** The field itself. */
  children: ReactNode;
  /** The field's name, for the microphone's own label. */
  label: string;
  limit?: number;
  onChange: (value: string) => void;
  value: string;
}) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const locale = resolveSupportedLocale(i18n.language);
  const spaceId = bootstrap.data.user.activeSpaceId;
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  // The field as it stands when the words arrive, typed meanwhile included.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      const current = recorder.current;
      recorder.current = null;
      current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const enabled = bootstrap.data.features.voiceInput && spaceId !== null && user !== null;
  if (!enabled) return <>{children}</>;

  const fail = (key: string) => {
    setError(t(key));
    setStage("idle");
  };

  async function start() {
    setError(null);
    if (!navigator.onLine) {
      fail("voice.offline");
      return;
    }
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
      if (recorder.current !== next) return;
      recorder.current = null;
      const audio = new Blob(chunks, { type: next.mimeType });
      if (user === null || spaceId === null || audio.size === 0) {
        fail("voice.errorService");
        return;
      }
      setStage("transcribing");
      transcribeVoice(user, spaceId, audio, locale)
        .then((heard) => {
          onChange(appendSaid(latest.current, heard, limit));
          setStage("idle");
        })
        .catch((reason: unknown) =>
          fail(
            reason instanceof ApiError && reason.status === 429
              ? "voice.errorQuota"
              : "voice.errorService",
          ),
        );
    };
    recorder.current = next;
    next.start();
    setStage("recording");
    timer.current = window.setTimeout(() => next.stop(), longest);
  }

  return (
    <div className="dictate">
      {children}
      <div className="dictate__bar">
        <span aria-live="polite" className="dictate__status" role="status">
          {stage === "recording"
            ? t("voice.dictating")
            : stage === "transcribing"
              ? t("voice.transcribing")
              : (error ?? "")}
        </span>
        <button
          aria-label={
            stage === "recording"
              ? t("voice.dictateStop", { field: label })
              : t("voice.dictate", { field: label })
          }
          aria-pressed={stage === "recording"}
          className={`dictate__button${stage === "recording" ? " dictate__button--on" : ""}`}
          disabled={stage === "transcribing"}
          onClick={() => (stage === "recording" ? recorder.current?.stop() : void start())}
          title={
            stage === "recording"
              ? t("voice.dictateStop", { field: label })
              : t("voice.dictate", { field: label })
          }
          type="button"
        >
          {stage === "recording" ? (
            <svg aria-hidden="true" className="nav-icon" focusable="false" viewBox="0 0 24 24">
              <rect fill="currentColor" height="9" rx="1.5" width="9" x="7.5" y="7.5" />
            </svg>
          ) : (
            <VoiceIcon />
          )}
        </button>
      </div>
    </div>
  );
}
