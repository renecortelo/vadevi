import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

export type Box = Readonly<{ h: number; w: number; x: number; y: number }>;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * A map that comes closer and moves: the wheel and a pinch zoom where they
 * point, a drag moves the map, and buttons do the same for a keyboard. It
 * opens on `initial` (the points, a country) and can go out to the whole of
 * `base` (the sheet), never past it, nor closer than `maxZoom` of it. Until
 * the map is moved, one finger still scrolls the page — a map is not a trap —
 * and a drag is never taken for a touch on what lies under it.
 */
export function useZoomPan(base: Box, initial: Box = base, maxZoom = 40) {
  const [view, setView] = useState<Box>(initial);
  const baseKey = `${base.x} ${base.y} ${base.w} ${base.h} ${initial.x} ${initial.y} ${initial.w} ${initial.h}`;
  const [shownBase, setShownBase] = useState(baseKey);
  if (shownBase !== baseKey) {
    setShownBase(baseKey);
    setView(initial);
  }
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(0);

  const fit = useCallback(
    (next: Box): Box => {
      const w = clamp(next.w, base.w / maxZoom, base.w);
      const h = (w / next.w) * next.h;
      return {
        h,
        w,
        x: clamp(next.x, base.x, base.x + base.w - w),
        y: clamp(next.y, base.y, base.y + base.h - h),
      };
    },
    [base.h, base.w, base.x, base.y, maxZoom],
  );

  /** A point on the screen, in the map's own units. */
  const toMap = useCallback((clientX: number, clientY: number, current: Box) => {
    const rect = svg.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) {
      return { x: current.x + current.w / 2, y: current.y + current.h / 2 };
    }
    return {
      x: current.x + ((clientX - rect.left) / rect.width) * current.w,
      y: current.y + ((clientY - rect.top) / rect.height) * current.h,
    };
  }, []);

  const zoomAt = useCallback(
    (factor: number, at?: { x: number; y: number }) =>
      setView((current) => {
        const centre = at ?? { x: current.x + current.w / 2, y: current.y + current.h / 2 };
        const w = current.w / factor;
        const h = current.h / factor;
        return fit({
          h,
          w,
          x: centre.x - ((centre.x - current.x) / current.w) * w,
          y: centre.y - ((centre.y - current.y) / current.h) * h,
        });
      }),
    [fit],
  );

  // The wheel needs a listener that may cancel the page's scroll.
  useEffect(() => {
    const element = svg.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((current) => {
        const at = toMap(event.clientX, event.clientY, current);
        const factor = Math.exp(-event.deltaY / 400);
        const w = current.w / factor;
        const h = current.h / factor;
        return fit({
          h,
          w,
          x: at.x - ((at.x - current.x) / current.w) * w,
          y: at.y - ((at.y - current.y) / current.h) * h,
        });
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [fit, toMap]);

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) dragged.current = 0;
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const before = pointers.current.get(event.pointerId);
    if (before === undefined) return;
    const after = { x: event.clientX, y: event.clientY };
    const others = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId);
    pointers.current.set(event.pointerId, after);
    dragged.current += Math.hypot(after.x - before.x, after.y - before.y);
    if (dragged.current > 4 && !svg.current?.hasPointerCapture(event.pointerId)) {
      svg.current?.setPointerCapture(event.pointerId);
    }
    const other = others[0]?.[1];
    setView((current) => {
      const rect = svg.current?.getBoundingClientRect();
      if (rect === undefined || rect.width === 0) return current;
      if (other !== undefined) {
        // Two fingers: the distance between them is the zoom.
        const was = Math.hypot(before.x - other.x, before.y - other.y);
        const now = Math.hypot(after.x - other.x, after.y - other.y);
        if (was === 0) return current;
        const factor = now / was;
        const at = toMap((after.x + other.x) / 2, (after.y + other.y) / 2, current);
        const w = current.w / factor;
        const h = current.h / factor;
        return fit({
          h,
          w,
          x: at.x - ((at.x - current.x) / current.w) * w,
          y: at.y - ((at.y - current.y) / current.h) * h,
        });
      }
      const dx = ((after.x - before.x) / rect.width) * current.w;
      const dy = ((after.y - before.y) / rect.height) * current.h;
      return fit({ ...current, x: current.x - dx, y: current.y - dy });
    });
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
  };
  /** A click that ends a drag is not a touch on what lies under it. */
  const onClickCapture = (event: { preventDefault(): void; stopPropagation(): void }) => {
    if (dragged.current > 4) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const moved =
    Math.abs(view.w - initial.w) > initial.w * 0.001 ||
    Math.abs(view.x - initial.x) > initial.w * 0.001 ||
    Math.abs(view.y - initial.y) > initial.h * 0.001;
  const zoomed = moved || view.w < base.w * 0.999;
  return {
    /** Whether there is further out to go. */
    canZoomOut: view.w < base.w * 0.999,
    /** Whether the reader has moved it from where it opened. */
    moved,
    reset: () => setView(initial),
    /** Map units in one screen pixel, to keep points a finger's size. */
    unitsPerPixel: () => view.w / Math.max(1, svg.current?.getBoundingClientRect().width ?? 300),
    svgProps: {
      onClickCapture,
      onPointerCancel: onPointerUp,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      ref: svg,
      style: { cursor: zoomed ? "grab" : undefined, touchAction: moved ? "none" : "pan-y" },
      viewBox: [view.x, view.y, view.w, view.h].map((value) => value.toFixed(2)).join(" "),
    },
    /** How far in: 1 at the whole sheet. */
    scale: base.w / view.w,
    view,
    zoomIn: () => zoomAt(1.6),
    zoomOut: () => zoomAt(1 / 1.6),
    /** Frame a box (a country), with some land around it. */
    zoomTo: (box: Box) => {
      const pad = Math.max(box.w, box.h) * 0.15;
      const w = Math.max(box.w + pad * 2, (box.h + pad * 2) * (base.w / base.h));
      const h = w * (base.h / base.w);
      setView(fit({ h, w, x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2 }));
    },
    zoomed,
  };
}
