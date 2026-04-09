type LanguageCatalogEntry = {
  key: string;
  label: string;
  monaco: string;
  runtimeId: number;
};

const languages = require("./languages.json") as LanguageCatalogEntry[];

export type LanguageKey = "c" | "cpp" | "python" | "java";

const catalog = languages.map((item) => ({
  ...item,
  key: item.key.toLowerCase().trim(),
  monaco: item.monaco.toLowerCase().trim(),
}));

const keyToRuntimeId = new Map<LanguageKey, number>();
const runtimeIdToKey = new Map<number, LanguageKey>();
const monacoToKey = new Map<string, LanguageKey>();
const supportedLanguageSet = new Set<LanguageKey>();
const keyToLabel = new Map<LanguageKey, string>();

for (const item of catalog) {
  const key = item.key as LanguageKey;
  keyToRuntimeId.set(key, item.runtimeId);
  runtimeIdToKey.set(item.runtimeId, key);
  monacoToKey.set(item.monaco, key);
  supportedLanguageSet.add(key);
  keyToLabel.set(key, item.label);
}

export const supportedLanguageKeys = catalog.map(
  (item) => item.key as LanguageKey,
);

export const getLanguageLabel = (language: LanguageKey): string =>
  keyToLabel.get(language) ?? language.toUpperCase();

export const isSupportedLanguageKey = (
  value: unknown,
): value is LanguageKey => {
  if (typeof value !== "string") {
    return false;
  }

  return supportedLanguageSet.has(value.toLowerCase().trim() as LanguageKey);
};

export const fromRuntimeLanguageId = (
  languageId?: unknown,
): LanguageKey | null => {
  if (typeof languageId === "number" && Number.isFinite(languageId)) {
    return runtimeIdToKey.get(languageId) ?? null;
  }

  if (typeof languageId === "string") {
    const parsed = Number(languageId);
    if (Number.isFinite(parsed)) {
      return runtimeIdToKey.get(parsed) ?? null;
    }
  }

  return null;
};

export const toRuntimeLanguageId = (language: LanguageKey): number | null =>
  keyToRuntimeId.get(language) ?? null;

export const fromMonacoLanguage = (
  value?: unknown,
): LanguageKey | null => {
  if (typeof value !== "string") {
    return null;
  }

  return monacoToKey.get(value.toLowerCase().trim()) ?? null;
};

export const resolveLanguageFromInput = (input: {
  language?: unknown;
  languageId?: unknown;
}): LanguageKey | null => {
  const direct = isSupportedLanguageKey(input.language)
    ? (input.language.toLowerCase().trim() as LanguageKey)
    : null;

  if (direct) {
    return direct;
  }

  const monaco = fromMonacoLanguage(input.language);
  if (monaco) {
    return monaco;
  }

  return fromRuntimeLanguageId(input.languageId);
};

export const resolveLanguageId = (input: {
  language?: unknown;
  languageId?: unknown;
}): number | null => {
  const byId = fromRuntimeLanguageId(input.languageId);
  if (byId) {
    return toRuntimeLanguageId(byId);
  }

  const language = resolveLanguageFromInput(input);
  if (!language) {
    return null;
  }

  return toRuntimeLanguageId(language);
};
