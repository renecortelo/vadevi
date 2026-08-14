import { createApi } from "./app";
import { purgeExpiredActionDraftContent } from "./repositories/action-drafts";
import type { WorkerBindings } from "./types";

const api = createApi();

export default {
  fetch: (request, environment, context) => api.fetch(request, environment, context),
  scheduled: async (controller, environment) => {
    if (environment.DB === undefined) return;
    await purgeExpiredActionDraftContent(
      environment.DB,
      new Date(controller.scheduledTime).toISOString(),
    );
  },
} satisfies ExportedHandler<WorkerBindings>;
