import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { dailyBudgets } from "../apps/api/src/services/usage";

/**
 * The caps table in `docs/self-hosting.md` must say what the code enforces.
 *
 * It has drifted twice: once to numbers the code had never had, and once by
 * standing still when the budget was cut to fit the free allowance. A reader
 * sizing a deployment from the table then plans for a limit the app will not
 * honour. The table's rows are checked here against `dailyBudgets`, the one
 * place the numbers are real.
 */
const rows: Record<keyof typeof dailyBudgets, string> = {
  ai_language_calls: "Vicenç, narrative and evidence translation (AI text)",
  barcode_lookups: "Barcode lookups",
  ocr_reads: "Label reads (OCR)",
  price_lookups: "Price lookups (metric only; not built)",
  research_lookups: "Research lookups (Wikidata, OFF, venues)",
  websearch_calls: "Open-web search (Brave)",
};

const document = readFileSync(resolve(import.meta.dirname, "../docs/self-hosting.md"), "utf8");
const problems: string[] = [];

for (const [metric, label] of Object.entries(rows) as [keyof typeof dailyBudgets, string][]) {
  const budget = dailyBudgets[metric];
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expected = new RegExp(
    `^\\| ${escaped}\\s+\\| ${budget.user}\\s+\\| ${budget.global}\\s+\\|$`,
    "m",
  );
  if (!expected.test(document)) {
    problems.push(
      `  ${metric}: docs/self-hosting.md must have a row "| ${label} | ${budget.user} | ${budget.global} |".`,
    );
  }
}

if (problems.length > 0) {
  console.error("The caps table in docs/self-hosting.md disagrees with dailyBudgets:");
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log("docs/self-hosting.md caps table matches dailyBudgets.");
