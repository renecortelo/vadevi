import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { MapPoint } from "./PointsMap";

/**
 * A real, pannable map — when the deployment serves tiles.
 *
 * Leaflet draws OpenStreetMap tiles, but every tile is requested from THIS
 * origin: the Worker proxies them (`/api/v1/map-tiles/z/x/y`), so the map draws
 * under the app's `default-src 'self'` policy without the browser ever touching
 * a tile host — the same arrangement as bottle photos. Markers are drawn as SVG
 * circles rather than image pins, so nothing here needs an external asset
 * either; clicking one opens a popup that links to the wine.
 *
 * Where tiles are not enabled the caller falls back to the schematic PointsMap,
 * so this component is only ever mounted with a real background behind it.
 */
export function TileMap({ points }: { points: MapPoint[] }) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);

  useEffect(() => {
    if (container.current === null || map.current !== null) return;
    const instance = L.map(container.current, { scrollWheelZoom: false });
    L.tileLayer("/api/v1/map-tiles/{z}/{x}/{y}", {
      // OSM's licence requires attribution wherever its tiles are shown.
      attribution: t("memory.mapTilesAttribution"),
      maxZoom: 19,
    }).addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
  }, [t]);

  // Redraw the markers whenever the points change, fitting the view to them.
  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;
    const layer = L.layerGroup().addTo(instance);
    const bounds: L.LatLngExpression[] = [];
    for (const point of points) {
      bounds.push([point.latitude, point.longitude]);
      L.circleMarker([point.latitude, point.longitude], {
        color: "#ffffff",
        fillColor: "#8b1116",
        fillOpacity: 0.9,
        radius: 8,
        weight: 2,
      })
        .bindPopup(
          `<strong>${escapeHtml(point.title)}</strong><br>${escapeHtml(point.subtitle)}` +
            `<br><a href="/wines/${encodeURIComponent(point.wineId)}/evidence">${escapeHtml(
              t("evidence.openAction"),
            )}</a>`,
        )
        .addTo(layer);
    }
    if (bounds.length > 0) {
      instance.fitBounds(L.latLngBounds(bounds), { maxZoom: 12, padding: [32, 32] });
    } else {
      instance.setView([20, 0], 2);
    }
    return () => {
      layer.remove();
    };
  }, [points, t]);

  return (
    <div aria-label={t("memory.mapLabel")} className="tile-map" ref={container} role="group" />
  );
}

/** Popups take an HTML string, so any point text is escaped before it goes in. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
