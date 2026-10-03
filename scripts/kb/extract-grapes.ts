import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Step two of the wine library: from each grape's article, the facts — and
 * for every fact, the sentence it came from.
 *
 * A model reads the article and proposes values with a verbatim quote each.
 * Nothing it proposes is kept on its word: `validateGrape` keeps a value only
 * if its quote occurs in the article and the quote actually says it (the
 * aroma named in the quote, an acidity quote that mentions acid, and so on).
 * The model is the reader, never the source — the same rule Vicenç lives by.
 *
 * Output: `.kb-cache/extracted/<qid>.json` (the model's proposal, for review)
 * and, after validation, `data/kb/grapes.json` (what ships).
 *
 * Usage: pnpm kb:extract-grapes [--only Q123,Q456] [--force] [--daily 30]
 * Credentials: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID if set, else
 * the local wrangler login. Neither is printed or written anywhere.
 */

const model = "@cf/openai/gpt-oss-120b";
const cacheDirectory = resolve(".kb-cache");
const extractedDirectory = resolve(cacheDirectory, "extracted");
mkdirSync(extractedDirectory, { recursive: true });

function credentials(): { account: string; token: string } {
  const envToken = process.env.CLOUDFLARE_API_TOKEN;
  const envAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (envToken !== undefined && envAccount !== undefined) {
    return { account: envAccount, token: envToken };
  }
  const configPath = resolve(homedir(), "Library/Preferences/.wrangler/config/default.toml");
  const alternative = resolve(homedir(), ".wrangler/config/default.toml");
  const path = existsSync(configPath) ? configPath : alternative;
  const token = /oauth_token = "([^"]+)"/.exec(readFileSync(path, "utf8"))?.[1];
  const whoami = execFileSync("pnpm", ["exec", "wrangler", "whoami"], { encoding: "utf8" });
  const account = /\b([0-9a-f]{32})\b/.exec(whoami)?.[1];
  if (token === undefined || account === undefined) {
    throw new Error("No Cloudflare credentials: log in with wrangler, or set the two variables.");
  }
  return { account, token };
}

const instructions = `You extract facts about one grape variety from the article given. Rules:
- Use ONLY the article. Never add anything you know from elsewhere.
- Answer with one JSON object. Every field is {"value": ..., "quote": "..."}.
- "quote" is copied verbatim from the article — same words, same punctuation. If you must skip words, write " ... " between the copied parts; each part must be verbatim. The quote must contain the value's words.
- If the article does not state a field, give "unknown" (or an empty list) and an empty quote.
Fields:
- is_wine_grape: true/false — false for a table or raisin grape not used for wine.
- color: "white" (green/yellow skin), "red" (black/dark skin), or "pink" (grey/pink skin).
- origin: ISO 3166-1 alpha-2 code of the country it originated in, if stated.
- acidity, tannin, body: "low", "medium" or "high", the wine's typical level as the article states it.
- aromas: list of short English terms for aromas and flavours the article gives the wine ("black cherry", "petrol"). Up to 12.
- regions: list of "CC: Region" (country code, colon, region name) where the article says it is notably grown. Up to 12.
- synonyms: list of other names for the same variety given in the article. Up to 15. Not crosses or offspring.
- styles: list from "still", "sparkling", "sweet", "fortified", "rose", "blending".
- pairings: list of foods the article says the wine goes with. Often empty.`;

/** The model's answer, as it gives it; `build-grapes.ts` validates every field. */
type Extraction = Record<string, { quote: string; value: unknown } | boolean>;

async function extract(article: string, name: string): Promise<Extraction> {
  const { account, token } = credentials();
  // Long articles are cut at a paragraph boundary; the head of a grape's
  // article carries the description, the tail is lists and history.
  const text =
    article.length > 24_000 ? article.slice(0, article.lastIndexOf("\n", 24_000)) : article;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
    {
      body: JSON.stringify({
        input: `Grape variety: ${name}\n\nArticle:\n${text}`,
        instructions,
        reasoning: { effort: "low" },
      }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const body = (await response.json()) as {
    errors?: unknown[];
    result?: { output?: { content?: { text?: string; type: string }[]; type: string }[] };
    success?: boolean;
  };
  if (body.success !== true) throw new Error(`Model call failed: ${JSON.stringify(body.errors)}`);
  const message = body.result?.output?.find((item) => item.type === "message");
  const raw = message?.content?.find((part) => part.type === "output_text")?.text ?? "";
  return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Extraction;
}

const only = process.argv.includes("--only")
  ? new Set(process.argv[process.argv.indexOf("--only") + 1]!.split(","))
  : null;
const force = process.argv.includes("--force");
const index = JSON.parse(
  readFileSync(resolve(cacheDirectory, "grapes/index.json"), "utf8"),
) as string[];

/**
 * A ceiling on model calls, shared with the application.
 *
 * Workers AI's free allocation is 10,000 Neurons a day for the whole
 * account, and the deployed app draws on the same pool: Vicenç, translation
 * and the narratives. One unbounded run of this script used all of it on
 * 2026-10-02 — and the allowance did not come back at midnight UTC: on the
 * morning of the 3rd, with nothing spent that day, Vicenç was still refused.
 * The day is not a calendar day, so a count per UTC day is not a guard.
 *
 * Before any call, the account's own usage over the last 24 hours is asked of
 * Cloudflare's analytics, and only what is left above a reserve for the app
 * (6,000 Neurons, `--reserve N`) is spent, at about 100 Neurons a grape; the
 * per-day ledger still caps a run at 30 (`--daily N`). If the usage cannot be
 * read, nothing is spent.
 */
const dailyFlag = process.argv.indexOf("--daily");
const dailyCeiling = dailyFlag === -1 ? 30 : Number(process.argv[dailyFlag + 1]);
const reserveFlag = process.argv.indexOf("--reserve");
const reserve = reserveFlag === -1 ? 6_000 : Number(process.argv[reserveFlag + 1]);
const ledgerPath = resolve(cacheDirectory, "ai-ledger.json");
const today = new Date().toISOString().slice(0, 10);
const ledger = (
  existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : {}
) as Record<string, number>;
const spentToday = ledger[today] ?? 0;

/** Neurons the account used in the last 24 hours, or null if unknown. */
async function neuronsLastDay(): Promise<number | null> {
  const { account, token } = credentials();
  const now = new Date();
  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      body: JSON.stringify({
        query: `query($a: String!, $s: Time!, $e: Time!) { viewer { accounts(filter: { accountTag: $a }) {
          aiInferenceAdaptiveGroups(limit: 100, filter: { datetime_geq: $s, datetime_leq: $e }) {
            sum { totalNeurons } } } } }`,
        variables: {
          a: account,
          e: now.toISOString(),
          s: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        },
      }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as {
      data?: {
        viewer: {
          accounts: { aiInferenceAdaptiveGroups: { sum: { totalNeurons: number } }[] }[];
        };
      };
    };
    const groups = body.data?.viewer.accounts[0]?.aiInferenceAdaptiveGroups;
    if (groups === undefined) return null;
    return groups.reduce((total, group) => total + group.sum.totalNeurons, 0);
  } catch {
    return null;
  }
}

const used = await neuronsLastDay();
const affordable = used === null ? 0 : Math.max(0, Math.floor((10_000 - reserve - used) / 100));
const allowance = Math.max(0, Math.min(dailyCeiling - spentToday, affordable));
console.info(
  used === null
    ? "Workers AI usage could not be read; nothing will be spent."
    : `Workers AI: ${Math.round(used).toLocaleString("en")} Neurons used in the last 24 hours; ` +
        `${reserve.toLocaleString("en")} kept for the app; up to ${allowance} grapes this run.`,
);

let done = 0;
let quotaExhausted = false;
const queue = index
  .filter((qid) => {
    if (only !== null && !only.has(qid)) return false;
    return force || !existsSync(resolve(extractedDirectory, `${qid}.json`));
  })
  .slice(0, allowance);
if (allowance === 0) console.info("Nothing to spend now; run again later.");

function record(): void {
  ledger[today] = (ledger[today] ?? 0) + 1;
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

/** One grape: read, ask, keep the answer for validation. */
async function work(qid: string): Promise<void> {
  const raw = JSON.parse(readFileSync(resolve(cacheDirectory, `grapes/${qid}.json`), "utf8")) as {
    article: string | null;
    labels: Record<string, string>;
  };
  if (raw.article === null || quotaExhausted) return;
  try {
    record();
    const extraction = await extract(raw.article, raw.labels.en ?? qid);
    writeFileSync(
      resolve(extractedDirectory, `${qid}.json`),
      JSON.stringify({ extraction, model, qid }, null, 2),
    );
    done += 1;
    if (done % 10 === 0) console.info(`  extracted ${done} of ${queue.length}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The account's allocation is gone: stop at once rather than spend the
    // rest of the queue on refusals.
    if (/daily free allocation|4006/.test(message)) quotaExhausted = true;
    console.error(`  ${qid} (${raw.labels.en}): ${message}`);
  }
}

// A few at a time: one long article takes most of a minute, and the model
// endpoint serves several callers comfortably.
const concurrency = 6;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await work(next);
  }),
);
console.info(`Extracted ${done} grapes into ${extractedDirectory}.`);
