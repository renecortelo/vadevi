export type AssistantEvidenceClass = "inferred" | "observed" | "personal" | "researched";

export type AssistantLanguageStatement = Readonly<{
  evidenceClass: AssistantEvidenceClass;
  id: string;
  sampleSize: number | null;
  sourceIds: string[];
  text: string;
}>;

export type AssistantLanguageClaim = Readonly<{
  evidenceClass: AssistantEvidenceClass;
  sampleSize: number | null;
  sourceIds: string[];
  text: string;
}>;

export type AssistantLanguageInput = Readonly<{
  locale: "ca" | "de" | "en" | "es" | "fr" | "it" | "nl" | "pt-PT";
  message: string;
  statements: AssistantLanguageStatement[];
}>;

export type AssistantLanguageResult = Readonly<{
  claims: AssistantLanguageClaim[];
  modelVersion: string;
}>;

export interface AssistantLanguagePort {
  render(input: AssistantLanguageInput): Promise<AssistantLanguageResult | null>;
}
