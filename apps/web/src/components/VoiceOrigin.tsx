import { useTranslation } from "react-i18next";

import { VoiceIcon } from "../brand/NavIcons";

/**
 * The quiet mark of a tasting first recorded by voice: a small microphone,
 * named for screen readers and on hover. Only where it came from — never a
 * warning, a pending review or a judgement of the note.
 */
export function VoiceOrigin({ creationMethod }: { creationMethod: string }) {
  const { t } = useTranslation();
  if (creationMethod !== "audio") return null;
  return (
    <span className="voice-origin" title={t("tasting.voiceOrigin")}>
      <VoiceIcon />
      <span className="sr-only">{t("tasting.voiceOrigin")}</span>
    </span>
  );
}
