import { createSemanticNotePort } from "./adapters/semantic-notes";
import { createApi } from "./app";
import { purgeExpiredActionDraftContent } from "./repositories/action-drafts";
import { runDueDeletionJobs } from "./repositories/deletion";
import { runHousekeeping } from "./repositories/housekeeping";
import { purgeExpiredIdentifications } from "./repositories/identification";
import { indexPendingNoteEmbeddings } from "./repositories/note-embeddings";
import { linkWineRegions } from "./repositories/region-linking";
import { runScheduledSteps } from "./scheduled";
import type { WorkerBindings } from "./types";

const api = createApi();

export default {
  fetch: (request, environment, context) => api.fetch(request, environment, context),
  scheduled: async (controller, environment) => {
    if (environment.DB === undefined) return;
    const database = environment.DB;
    const nowIso = new Date(controller.scheduledTime).toISOString();
    // Semantic note search is optional: the port exists only when the index
    // and Workers AI are both configured. A purge tells it which notes go.
    const notePort = createSemanticNotePort(environment);
    await runScheduledSteps([
      // Deletion comes first, so a confirmed purge never waits for the
      // requester to come back, nor on anything below.
      ["deletion", () => runDueDeletionJobs(database, environment.MEDIA, nowIso, notePort)],
      // Everything with an expiry that has passed: caches, rate windows,
      // idempotency keys, old counters, photographs reserved but never sent.
      ["housekeeping", () => runHousekeeping(database, environment.MEDIA, nowIso)],
      ["action-drafts", () => purgeExpiredActionDraftContent(database, nowIso)],
      // An abandoned identification proposal must not linger past its window.
      ["identifications", () => purgeExpiredIdentifications(database, nowIso)],
      // Wines recorded before the library knew their region's name: linked
      // once it does, a batch at a time.
      ["region-links", () => linkWineRegions(database)],
      // Indexing is lazy: drain a batch of not-yet-embedded notes. Off otherwise.
      [
        "note-embeddings",
        async () => {
          if (notePort !== null) await indexPendingNoteEmbeddings(database, notePort, nowIso);
        },
      ],
    ]);
  },
} satisfies ExportedHandler<WorkerBindings>;
