import { loadEnvConfig } from "@next/env";
import { comparePerspectives } from "../src/lib/server/comparison";
import type { ComparisonSource } from "../src/lib/memory/connections";
loadEnvConfig(process.cwd());
const source = (
  publicationId: string,
  authorName: string,
  caption: string,
): ComparisonSource => ({ publicationId, authorName, caption, pins: [] });
const began = Date.now();
comparePerspectives([
  source(
    "fictional-left",
    "Alex (fictional sample)",
    "I remember the red bicycle. The parking lot felt enormous to me.",
  ),
  source(
    "fictional-right",
    "Dad (fictional sample)",
    "I remember letting go of the red bicycle and watching you ride on your own.",
  ),
])
  .then((r) =>
    console.log(
      JSON.stringify({
        liveComparison: true,
        shared: r.shared.length,
        distinct: r.distinct.length,
        questions: r.questions.length,
        seconds: (Date.now() - began) / 1000,
        evidenceValidated: true,
      }),
    ),
  )
  .catch((e) => {
    console.error(JSON.stringify({ message: e.message, code: e.code }));
    process.exitCode = 1;
  });
