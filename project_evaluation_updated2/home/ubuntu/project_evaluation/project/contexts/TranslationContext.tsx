import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TranslationService, getLanguageByCode } from '@/lib/translation';

const PREFS_KEY = '@translation/preferences';
const DISABLED_CHATS_KEY = '@translation/disabled_chats';

interface TranslationPreferences {
  preferredLanguage: string;
  autoTranslate: boolean;
  showOriginalByDefault: boolean;
}

const DEFAULT_PREFS: TranslationPreferences = {
  preferredLanguage: 'en',
  autoTranslate: false,
  showOriginalByDefault: false,
};

interface TranslationContextValue extends TranslationPreferences {
  setPreferredLanguage: (lang: string) => void;
  setAutoTranslate: (enabled: boolean) => void;
  setShowOriginalByDefault: (show: boolean) => void;

  // Per-message translated text (React state mirror of service cache)
  translatedMessages: Map<string, string>;
  // Per-message detected source language
  sourceLangs: Map<string, string>;
  translatingIds: Set<string>;

  translateMessage: (messageId: string, text: string, targetLang?: string) => Promise<void>;
  batchTranslateMessages: (
    messages: Array<{ id: string; text: string }>,
    targetLang?: string
  ) => Promise<void>;
  getTranslation: (messageId: string, targetLang?: string) => string | null;
  getSourceLanguage: (messageId: string, targetLang?: string) => string | null;

  // Per-chat/room auto-translate opt-out
  disabledChats: Set<string>;
  isChatTranslationEnabled: (chatOrRoomId: string) => boolean;
  toggleChatTranslation: (chatOrRoomId: string) => void;
}

const TranslationContext = createContext<TranslationContextValue | null>(null);

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<TranslationPreferences>(DEFAULT_PREFS);
  const [translatedMessages, setTranslatedMessages] = useState<Map<string, string>>(new Map());
  const [sourceLangs, setSourceLangs] = useState<Map<string, string>>(new Map());
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [disabledChats, setDisabledChats] = useState<Set<string>>(new Set());
  // Track messageId+targetLang keys already dispatched to avoid duplicate requests
  const pendingKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PREFS_KEY),
      AsyncStorage.getItem(DISABLED_CHATS_KEY),
    ]).then(([rawPrefs, rawDisabled]) => {
      if (rawPrefs) {
        try {
          setPrefs((prev) => ({ ...prev, ...(JSON.parse(rawPrefs) as Partial<TranslationPreferences>) }));
        } catch {}
      }
      if (rawDisabled) {
        try {
          setDisabledChats(new Set(JSON.parse(rawDisabled) as string[]));
        } catch {}
      }
    });
  }, []);

  const savePrefs = (next: TranslationPreferences) => {
    setPrefs(next);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
  };

  const setPreferredLanguage = (lang: string) => {
    savePrefs({ ...prefs, preferredLanguage: lang });
    // Clear in-component state; service cache is still valid per targetLang key
    setTranslatedMessages(new Map());
    setSourceLangs(new Map());
    pendingKeys.current.clear();
  };

  const setAutoTranslate = (enabled: boolean) => savePrefs({ ...prefs, autoTranslate: enabled });
  const setShowOriginalByDefault = (show: boolean) =>
    savePrefs({ ...prefs, showOriginalByDefault: show });

  const isChatTranslationEnabled = useCallback(
    (chatOrRoomId: string) => !disabledChats.has(chatOrRoomId),
    [disabledChats]
  );

  const toggleChatTranslation = useCallback(
    (chatOrRoomId: string) => {
      setDisabledChats((prev) => {
        const next = new Set(prev);
        if (next.has(chatOrRoomId)) next.delete(chatOrRoomId);
        else next.add(chatOrRoomId);
        AsyncStorage.setItem(DISABLED_CHATS_KEY, JSON.stringify(Array.from(next))).catch(() => {});
        return next;
      });
    },
    []
  );

  const applyResults = useCallback(
    (results: Map<string, { text: string; sourceLang?: string }>) => {
      if (results.size === 0) return;
      setTranslatedMessages((prev) => {
        const next = new Map(prev);
        for (const [id, r] of results) next.set(id, r.text);
        return next;
      });
      setSourceLangs((prev) => {
        const next = new Map(prev);
        for (const [id, r] of results) {
          if (r.sourceLang) next.set(id, r.sourceLang);
        }
        return next;
      });
    },
    []
  );

  const translateMessage = useCallback(
    async (messageId: string, text: string, targetLang?: string) => {
      console.log('[translate] translateMessage ENTRY', { messageId, targetLanguage: targetLang });
      const lang = targetLang ?? prefs.preferredLanguage;
      if (!text.trim()) return;
      const stateKey = `${messageId}:${lang}`;
      if (translatedMessages.has(stateKey) || pendingKeys.current.has(stateKey)) return;

      pendingKeys.current.add(stateKey);
      setTranslatingIds((prev) => new Set(prev).add(messageId));
      try {
        console.log('[translate] provider request start', { messageId, lang, text: text.slice(0, 60) });
        const result = await TranslationService.translateWithMeta(text, lang, { messageId });
        console.log('[translate] provider response', result);
        setTranslatedMessages((prev) => {
          const next = new Map(prev);
          next.set(stateKey, result.text);
          return next;
        });
        if (result.sourceLang) {
          setSourceLangs((prev) => {
            const next = new Map(prev);
            next.set(messageId, result.sourceLang!);
            return next;
          });
        }
      } catch (err) {
        console.error('[translate] ERROR', err);
        pendingKeys.current.delete(stateKey);
      } finally {
        pendingKeys.current.delete(stateKey);
        setTranslatingIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      }
    },
    [prefs.preferredLanguage, translatedMessages]
  );

  const batchTranslateMessages = useCallback(
    async (messages: Array<{ id: string; text: string }>, targetLang?: string) => {
      const lang = targetLang ?? prefs.preferredLanguage;

      // Filter to only uncached, non-pending messages
      const toTranslate = messages.filter(({ id, text }) => {
        if (!text.trim()) return false;
        const stateKey = `${id}:${lang}`;
        return !translatedMessages.has(stateKey) && !pendingKeys.current.has(stateKey);
      });

      if (toTranslate.length === 0) return;

      // Mark all as pending before dispatching
      for (const { id } of toTranslate) pendingKeys.current.add(`${id}:${lang}`);

      setTranslatingIds((prev) => {
        const next = new Set(prev);
        for (const { id } of toTranslate) next.add(id);
        return next;
      });

      try {
        const results = await TranslationService.translateBatch(
          toTranslate.map(({ id, text }) => ({ messageId: id, text })),
          lang
        );
        applyResults(results);
      } catch (err) {
        console.error('[translation] batchTranslateMessages error:', err);
        // Remove failed keys from pending so they can be retried
        for (const { id } of toTranslate) pendingKeys.current.delete(`${id}:${lang}`);
      } finally {
        setTranslatingIds((prev) => {
          const next = new Set(prev);
          for (const { id } of toTranslate) next.delete(id);
          return next;
        });
      }
    },
    [prefs.preferredLanguage, translatedMessages, applyResults]
  );

  const getTranslation = useCallback(
    (messageId: string, targetLang?: string): string | null => {
      const lang = targetLang ?? prefs.preferredLanguage;
      return translatedMessages.get(`${messageId}:${lang}`) ?? null;
    },
    [translatedMessages, prefs.preferredLanguage]
  );

  const getSourceLanguage = useCallback(
    (messageId: string, targetLang?: string): string | null => {
      // First try the in-component state (populated during this session)
      const fromState = sourceLangs.get(messageId) ?? null;
      if (fromState) return fromState;
      // Fallback to the service-level cache (restored from AsyncStorage)
      const lang = targetLang ?? prefs.preferredLanguage;
      return TranslationService.getSourceLang(messageId, lang);
    },
    [sourceLangs, prefs.preferredLanguage]
  );

  return (
    <TranslationContext.Provider
      value={{
        ...prefs,
        setPreferredLanguage,
        setAutoTranslate,
        setShowOriginalByDefault,
        translatedMessages,
        sourceLangs,
        translatingIds,
        translateMessage,
        batchTranslateMessages,
        getTranslation,
        getSourceLanguage,
        disabledChats,
        isChatTranslationEnabled,
        toggleChatTranslation,
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx) throw new Error('useTranslation must be used inside TranslationProvider');
  return ctx;
}
