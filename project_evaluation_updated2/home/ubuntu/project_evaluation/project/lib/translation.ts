import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Supported Languages ─────────────────────────────────────────────────────

export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'th', name: 'Thai', nativeName: 'ภาษาไทย' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
];

export function getLanguageByCode(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code);
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface TranslationResult {
  text: string;
  /** BCP-47 code of the auto-detected source language, e.g. "ar" or "fr" */
  sourceLang?: string;
}

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface TranslationProvider {
  name: string;
  translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslationResult>;
}

// ─── MyMemory Provider (free, no API key required) ────────────────────────────

class MyMemoryProvider implements TranslationProvider {
  name = 'MyMemory';

  async translate(text: string, targetLang: string, sourceLang = 'autodetect'): Promise<TranslationResult> {
    const langPair = `${sourceLang}|${targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory API error: ${res.status}`);
    const json = await res.json();
    if (json.responseStatus !== 200) {
      throw new Error(json.responseDetails || 'Translation failed');
    }

    const translatedText = json.responseData.translatedText as string;

    // Extract detected source language from the "match" field ("XX|YY" where XX = detected source)
    let detectedSource: string | undefined;
    const match = json.responseData?.match as string | undefined;
    if (match) {
      const parts = match.split('|');
      const detected = parts[0]?.toLowerCase();
      if (detected && detected !== 'autodetect') detectedSource = detected;
    }

    return { text: translatedText, sourceLang: detectedSource };
  }
}

// ─── Provider Stubs (swap in by calling TranslationService.setProvider()) ─────

/**
 * Google Cloud Translation API (v2 / Basic)
 * Requires: EXPO_PUBLIC_GOOGLE_TRANSLATE_API_KEY
 *
 * Usage:
 *   import { GoogleTranslateProvider } from '@/lib/translation';
 *   TranslationService.setProvider(new GoogleTranslateProvider('YOUR_KEY'));
 */
export class GoogleTranslateProvider implements TranslationProvider {
  name = 'Google Translate';
  constructor(private apiKey: string) {}

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslationResult> {
    const params = new URLSearchParams({
      q: text,
      target: targetLang,
      key: this.apiKey,
      format: 'text',
    });
    if (sourceLang) params.set('source', sourceLang);

    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?${params}`);
    if (!res.ok) throw new Error(`Google Translate error: ${res.status}`);
    const json = await res.json();
    const result = json.data?.translations?.[0];
    return {
      text: result?.translatedText ?? text,
      sourceLang: result?.detectedSourceLanguage?.toLowerCase(),
    };
  }
}

/**
 * DeepL Free/Pro API
 * Requires: EXPO_PUBLIC_DEEPL_API_KEY
 * Free tier endpoint: https://api-free.deepl.com  (Pro: https://api.deepl.com)
 *
 * Usage:
 *   import { DeepLProvider } from '@/lib/translation';
 *   TranslationService.setProvider(new DeepLProvider('YOUR_KEY'));
 */
export class DeepLProvider implements TranslationProvider {
  name = 'DeepL';
  constructor(private apiKey: string, private baseUrl = 'https://api-free.deepl.com') {}

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslationResult> {
    const body: Record<string, unknown> = {
      text: [text],
      target_lang: targetLang.toUpperCase(),
    };
    if (sourceLang) body.source_lang = sourceLang.toUpperCase();

    const res = await fetch(`${this.baseUrl}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`DeepL error: ${res.status}`);
    const json = await res.json();
    const result = json.translations?.[0];
    return {
      text: result?.text ?? text,
      sourceLang: result?.detected_source_language?.toLowerCase(),
    };
  }
}

/**
 * OpenAI Chat Completions translation provider
 * Requires: EXPO_PUBLIC_OPENAI_API_KEY
 *
 * Usage:
 *   import { OpenAITranslationProvider } from '@/lib/translation';
 *   TranslationService.setProvider(new OpenAITranslationProvider('YOUR_KEY'));
 */
export class OpenAITranslationProvider implements TranslationProvider {
  name = 'OpenAI';
  constructor(private apiKey: string, private model = 'gpt-4o-mini') {}

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslationResult> {
    const targetName = getLanguageByCode(targetLang)?.name ?? targetLang;
    const prompt = sourceLang
      ? `Translate the following text from ${sourceLang} to ${targetName}. Return only the translation, nothing else:\n\n${text}`
      : `Detect the language and translate the following text to ${targetName}. Return only the translation, nothing else:\n\n${text}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const json = await res.json();
    return { text: json.choices?.[0]?.message?.content?.trim() ?? text };
  }
}

// ─── Translation Cache ────────────────────────────────────────────────────────

const CACHE_VERSION = 'v2'; // bump to invalidate old format
const CACHE_STORAGE_KEY = `@translation/cache_${CACHE_VERSION}`;

interface CacheEntry {
  text: string;
  sourceLang?: string;
}

// In-memory cache: key = "<messageId>:<targetLang>", value = CacheEntry
const memoryCache = new Map<string, CacheEntry>();
let cacheLoaded = false;

function cacheKey(messageId: string, targetLang: string) {
  return `${messageId}:${targetLang}`;
}

async function loadCache(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
    if (raw) {
      const entries = JSON.parse(raw) as [string, CacheEntry][];
      for (const [k, v] of entries) memoryCache.set(k, v);
    }
  } catch {
    // ignore cache load failures
  }
  cacheLoaded = true;
}

async function persistCache(): Promise<void> {
  try {
    const entries = Array.from(memoryCache.entries());
    const trimmed = entries.slice(-1000); // bound to 1000 most recent entries
    await AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore persist failures
  }
}

function getCached(messageId: string, targetLang: string): CacheEntry | null {
  return memoryCache.get(cacheKey(messageId, targetLang)) ?? null;
}

function setCached(messageId: string, targetLang: string, entry: CacheEntry): void {
  memoryCache.set(cacheKey(messageId, targetLang), entry);
  persistCache();
}

// ─── TranslationService ───────────────────────────────────────────────────────

class TranslationServiceClass {
  private provider: TranslationProvider = new MyMemoryProvider();
  // Deduplicates concurrent in-flight requests for the same message+lang
  private inFlight = new Map<string, Promise<TranslationResult>>();

  setProvider(provider: TranslationProvider) {
    this.provider = provider;
  }

  getProvider(): TranslationProvider {
    return this.provider;
  }

  /**
   * Translate a single message. Returns translated text string.
   * Uses cache (AsyncStorage + in-memory). Call translateWithMeta for source lang.
   */
  async translate(
    text: string,
    targetLang: string,
    options: { messageId?: string | null; sourceLang?: string } = {}
  ): Promise<string> {
    const result = await this.translateWithMeta(text, targetLang, options);
    return result.text;
  }

  /**
   * Like translate() but also returns the detected source language.
   */
  async translateWithMeta(
    text: string,
    targetLang: string,
    options: { messageId?: string | null; sourceLang?: string } = {}
  ): Promise<TranslationResult> {
    const { messageId, sourceLang } = options;
    if (!text.trim()) return { text };

    await loadCache();

    if (messageId) {
      const cached = getCached(messageId, targetLang);
      if (cached !== null) return cached;

      const key = cacheKey(messageId, targetLang);
      const existing = this.inFlight.get(key);
      if (existing) return existing;

      const request = this.provider
        .translate(text, targetLang, sourceLang)
        .then((result) => {
          setCached(messageId, targetLang, result);
          this.inFlight.delete(key);
          return result;
        })
        .catch((err) => {
          this.inFlight.delete(key);
          throw err;
        });

      this.inFlight.set(key, request);
      return request;
    }

    return this.provider.translate(text, targetLang, sourceLang);
  }

  /**
   * Translate multiple messages in parallel. Skips already-cached entries.
   * Returns a map of messageId → TranslationResult for newly-translated messages.
   */
  async translateBatch(
    items: Array<{ messageId: string; text: string }>,
    targetLang: string,
    options: { sourceLang?: string } = {}
  ): Promise<Map<string, TranslationResult>> {
    await loadCache();

    const results = new Map<string, TranslationResult>();
    const uncached = items.filter(({ messageId }) => getCached(messageId, targetLang) === null);

    if (uncached.length === 0) return results;

    const settled = await Promise.allSettled(
      uncached.map(({ messageId, text }) =>
        this.translateWithMeta(text, targetLang, { messageId, sourceLang: options.sourceLang }).then(
          (r) => ({ messageId, result: r })
        )
      )
    );

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        results.set(s.value.messageId, s.value.result);
      }
    }

    return results;
  }

  /**
   * Retrieve cached source language for a previously-translated message.
   */
  getSourceLang(messageId: string, targetLang: string): string | null {
    return getCached(messageId, targetLang)?.sourceLang ?? null;
  }

  clearCache(): void {
    memoryCache.clear();
    AsyncStorage.removeItem(CACHE_STORAGE_KEY).catch(() => {});
  }
}

export const TranslationService = new TranslationServiceClass();
