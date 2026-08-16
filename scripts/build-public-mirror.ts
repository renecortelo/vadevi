import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Builds a clean public mirror (§15.9, §22.3).
 *
 * §15.9 is explicit that the private repository must never simply be flipped to
 * public, because its history would go with it. This produces a fresh export
 * with a single root commit and no ancestry, verifies it against the release
 * scanner, and stops.
 *
 * It deliberately does **not** push, add a remote, or create anything on a
 * hosting service. Publishing is irreversible and is the maintainer's decision,
 * so this prepares the artefact and prints what remains to be done by hand.
 */

const outputDirectory = resolve(process.argv[2] ?? "../vadevi-public-mirror");

/** Paths that must never reach a public mirror, whatever Git currently tracks. */
const excluded = [
  ".git",
  ".github/workflows/preview.yml",
  "node_modules",
  "dist",
  ".wrangler",
  ".firebase",
  ".pnpm-store",
  "playwright-report",
  "test-results",
  ".claude",
  ".dev.vars",
  ".env.local",
  "wrangler.preview.jsonc",
  "wrangler.production.jsonc",
  // The planning document. It is the private brief this was built from, and it
  // refers to the author's other private repositories by name. What a reader of
  // the public repository needs — architecture, privacy, threat model, data
  // dictionary, the ADRs, self-hosting — is in docs/ already.
  "vadevi_implementation_spec.md",
  // The operator's own task list, with the state of their acceptance run.
  "docs/your-desk-todo.md",
];

/**
 * Optional local denylist, one term per line, for anything that must never
 * appear in an export: other project names, a personal name, a hostname.
 *
 * It is read from an untracked file on purpose. Writing those terms into a
 * script that is itself published would publish exactly what it is meant to
 * keep back — which is the same trap the spec fell into by naming two private
 * repositories in a document that was being mirrored.
 */
const denylistFile = resolve(".mirror-denylist");

function run(command: string, args: string[], cwd?: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// A mirror is only meaningful from a clean, committed tree.
if (run("git", ["status", "--porcelain"]).trim().length > 0) {
  fail("The working tree has uncommitted changes. Commit or stash them before mirroring.");
}

const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
const commit = run("git", ["rev-parse", "--short", "HEAD"]).trim();

console.info(`Mirroring ${branch} at ${commit} into ${outputDirectory}`);

if (existsSync(outputDirectory)) {
  fail(
    `${outputDirectory} already exists. Remove it first, so a stale export cannot be published by mistake.`,
  );
}
mkdirSync(outputDirectory, { recursive: true });

// `git archive` writes exactly the tracked tree at this commit and carries no
// history, no reflog, and no other branch.
const archive = resolve(outputDirectory, "tree.tar");
run("git", ["archive", "--format=tar", "--output", archive, "HEAD"]);
run("tar", ["-xf", archive, "-C", outputDirectory]);
rmSync(archive);

for (const entry of excluded) {
  const target = resolve(outputDirectory, entry);
  if (existsSync(target)) {
    rmSync(target, { force: true, recursive: true });
    console.info(`  removed ${entry}`);
  }
}

// Anything the operator has declared must never be exported. Checked after the
// exclusions, against the tree that is actually about to be committed.
const denied = existsSync(denylistFile)
  ? readFileSync(denylistFile, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
  : [];

if (denied.length === 0) {
  console.info(
    "  no .mirror-denylist found — add one (untracked, one term per line) for other\n" +
      "  project names, a personal name, or a hostname that must never be exported",
  );
} else {
  const files = run("find", [outputDirectory, "-type", "f"]).split("\n").filter(Boolean);
  const hits: string[] = [];
  for (const file of files) {
    const contents = readFileSync(file, "utf8").toLowerCase();
    const relative = file.slice(outputDirectory.length + 1);
    for (const term of denied) {
      if (contents.includes(term.toLowerCase())) {
        hits.push(`  ${relative} contains a denied term`);
      }
    }
  }
  if (hits.length > 0) {
    rmSync(outputDirectory, { force: true, recursive: true });
    fail(
      `The export contains terms from .mirror-denylist:\n${[...new Set(hits)].join("\n")}\n` +
        "The export has been removed. Fix the source, then run this again.",
    );
  }
  console.info(`  checked ${files.length} files against ${denied.length} denied terms`);
}

// A single root commit: no ancestry to walk back into.
run("git", ["init", "--quiet", "--initial-branch=main"], outputDirectory);
run("git", ["add", "--all"], outputDirectory);
run(
  "git",
  [
    "-c",
    "user.name=Va de Vi",
    "-c",
    "user.email=noreply@example.invalid",
    "commit",
    "--quiet",
    "--message",
    `Initial public release\n\nExported from the private repository at ${commit}.\nThis mirror deliberately carries no prior history.`,
  ],
  outputDirectory,
);

const mirrorCommits = run("git", ["rev-list", "--count", "HEAD"], outputDirectory).trim();
if (mirrorCommits !== "1") {
  fail(`The mirror has ${mirrorCommits} commits; it must have exactly one.`);
}

// Re-run the release scanner against the exported tree, not the source tree.
console.info("\nVerifying the exported tree with the release scanner...");
try {
  const scanner = resolve("scripts/scan-public-release.ts");
  run("node", ["--experimental-strip-types", scanner], outputDirectory);
} catch {
  fail(
    "The exported tree failed the release scan. Inspect the output above and fix the source " +
      "repository — do not publish this mirror.",
  );
}

console.info(
  [
    "",
    "Mirror prepared and verified.",
    "",
    `  location:   ${outputDirectory}`,
    `  source:     ${branch} @ ${commit}`,
    "  history:    1 commit, no ancestry",
    "",
    "Nothing has been pushed. Publishing is irreversible, so the remaining steps are yours:",
    "",
    "  1. Review the exported tree by hand, especially docs/ and any fixture.",
    "  2. Create an empty public repository on your host.",
    "  3. From the mirror directory:",
    "       git remote add origin <your-public-repo-url>",
    "       git push -u origin main",
    "",
    "Re-run this script for each subsequent release. Never add the private",
    "repository as a remote of the mirror, or its history becomes reachable.",
  ].join("\n"),
);
