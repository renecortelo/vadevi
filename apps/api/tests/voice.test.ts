import { BootstrapResponseSchema, ErrorEnvelopeSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createSpeechToTextPort, speechModel } from "../src/adapters/speech-to-text";
import { runHousekeeping } from "../src/repositories/housekeeping";
import {
  knownGrapes,
  placeHeardRegion,
  saveVoiceReview,
  voiceVocabulary,
} from "../src/repositories/voice";
import type { WorkerBindings } from "../src/types";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * Voice tastings, step one: off unless switched on, and when on, the
 * recording goes to the model with the reader's language and a vocabulary of
 * names, and comes back as clean text — never stored.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = emulatorIdToken({
  email: "voice@example.test",
  name: "Voice Reader",
  sub: "firebase-emulator-voice",
});
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

describe("voice tastings", () => {
  it("are unavailable, and spend nothing, until the deployment switches them on", async () => {
    const bootstrap = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const spaceId = bootstrap.data.user.activeSpaceId;
    const response = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/voice/transcribe`,
      {
        body: JSON.stringify({ audio: "AAAA", locale: "es", mimeType: "audio/webm" }),
        headers,
        method: "POST",
      },
    );
    expect(response.status).toBe(503);
    expect(ErrorEnvelopeSchema.parse(await response.json()).error.code).toBe("FEATURE_UNAVAILABLE");
    const spent = await env.DB.prepare(
      `SELECT COUNT(*) AS rows FROM usage_counters WHERE metric = 'voice_transcriptions'`,
    ).first<{ rows: number }>();
    expect(spent?.rows).toBe(0);
  });

  it("send the recording with the language and the vocabulary, and bring back clean text", async () => {
    const calls: { input: Record<string, unknown>; model: string }[] = [];
    const port = createSpeechToTextPort({
      AI: {
        run: async (model: string, input: Record<string, unknown>) => {
          calls.push({ input, model });
          return {
            text: "Un Mencía de Ribeira Sacra\u0000, taninos suaves.",
            transcription_info: { duration: 22.17, language: "es" },
          };
        },
      },
      STT_PROVIDER: "cloudflare",
    } as unknown as WorkerBindings);
    expect(port).not.toBeNull();
    const transcript = await port!.transcribe(new Uint8Array([1, 2, 3]), {
      language: "es",
      vocabulary: "Cata de vino: taninos. Mencía, Ribeira Sacra",
    });
    expect(calls).toEqual([
      {
        input: {
          audio: "AQID",
          condition_on_previous_text: false,
          initial_prompt: "Cata de vino: taninos. Mencía, Ribeira Sacra",
          language: "es",
          vad_filter: true,
        },
        model: speechModel,
      },
    ]);
    // A control character never reaches the next model: it becomes a space.
    expect(transcript).toEqual({
      language: "es",
      seconds: 22.2,
      text: "Un Mencía de Ribeira Sacra , taninos suaves.",
    });
    expect(createSpeechToTextPort({ STT_PROVIDER: "none" } as WorkerBindings)).toBeNull();
  });

  it("hint the reader's language's tasting words and the names of their cellar", async () => {
    const bootstrap = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const spaceId = bootstrap.data.user.activeSpaceId;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO kb_regions (id, eambrosia_id, name, country_code, gi_type)
        VALUES ('es-voice-sacra', 'PDO-ES-VOICE', 'Ribeira Sacra', 'ES', 'PDO')`,
      ),
      env.DB.prepare(
        `INSERT INTO wine_records (
          id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
          non_vintage, region, region_ref, identity_status, version, created_by_user_id,
          created_at, updated_at
        ) SELECT 'voice-wine', ?, 'Amandi', 'amandi', 'Regina Viarum', 'regina viarum', 0,
          'Ribeira Sacra', 'es-voice-sacra', 'confirmed', 1, id, '2026-10-16', '2026-10-16'
        FROM users WHERE firebase_uid = 'firebase-emulator-voice'`,
      ).bind(spaceId),
    ]);
    const hint = await voiceVocabulary(env.DB, { locale: "es", spaceId });
    expect(hint.startsWith("Cata de vino:")).toBe(true);
    expect(hint).toContain("Ribeira Sacra");
    expect(hint.length).toBeLessThanOrEqual(700);
    expect(
      (await voiceVocabulary(env.DB, { locale: "pt-PT", spaceId })).startsWith("Prova de vinho:"),
    ).toBe(true);
  });

  it("propose fields only when switched on, and place a misheard region in the atlas", async () => {
    const bootstrap = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const response = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${bootstrap.data.user.activeSpaceId}/voice/extract`,
      {
        body: JSON.stringify({
          locale: "ca",
          text: "Un albariño de Rías Baixas.",
          today: "2026-10-16",
        }),
        headers,
        method: "POST",
      },
    );
    expect(response.status).toBe(503);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO kb_regions (id, eambrosia_id, name, country_code, gi_type)
        VALUES ('es-voice-rias', 'PDO-ES-RIAS', 'Rías Baixas', 'ES', 'PDO')`,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO kb_names
          (entity_type, entity_id, locale, name, normalized_name, kind, source)
        VALUES ('region', 'es-voice-rias', '*', 'Rías Baixas', 'rias baixas', 'primary', 'register')`,
      ),
    ]);
    // Heard as said, misheard as transcribed, and nothing close.
    expect(await placeHeardRegion(env.DB, "Rías Baixas", "ES")).toEqual({
      name: "Rías Baixas",
      regionId: "es-voice-rias",
    });
    expect((await placeHeardRegion(env.DB, "Ries Baixes", "ES"))?.regionId).toBe("es-voice-rias");
    expect(await placeHeardRegion(env.DB, "Ries Baixes", null)).toBeNull();
    expect(await placeHeardRegion(env.DB, "Yucca Valley", "ES")).toBeNull();
  });

  it("keep only the grapes the library knows", async () => {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO kb_names
        (entity_type, entity_id, locale, name, normalized_name, kind, source)
      VALUES ('grape', 'garnacha', 'es', 'Garnacha', 'garnacha', 'primary', 'wikidata')`,
    ).run();
    expect(await knownGrapes(env.DB, ["Garnacha", "Soave"])).toEqual(["Garnacha"]);
    expect(await knownGrapes(env.DB, [])).toEqual([]);
  });

  it("keep a note sent for review only when switched on, from a member, for thirty days", async () => {
    const bootstrap = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const spaceId = bootstrap.data.user.activeSpaceId;
    const body = {
      form: { producerName: "Bodega Nudo", score100: 85 },
      kind: "quick",
      locale: "es",
      proposal: { fields: {}, region: null, severalWines: false },
      text: "Loma de Nerea de Bodega Nudo. Un 85.",
    };
    const off = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/voice/reviews`, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    });
    expect(off.status).toBe(503);

    const now = "2026-10-18T10:00:00.000Z";
    const options = {
      firebaseUid: "firebase-emulator-voice",
      form: body.form,
      kind: "quick" as const,
      locale: "es",
      nowIso: now,
      proposal: body.proposal,
      spaceId,
      text: body.text,
    };
    const saved = await saveVoiceReview(env.DB, options);
    expect(saved).toEqual({ expiresAt: "2026-11-17T10:00:00.000Z", id: expect.any(String) });
    // Not a member of that Space: nothing kept.
    expect(await saveVoiceReview(env.DB, { ...options, spaceId: "not-a-space" })).toBeNull();
    const row = await env.DB.prepare(
      `SELECT transcript, form_json FROM voice_reviews WHERE space_id = ?`,
    )
      .bind(spaceId)
      .first<{ form_json: string; transcript: string }>();
    expect(row?.transcript).toBe(body.text);
    expect(JSON.parse(row!.form_json)).toEqual(body.form);
    // Thirty days on, the scheduled handler removes it.
    const removed = await runHousekeeping(env.DB, undefined, "2026-11-17T10:00:00.000Z");
    expect(removed.voice_reviews).toBe(1);
  });
});
