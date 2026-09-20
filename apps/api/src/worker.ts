import { createSemanticNotePort } from "./adapters/semantic-notes";
import { createApi } from "./app";
import { purgeExpiredActionDraftContent } from "./repositories/action-drafts";
import { runDueDeletionJobs } from "./repositories/deletion";
import { runHousekeeping } from "./repositories/housekeeping";
import { purgeExpiredIdentifications } from "./repositories/identification";
import { indexPendingNoteEmbeddings } from "./repositories/note-embeddings";
import type { WorkerBindings } from "./types";

const api = createApi();

export default {
  fetch: (request, environment, context) => api.fetch(request, environment, context),
  scheduled: async (controller, environment) => {
    if (environment.DB === undefined) return;
    const nowIso = new Date(controller.scheduledTime).toISOString();
    // Everything with an expiry that has passed: caches, rate windows,
    // idempotency keys, old counters, photographs reserved but never sent.
    await runHousekeeping(environment.DB, environment.MEDIA, nowIso);
    await purgeExpiredActionDraftContent(environment.DB, nowIso);
    // An abandoned identification proposal must not linger past its window.
    await purgeExpiredIdentifications(environment.DB, nowIso);
    // Semantic note search is optional: the port exists only when the index
    // and Workers AI are both configured. A purge tells it which notes go.
    const notePort = createSemanticNotePort(environment);
    // Deletion runs on the schedule so a confirmed purge never waits for the
    // requester to come back.
    await runDueDeletionJobs(environment.DB, environment.MEDIA, nowIso, notePort);
    // Indexing is lazy: drain a batch of not-yet-embedded notes. Off otherwise.
    if (notePort !== null) await indexPendingNoteEmbeddings(environment.DB, notePort, nowIso);
  },
} satisfies ExportedHandler<WorkerBindings>;
