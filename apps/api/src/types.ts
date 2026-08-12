export type FirebasePrincipal = Readonly<{
  authTime: number;
  avatarUrl?: string;
  displayName?: string;
  email?: string;
  firebaseUid: string;
}>;

export type WorkerBindings = {
  APP_ENV?: "local" | "preview" | "production";
  APP_VERSION?: string;
  AI_PROVIDER?: "none" | "cloudflare";
  FIREBASE_AUTH_EMULATOR_HOST?: string;
  FIREBASE_PROJECT_ID?: string;
  DB?: D1Database;
  MEDIA?: R2Bucket;
  ASSETS?: Fetcher;
};

export type ApiEnvironment = {
  Bindings: WorkerBindings;
  Variables: {
    principal: FirebasePrincipal;
    requestId: string;
  };
};
