import { useMemo } from "react";
import { createTranslate } from "~/i18n/config.ts";
import type { Locale, Translate } from "~/i18n/types.ts";
import { usePreferences } from "~/stores/preferences.ts";

/** The single way components read copy. Keys are typed, so a typo fails tsc. */
export function useTranslate(): Translate {
	const messages = usePreferences((state) => state.messages);
	return useMemo(() => createTranslate(messages), [messages]);
}

export function useLocale(): Locale {
	return usePreferences((state) => state.locale);
}
