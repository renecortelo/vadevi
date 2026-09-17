import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Generates the third-party notices and an SBOM (§22.3).
 *
 * Both are derived from the installed tree rather than the lockfile, because
 * the licence a package actually ships can differ from what a registry index
 * reports.
 *
 * `--check` enforces the licence *policy*: every copyleft or undeclared licence
 * must appear in the reviewed allowlist. Va de Vi is AGPL-3.0, so a GPL-family
 * dependency would be compatible — but an unnoticed one is still a material
 * change to what a downstream self-hoster inherits, and §22.3 asks for that to
 * be reviewed rather than absorbed.
 *
 * It deliberately does **not** compare the committed files byte-for-byte. Some
 * packages are published per platform and some are platform-exclusive with no
 * suffix to detect (`fsevents`), so an installed tree on macOS and on a Linux
 * runner legitimately differ. Byte-equality would fail purely on where the
 * check ran. Regeneration is a release step, run by `pnpm notices:generate`.
 */

type Package = { license: string; name: string; version: string };

const copyleftMarkers = ["AGPL", "GPL", "SSPL", "BUSL", "CC-BY-SA", "EUPL", "OSL", "CPAL"];

/**
 * Reviewed exceptions, each with the reasoning that cleared it. A copyleft or
 * undeclared licence outside this map fails the check, so a new one has to be
 * looked at rather than absorbed.
 */
const reviewedExceptions: Record<string, string> = {
  "@img/sharp-libvips-*":
    "LGPL-3.0-or-later. Platform-specific native binaries of libvips, reached through " +
    "sharp → miniflare → wrangler, so they are development dependencies only and are never " +
    "shipped in the Worker or the web bundle. LGPL is in any case compatible with AGPL-3.0.",
  "valid-url":
    "Declares no license field, but ships a LICENSE file carrying the verbatim MIT text " +
    "(Copyright 2013 Odysseas Tsatalos and oDesk Corporation).",
};

function normalizeLicense(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((entry) =>
        typeof entry === "object" && entry !== null && "type" in entry
          ? String((entry as { type: unknown }).type)
          : String(entry),
      )
      .join(" OR ");
  }
  if (typeof raw === "object" && raw !== null && "type" in raw) {
    return String((raw as { type: unknown }).type);
  }
  return "UNKNOWN";
}

/**
 * Native packages published one-per-platform. The installed set differs between
 * a macOS laptop and a Linux runner, so comparing them byte-for-byte would make
 * the check fail purely on where it ran. They are collapsed into a family entry
 * instead, which keeps the licence disclosure without the platform noise.
 */
function platformFamily(name: string): string | null {
  const match = name.match(
    /^(.*?)-(?:darwin|linux|win32|freebsd|openbsd|android|sunos)-(?:x64|arm64|arm|ia32|ppc64|s390x|riscv64|loong64|mips64el)(?:-(?:musl|gnu|gnueabihf|msvc))?$/,
  );
  return match === null ? null : `${match[1]}-*`;
}

function installedPackages(): Package[] {
  // Every real package manifest under the pnpm store, one directory deep.
  const output = execFileSync(
    "find",
    // Depth 5 reaches scoped packages, whose manifest sits one level deeper.
    ["node_modules/.pnpm", "-maxdepth", "5", "-name", "package.json", "-path", "*/node_modules/*"],
    { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );

  const seen = new Map<string, Package>();
  for (const path of output.split("\n").filter(Boolean)) {
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    const name = typeof manifest.name === "string" ? manifest.name : null;
    const version = typeof manifest.version === "string" ? manifest.version : null;
    if (name === null || version === null) continue;
    // Workspace packages are the project's own code, not third-party.
    if (name.startsWith("@vadevi/")) continue;
    seen.set(`${name}@${version}`, {
      license: normalizeLicense(manifest.license ?? manifest.licenses),
      name,
      version,
    });
  }

  return [...seen.values()].sort((left, right) =>
    left.name === right.name
      ? left.version.localeCompare(right.version)
      : left.name.localeCompare(right.name),
  );
}

const allPackages = installedPackages();

// Collapse platform variants to one family row, keyed by licence.
const familyLicenses = new Map<string, string>();
const packages: Package[] = [];
for (const entry of allPackages) {
  const family = platformFamily(entry.name);
  if (family === null) {
    packages.push(entry);
    continue;
  }
  familyLicenses.set(family, entry.license);
}
for (const [name, license] of familyLicenses) {
  packages.push({ license, name, version: "platform-specific" });
}
packages.sort((left, right) => left.name.localeCompare(right.name));

const byLicense = new Map<string, Package[]>();
for (const entry of packages) {
  byLicense.set(entry.license, [...(byLicense.get(entry.license) ?? []), entry]);
}

const copyleft = packages.filter((entry) =>
  copyleftMarkers.some((marker) => entry.license.toUpperCase().includes(marker)),
);
const unknown = packages.filter((entry) => entry.license === "UNKNOWN");
const needsReview = [...copyleft, ...unknown].filter(
  (entry) => reviewedExceptions[entry.name] === undefined,
);

const notices = `# Third-party notices

Va de Vi is distributed under the GNU Affero General Public License v3.0 only.
See [LICENSE](LICENSE).

This file lists every third-party package in the installed dependency tree and
the licence it ships. It is generated by \`pnpm notices:generate\` and verified
in CI against the licence policy: no copyleft or undeclared licence may appear
outside the reviewed allowlist below.

The inventory is a snapshot of one installed tree. A few packages are published
per platform, so a different operating system installs a slightly different set;
those variants are collapsed into a single \`-*\` family row.

**${packages.length}** third-party packages across **${byLicense.size}** distinct
licence expressions. ${
  copyleft.length === 0
    ? "None carries a copyleft licence."
    : `**${copyleft.length}** carry a copyleft licence; each is reviewed below.`
}

## Summary by licence

| Licence | Packages |
| --- | --- |
${[...byLicense.entries()]
  .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
  .map(([license, entries]) => `| ${license} | ${entries.length} |`)
  .join("\n")}
${
  copyleft.length === 0
    ? ""
    : `\n## Copyleft dependencies\n\n${copyleft
        .map(
          (entry) =>
            `### \`${entry.name}@${entry.version}\` — ${entry.license}\n\n${
              reviewedExceptions[entry.name] ?? "**Not yet reviewed.**"
            }\n`,
        )
        .join("\n")}`
}${
  unknown.length === 0
    ? ""
    : `\n## Packages with no declared licence\n\n${unknown
        .map(
          (entry) =>
            `### \`${entry.name}@${entry.version}\`\n\n${
              reviewedExceptions[entry.name] ?? "**Not yet reviewed.**"
            }\n`,
        )
        .join("\n")}`
}
## Full inventory

| Package | Version | Licence |
| --- | --- | --- |
${packages.map((entry) => `| \`${entry.name}\` | ${entry.version} | ${entry.license} |`).join("\n")}
`;

/** CycloneDX 1.5, the format most SBOM tooling consumes. */
const sbom = {
  bomFormat: "CycloneDX",
  components: packages.map((entry) => ({
    licenses: entry.license === "UNKNOWN" ? [] : [{ expression: entry.license }],
    name: entry.name,
    purl: `pkg:npm/${entry.name.replace("@", "%40")}@${entry.version}`,
    type: "library",
    version: entry.version,
  })),
  metadata: {
    component: {
      licenses: [{ expression: "AGPL-3.0-only" }],
      name: "va-de-vi",
      type: "application",
      version: JSON.parse(readFileSync("package.json", "utf8")).version as string,
    },
  },
  specVersion: "1.5",
};

const noticesPath = "NOTICES.md";
const sbomPath = "sbom.json";
const sbomText = `${JSON.stringify(sbom, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const missingFiles = [noticesPath, sbomPath].filter((path) => {
    try {
      return readFileSync(path, "utf8").trim().length === 0;
    } catch {
      return true;
    }
  });

  if (missingFiles.length > 0) {
    console.error(`Missing: ${missingFiles.join(", ")}. Run \`pnpm notices:generate\`.`);
    process.exitCode = 1;
  } else if (needsReview.length > 0) {
    console.error(
      `These dependencies need a licence review before publication:\n${needsReview
        .map((entry) => `  ${entry.name}@${entry.version} — ${entry.license}`)
        .join("\n")}\n\nRecord the reasoning in reviewedExceptions once reviewed.`,
    );
    process.exitCode = 1;
  } else {
    console.info(
      `Licence policy satisfied: ${packages.length} third-party packages, ` +
        `${byLicense.size} licence expressions, ${copyleft.length} copyleft and ` +
        `${unknown.length} undeclared, all reviewed.`,
    );
  }
} else {
  writeFileSync(noticesPath, notices);
  writeFileSync(sbomPath, sbomText);
  console.info(`Wrote ${noticesPath} and ${sbomPath} for ${packages.length} packages.`);
}
