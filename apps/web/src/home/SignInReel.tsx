import { aromaFromTerm } from "@vadevi/i18n/runtime";
import figures from "virtual:library-figures";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  bottleRow,
  bottleRowPaths,
  lockupWordmark,
  wordmarkBox,
  wordmarkShapes,
} from "../brand/marks";
import { AromaIcon } from "../library/AromaIcon";

/**
 * What Va de Vi is for, in under twenty seconds, at the top of the sign-in card,
 * told with the logo's own bottles: it opens on the word, and with each
 * step — a tasting, a label, the library, Vicenç, your cellar on the map,
 * your taste — one small bottle drops into its place in a row until all seven
 * are there; then the bottles stretch up and the row grows into the logo,
 * the letters falling into place across it, just above «Continue with
 * Google», and the logo stays a while before it begins again.
 *
 * The bottles and the letters are the brand's geometry (`brand/marks`, made
 * by `scripts/generate-brand.ts`), not drawings of them. Drawn in SVG and CSS,
 * so it is sharp, light, offline and in every language; the library's figures
 * are counted from its files at build. Every animation, CSS or Web Animations,
 * is paused and played together through `getAnimations` — a moving loop must
 * be possible to stop. With reduced motion the reel is its last frame, still.
 */
const shots = [
  { end: 1.4, start: 0 },
  { end: 3.4, start: 1.4 },
  { end: 5.4, start: 3.4 },
  { end: 7.4, start: 5.4 },
  { end: 9.4, start: 7.4 },
  { end: 11.4, start: 9.4 },
  { end: 13.4, start: 11.4 },
  { end: 19.8, start: 13.4 },
] as const;

/** The length of one pass: the logo stays, whole, before it begins again. */
const loopSeconds = 19.8;

const timing = (shot: number): CSSProperties =>
  ({
    "--end": `${shots[shot]!.end - 0.45}s`,
    "--start": `${shots[shot]!.start}s`,
  }) as CSSProperties;

/** The lockup's frame: the bottles' row, with room for the word across it. */
const lockupBox = `${bottleRow.start - 24} 150 ${bottleRow.span + 48} 574`;
/** The bottles the row receives, in the order the shots bring them: all seven. */
const arrivals = [3, 0, 1, 2, 4, 5, 6] as const;
/**
 * How each bottle grows into the logo, by its place in it: how far it
 * stretches past its height, and how long after the others it starts — so
 * they grow unevenly, not as one block.
 */
const growth = [
  { lag: 0.12, stretch: 1.45 },
  { lag: 0, stretch: 1.18 },
  { lag: 0.22, stretch: 1.6 },
  { lag: 0.06, stretch: 1.3 },
  { lag: 0.28, stretch: 1.52 },
  { lag: 0.1, stretch: 1.12 },
  { lag: 0.18, stretch: 1.38 },
] as const;

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
      duration: 1000,
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
              <Count delay={shots[3].start + 0.3 + index * 0.15} value={item.value} />
            )}
          </strong>
          <span>{t(`reel.${item.key}Unit`, { count: item.value })}</span>
        </li>
      ))}
    </ul>
  );
}

/** The word `vadevi`, its letters falling into place one after the other. */
function Letters() {
  return wordmarkShapes.map((shape, index) => (
    <g className="reel-letter" key={shape.d} style={{ "--i": index } as CSSProperties}>
      {shape.stroke === undefined ? (
        <path d={shape.d} fill="currentColor" />
      ) : (
        <path d={shape.d} fill="none" stroke="currentColor" strokeWidth={shape.stroke} />
      )}
    </g>
  ));
}

/** The logo, whole and still: the last frame, for reduced motion. */
function Lockup() {
  const scale = lockupWordmark.width / wordmarkBox.width;
  return (
    <svg aria-hidden="true" className="reel-lockup" focusable="false" viewBox={lockupBox}>
      {bottleRowPaths.map((path, index) => (
        <path
          className="reel-lockup__bottle"
          d={path}
          fill={`var(--color-bottle-${index + 1})`}
          key={path}
        />
      ))}
      <g
        transform={
          `translate(${lockupWordmark.centre - lockupWordmark.width / 2} ${lockupWordmark.baseline}) ` +
          `scale(${scale}) translate(0 ${-(wordmarkBox.top + wordmarkBox.height)})`
        }
      >
        <Letters />
      </g>
    </svg>
  );
}

/** Your cellar on the map: pins falling where your bottles come from. */
function CellarMap() {
  const pins = [
    { x: 32, y: 30 },
    { x: 58, y: 44 },
    { x: 80, y: 24 },
    { x: 96, y: 48 },
  ];
  return (
    <svg aria-hidden="true" className="reel-map" focusable="false" viewBox="0 0 128 72">
      <path
        className="reel-map__land"
        d="M10 40c4-16 20-26 38-24s24-10 42-8 30 14 28 30-18 26-36 24-24 6-42 2S6 56 10 40z"
      />
      {pins.map((pin, index) => (
        <g
          className="reel-map__pin"
          key={pin.x}
          style={{ "--i": index, "--bottle": `var(--color-bottle-${index + 2})` } as CSSProperties}
          transform={`translate(${pin.x} ${pin.y})`}
        >
          <path d="M0 0c-5-7-8-10-8-14a8 8 0 0 1 16 0c0 4-3 7-8 14z" />
          <circle cy="-14" r="3" />
        </g>
      ))}
    </svg>
  );
}

/** Your taste, drawn: bars rising to what you score highest. */
function TasteBars() {
  const heights = [55, 85, 40, 70, 30];
  return (
    <div aria-hidden="true" className="reel-profile">
      {heights.map((height, index) => (
        <i
          key={index}
          style={
            {
              "--h": `${height}%`,
              "--i": index,
              "--bottle": `var(--color-bottle-${index + 1})`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** A pause or a play sign, for the reel's one control. */
function PlayPause({ playing }: { playing: boolean }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      {playing ? <path d="M8 6h3v12H8zM13 6h3v12h-3z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
    </svg>
  );
}

const aromas = ["raspberry", "black pepper", "violet"]
  .map((term) => aromaFromTerm(term))
  .filter((descriptor) => descriptor !== null);

export default function SignInReel() {
  const { i18n, t } = useTranslation();
  const format = new Intl.NumberFormat(i18n.language);
  const stage = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [still] = useState(
    () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );

  // The loop: an invisible animation as long as one pass is its clock, so
  // pausing the reel pauses the loop too; when it ends, the stage is drawn
  // again from the start.
  useEffect(() => {
    const element = stage.current;
    if (element === null || still) return;
    const clock = element.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: loopSeconds * 1000,
    });
    clock.onfinish = () => setRun((count) => count + 1);
    return () => clock.cancel();
  }, [run, still]);

  // Pause and play every animation of the reel, CSS and scripted, together.
  useEffect(() => {
    for (const animation of stage.current?.getAnimations({ subtree: true }) ?? []) {
      if (playing) animation.play();
      else animation.pause();
    }
  }, [playing, run]);

  return (
    <section aria-label={t("reel.label")} className={`reel${still ? " reel--still" : ""}`}>
      <div className="reel__stage" key={run} ref={stage}>
        <div className="reel-shot reel-shot--intro" style={timing(0)}>
          <svg
            aria-hidden="true"
            className="reel-word"
            focusable="false"
            viewBox={`0 ${wordmarkBox.top} ${wordmarkBox.width} ${wordmarkBox.height}`}
          >
            <Letters />
          </svg>
        </div>

        <div className="reel-shot" style={timing(1)}>
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

        <div className="reel-shot" style={timing(2)}>
          <p className="reel-card__step">02</p>
          <p className="reel-card__title">{t("reel.identify")}</p>
          <div className="reel-label" aria-hidden="true">
            <span className="reel-label__lines" />
            <span className="reel-label__code" />
            <span className="reel-label__scan" />
          </div>
        </div>

        <div className="reel-shot" style={timing(3)}>
          <p className="reel-card__step">03</p>
          <p className="reel-card__title">{t("reel.library")}</p>
          <Figures still={still} />
        </div>

        <div className="reel-shot" style={timing(4)}>
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

        <div className="reel-shot" style={timing(5)}>
          <p className="reel-card__step">05</p>
          <p className="reel-card__title">{t("reel.cellar")}</p>
          <CellarMap />
        </div>

        <div className="reel-shot" style={timing(6)}>
          <p className="reel-card__step">06</p>
          <p className="reel-card__title">{t("reel.profile")}</p>
          <TasteBars />
        </div>

        {/* The row the bottles gather in, each in its place in the logo; at
            the close the bottles stretch up and the row grows into the logo,
            the word falling into place across it. */}
        <svg aria-hidden="true" className="reel__row" focusable="false" viewBox={lockupBox}>
          {arrivals.map((index, order) => (
            <path
              className="reel__slot"
              d={bottleRowPaths[index]}
              fill={`var(--color-bottle-${index + 1})`}
              key={index}
              style={
                {
                  "--at": `${shots[order]!.end - 0.4}s`,
                  "--lag": `${growth[index]!.lag}s`,
                  "--stretch": growth[index]!.stretch,
                } as CSSProperties
              }
            />
          ))}
          <g
            className="reel__word"
            style={{ "--drop": "0.8s", "--start": `${shots[7].start}s` } as CSSProperties}
            transform={
              `translate(${lockupWordmark.centre - lockupWordmark.width / 2} ${lockupWordmark.baseline}) ` +
              `scale(${lockupWordmark.width / wordmarkBox.width}) ` +
              `translate(0 ${-(wordmarkBox.top + wordmarkBox.height)})`
            }
          >
            <Letters />
          </g>
        </svg>

        <div className="reel-shot reel-shot--close" style={timing(7)}>
          {still ? <Lockup /> : null}
          <p className="reel__closing">{t("reel.close")}</p>
          {still ? <Figures still /> : null}
        </div>
      </div>
      {/* Outside the stage, which is drawn again on every pass, so the
          button keeps its focus. */}
      {still ? null : (
        <button
          aria-label={playing ? t("reel.pause") : t("reel.play")}
          aria-pressed={!playing}
          className="reel__toggle"
          onClick={() => setPlaying((value) => !value)}
          title={playing ? t("reel.pause") : t("reel.play")}
          type="button"
        >
          <PlayPause playing={playing} />
        </button>
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
