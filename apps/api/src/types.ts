export type FirebasePrincipal = Readonly<{
  authTime: number;
  avatarUrl?: string;
  displayName?: string;
  email?: string;
  firebaseUid: string;
}>;

export type WorkerBindings = {
  AI?: Ai;
  AI_MODEL?: string;
  AI_OCR_MODEL?: string;
  APP_ENV?: "local" | "preview" | "production";
  APP_VERSION?: string;
  AI_PROVIDER?: "none" | "cloudflare";
  EXTERNAL_API_USER_AGENT?: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_AUTH_PROXY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_WEB_API_KEY?: string;
  PAIRING_PROVIDER?: "none" | "sommelierx";
  RESEARCH_PROVIDER?: "none" | "open_data";
  SOMMELIERX_API_KEY?: string;
  WEBSEARCH_PROVIDER?: "none" | "brave" | "tavily";
  WEBSEARCH_API_KEY?: string;
  DB?: D1Database;
  MEDIA?: R2Bucket;
  NOTE_INDEX?: VectorizeIndex;
  ASSETS?: Fetcher;
};

export type ApiEnvironment = {
  Bindings: WorkerBindings;
  Variables: {
    principal: FirebasePrincipal;
    requestId: string;
  };
};
