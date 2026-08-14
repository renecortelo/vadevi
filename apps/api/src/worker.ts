import { createApi } from "./app";
import { purgeExpiredActionDraftContent } from "./repositories/action-drafts";
import { runDueDeletionJobs } from "./repositories/deletion";
import type { WorkerBindings } from "./types";

const api = createApi();

export default {
  fetch: (request, environment, context) => api.fetch(request, environment, context),
  scheduled: async (controller, environment) => {
    if (environment.DB === undefined) return;
    const nowIso = new Date(controller.scheduledTime).toISOString();
    await purgeExpiredActionDraftContent(environment.DB, nowIso);
    // Deletion runs on the schedule so a confirmed purge never waits for the
    // requester to come back.
    await runDueDeletionJobs(environment.DB, environment.MEDIA, nowIso);
  },
} satisfies ExportedHandler<WorkerBindings>;
