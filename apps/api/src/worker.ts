import { createSemanticNotePort } from "./adapters/semantic-notes";
import { createApi } from "./app";
import { purgeExpiredActionDraftContent } from "./repositories/action-drafts";
import { runDueDeletionJobs } from "./repositories/deletion";
import { purgeExpiredIdentifications } from "./repositories/identification";
import { indexPendingNoteEmbeddings } from "./repositories/note-embeddings";
import type { WorkerBindings } from "./types";

const api = createApi();

export default {
  fetch: (request, environment, context) => api.fetch(request, environment, context),
  scheduled: async (controller, environment) => {
    if (environment.DB === undefined) return;
    const nowIso = new Date(controller.scheduledTime).toISOString();
    await purgeExpiredActionDraftContent(environment.DB, nowIso);
    // An abandoned identification proposal must not linger past its window.
    await purgeExpiredIdentifications(environment.DB, nowIso);
    // Deletion runs on the schedule so a confirmed purge never waits for the
    // requester to come back.
    await runDueDeletionJobs(environment.DB, environment.MEDIA, nowIso);
    // Semantic note indexing is lazy: when the index and Workers AI are both
    // configured, drain a batch of not-yet-embedded notes. Off otherwise.
    const notePort = createSemanticNotePort(environment);
    if (notePort !== null) await indexPendingNoteEmbeddings(environment.DB, notePort, nowIso);
  },
} satisfies ExportedHandler<WorkerBindings>;
