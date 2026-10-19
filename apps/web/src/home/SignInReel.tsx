import { aromaFromTerm } from "@vadevi/i18n/runtime";
import figures from "virtual:library-figures";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AromaIcon } from "../library/AromaIcon";

/**
 * What Va de Vi is for, in nineteen seconds, on the sign-in screen: four
 * numbered cards that slide in along a dotted line — a tasting, a label, the
 * library, Vicenç — then all of them in a row and «Empieza».
 *
 * Drawn in CSS, so it is sharp, light, offline and in every language; the
 * library's figures are counted from its files at build. Every animation,
 * CSS or Web Animations, is paused and played together through
 * `getAnimations`. With reduced motion the reel is its last frame, still.
 */
const shots = [
  { end: 2.5, start: 0 },
  { end: 5.5, start: 2.5 },
  { end: 8.5, start: 5.5 },
  { end: 12, start: 8.5 },
  { end: 15.5, start: 12 },
  { end: 19, start: 15.5 },
] as const;

const timing = (shot: number): CSSProperties =>
  ({
    "--end": `${shots[shot]!.end - 0.45}s`,
    "--start": `${shots[shot]!.start}s`,
  }) as CSSProperties;

/** A figure that counts up to the library's own, on the reel's clock. */
function Count({ delay, value }: { delay: number; value: number }) {
  const { i18n } = useTranslation();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const format = new Intl.NumberFormat(i18n.language);
    // An invisible animation on the element is the clock: paused with the
    // others, its progress is how far the figure has counted.
    const clock = element.animate([{ opacity: 1 }, { opacity: 1 }], {
      delay: delay * 1000,
      duration: 1600,
      easing: "cubic-bezier(.2,.7,.2,1)",
      fill: "both",
    });
    let frame = 0;
    const tick = () => {
      const progress = clock.effect?.getComputedTiming().progress ?? 0;
      element.textContent = format.format(Math.round((progress ?? 0) * value));
      if (clock.playState !== "finished") frame = requestAnimationFrame(tick);
      else element.textContent = format.format(value);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clock.cancel();
    };
  }, [delay, i18n.language, value]);
  return <span ref={ref}>{new Intl.NumberFormat(i18n.language).format(0)}</span>;
}

function Figures({ still }: { still: boolean }) {
  const { i18n, t } = useTranslation();
  const format = new Intl.NumberFormat(i18n.language);
  const items = [
    { key: "names", value: figures.names },
    { key: "grapes", value: figures.grapes },
    { key: "countries", value: figures.countries },
  ] as const;
  return (
    <ul aria-hidden="true" className="reel-figures">
      {items.map((item, index) => (
        <li key={item.key}>
          <strong>
            {still ? (
              format.format(item.value)
            ) : (
              <Count delay={8.9 + index * 0.25} value={item.value} />
            )}
          </strong>
          <span>{t(`reel.${item.key}Unit`, { count: item.value })}</span>
        </li>
      ))}
    </ul>
  );
}

const aromas = ["raspberry", "black pepper", "violet"]
  .map((term) => aromaFromTerm(term))
  .filter((descriptor) => descriptor !== null);

export default function SignInReel({ onStart }: { onStart: () => void }) {
  const { i18n, t } = useTranslation();
  const format = new Intl.NumberFormat(i18n.language);
  const stage = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [still] = useState(
    () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );

  // Pause and play every animation of the reel, CSS and scripted, together.
  useEffect(() => {
    for (const animation of stage.current?.getAnimations({ subtree: true }) ?? []) {
      if (playing) animation.play();
      else animation.pause();
    }
  }, [playing, run]);

  const replay = () => {
    setRun((count) => count + 1);
    setPlaying(true);
  };

  return (
    <section aria-label={t("reel.label")} className={`reel${still ? " reel--still" : ""}`}>
      <div className="reel__stage" key={run} ref={stage}>
        <div className="reel__line" aria-hidden="true">
          <i className="reel__dot" />
        </div>

        <div className="reel-shot reel-shot--intro" style={timing(0)}>
          <p className="reel__brand">Va de Vi</p>
          <p className="reel__tagline">{t("reel.tagline")}</p>
        </div>

        <div className="reel-shot reel-card" style={timing(1)}>
          <p className="reel-card__step">01</p>
          <p className="reel-card__title">{t("reel.taste")}</p>
          <div className="reel-taste" aria-hidden="true">
            <ul>
              {aromas.map((descriptor, index) => (
                <li key={descriptor.code} style={{ "--i": index } as CSSProperties}>
                  <AromaIcon descriptor={descriptor} />
                </li>
              ))}
            </ul>
            <span className="reel-taste__bar">
              <i />
            </span>
            <svg className="reel-taste__mic" viewBox="0 0 48 48">
              <path d="M24 8a6 6 0 0 1 6 6v10a6 6 0 0 1-12 0V14a6 6 0 0 1 6-6z" />
              <path d="M14 24a10 10 0 0 0 20 0M24 34v6M18 40h12" />
            </svg>
          </div>
        </div>

        <div className="reel-shot reel-card" style={timing(2)}>
          <p className="reel-card__step">02</p>
          <p className="reel-card__title">{t("reel.identify")}</p>
          <div className="reel-label" aria-hidden="true">
            <span className="reel-label__lines" />
            <span className="reel-label__code" />
            <span className="reel-label__scan" />
          </div>
        </div>

        <div className="reel-shot reel-card" style={timing(3)}>
          <p className="reel-card__step">03</p>
          <p className="reel-card__title">{t("reel.library")}</p>
          <Figures still={still} />
        </div>

        <div className="reel-shot reel-card" style={timing(4)}>
          <p className="reel-card__step">04</p>
          <p className="reel-card__title">{t("reel.vicenc")}</p>
          <div className="reel-chat" aria-hidden="true">
            <p className="reel-chat__question">{t("reel.vicencQuestion")}</p>
            <p className="reel-chat__answer">
              <span>{t("reel.vicencAnswer")}</span>
              <span className="reel-chat__source">Wikipedia</span>
            </p>
          </div>
        </div>

        <div className="reel-shot reel-shot--close" style={timing(5)}>
          <p className="reel__closing">{t("reel.close")}</p>
          <p className="reel__sub">{t("reel.closeSub", { count: figures.languages })}</p>
          {still ? <Figures still /> : null}
          <button className="primary-button reel__cta" onClick={onStart} type="button">
            {t("reel.cta")}
          </button>
        </div>
      </div>
      {still ? null : (
        <p className="reel__controls">
          <button
            aria-pressed={!playing}
            className="text-button"
            onClick={() => setPlaying((value) => !value)}
            type="button"
          >
            {playing ? t("reel.pause") : t("reel.play")}
          </button>
          <button className="text-button" onClick={replay} type="button">
            {t("reel.replay")}
          </button>
        </p>
      )}
      <p className="sr-only">
        {t("reel.summary", {
          countries: format.format(figures.countries),
          grapes: format.format(figures.grapes),
          languages: format.format(figures.languages),
          names: format.format(figures.names),
        })}
      </p>
    </section>
  );
}
