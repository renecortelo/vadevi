import africa from "./africa-map.json";
import america from "./america-map.json";
import europe from "./europe-map.json";
import oceania from "./oceania-map.json";
import southAmerica from "./south-america-map.json";

export type MapData = {
  boxes: Record<string, [number, number, number, number]>;
  countries: Record<string, string>;
  frame: { latMax: number; latMin: number; lonMax: number; lonMin: number };
  height: number;
  scale: number;
  squeeze: number;
  width: number;
};

export type SheetId = "africa" | "america" | "europe" | "oceania" | "southAmerica";

/**
 * The map's sheets, drawn from Natural Earth's outlines (public domain) and
 * shipped with the app. Europe's first: a country drawn on two is shown among
 * its neighbours there.
 */
export const mapSheets = [
  { data: europe, id: "europe" },
  { data: america, id: "america" },
  { data: southAmerica, id: "southAmerica" },
  { data: oceania, id: "oceania" },
  { data: africa, id: "africa" },
] as unknown as { data: MapData; id: SheetId }[];
