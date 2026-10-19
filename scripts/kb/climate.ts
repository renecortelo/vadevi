/**
 * A registered name's climate, worked out from the monthly means at its point
 * on the map (CHELSA V2.1, 1981–2010; `data/kb/region-climate.json`): its
 * Köppen–Geiger class, its yearly rain and mean temperature, and the heat of
 * the vine's growing season as Winkler's degree days.
 *
 * The Köppen–Geiger rules are those of Peel et al. (2007), with the 0 °C line
 * between temperate and continental that Beck et al. (2018, 2023) use.
 */
export type MonthlyClimate = {
  /** Precipitation of each month, January first, in millimetres. */
  pr: readonly number[];
  /** Mean air temperature of each month, January first, in °C. */
  tas: readonly number[];
};

export type ClimateSummary = {
  /** Growing degree days over 10 °C, April–October north, October–April south. */
  growingDegreeDays: number;
  koppen: string;
  meanTemperature: number;
  rainfall: number;
  /** Winkler's region, I (coolest) to V; null below region I's lower bound. */
  winkler: "I" | "II" | "III" | "IV" | "V" | null;
};

const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** The northern summer half-year, April to September (zero-based months). */
const northernSummer = [3, 4, 5, 6, 7, 8];

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export function koppenGeiger({ pr, tas }: MonthlyClimate, latitude: number): string {
  const meanTemperature = sum(tas) / 12;
  const rainfall = sum(pr);
  const hottest = Math.max(...tas);
  const coldest = Math.min(...tas);
  const warmMonths = tas.filter((value) => value > 10).length;
  const summer = (month: number) =>
    latitude >= 0 ? northernSummer.includes(month) : !northernSummer.includes(month);
  const summerRain = pr.filter((_, month) => summer(month));
  const winterRain = pr.filter((_, month) => !summer(month));
  const threshold =
    sum(winterRain) >= 0.7 * rainfall
      ? 2 * meanTemperature
      : sum(summerRain) >= 0.7 * rainfall
        ? 2 * meanTemperature + 28
        : 2 * meanTemperature + 14;

  if (hottest < 10) return hottest > 0 ? "ET" : "EF";
  if (rainfall < 10 * threshold) {
    return `B${rainfall < 5 * threshold ? "W" : "S"}${meanTemperature >= 18 ? "h" : "k"}`;
  }
  if (coldest >= 18) {
    const driest = Math.min(...pr);
    if (driest >= 60) return "Af";
    return driest >= 100 - rainfall / 25 ? "Am" : "Aw";
  }
  const driestSummer = Math.min(...summerRain);
  const driestWinter = Math.min(...winterRain);
  const second =
    driestSummer < 40 && driestSummer < Math.max(...winterRain) / 3
      ? "s"
      : driestWinter < Math.max(...summerRain) / 10
        ? "w"
        : "f";
  const third = hottest >= 22 ? "a" : warmMonths >= 4 ? "b" : coldest < -38 ? "d" : "c";
  return `${coldest > 0 ? "C" : "D"}${second}${third}`;
}

/** Winkler's degree days: the heat over 10 °C of the vine's growing months. */
export function growingDegreeDays({ tas }: MonthlyClimate, latitude: number): number {
  // April–October in the north; October–April in the south.
  const months = latitude >= 0 ? [3, 4, 5, 6, 7, 8, 9] : [9, 10, 11, 0, 1, 2, 3];
  return Math.round(
    sum(months.map((month) => Math.max(0, tas[month]! - 10) * daysInMonth[month]!)),
  );
}

/** Winkler's regions, in degree days °C (from his 2500/3000/3500/4000 °F). */
export function winklerRegion(degreeDays: number): ClimateSummary["winkler"] {
  if (degreeDays < 850) return null;
  if (degreeDays < 1390) return "I";
  if (degreeDays < 1668) return "II";
  if (degreeDays < 1945) return "III";
  if (degreeDays < 2223) return "IV";
  return "V";
}

export function summarizeClimate(monthly: MonthlyClimate, latitude: number): ClimateSummary {
  const degreeDays = growingDegreeDays(monthly, latitude);
  return {
    growingDegreeDays: degreeDays,
    koppen: koppenGeiger(monthly, latitude),
    meanTemperature: Math.round((sum(monthly.tas) / 12) * 10) / 10,
    rainfall: Math.round(sum(monthly.pr)),
    winkler: winklerRegion(degreeDays),
  };
}
