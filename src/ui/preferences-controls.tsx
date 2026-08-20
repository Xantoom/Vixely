import { LOCALE_NAMES, LOCALES, type Locale } from "~/i18n/types.ts";
import { usePreferences, type ThemePreference } from "~/stores/preferences.ts";
import { IconButton } from "./primitives/icon-button.tsx";
import { Menu } from "./primitives/menu.tsx";
import { useTranslate } from "./hooks/use-translate.ts";

const THEME_ORDER: readonly ThemePreference[] = ["system", "light", "dark"];

export function ThemeMenu() {
	const t = useTranslate();
	const theme = usePreferences((state) => state.theme);
	const setTheme = usePreferences((state) => state.setTheme);

	return (
		<Menu
			label={t("theme.label")}
			trigger={
				<IconButton label={t("theme.label")} size="sm" hideTooltip>
					<ThemeIcon theme={theme} />
				</IconButton>
			}
			entries={THEME_ORDER.map((value) => ({
				type: "item" as const,
				id: value,
				label: t(`theme.${value}` as "theme.system"),
				icon: <ThemeIcon theme={value} />,
			}))}
			onAction={(id) => setTheme(id)}
		/>
	);
}

export function LanguageMenu() {
	const t = useTranslate();
	const locale = usePreferences((state) => state.locale);
	const setLocale = usePreferences((state) => state.setLocale);

	return (
		<Menu
			label={t("language.label")}
			trigger={
				<IconButton label={t("language.label")} size="sm" hideTooltip>
					<span className="text-2xs font-semibold uppercase">{locale}</span>
				</IconButton>
			}
			entries={LOCALES.map((value) => ({
				type: "item" as const,
				id: value,
				label: LOCALE_NAMES[value],
			}))}
			onAction={(id: Locale) => {
				void setLocale(id);
			}}
		/>
	);
}

function ThemeIcon({ theme }: { theme: ThemePreference }) {
	if (theme === "light") {
		return (
			<svg
				aria-hidden
				width="14"
				height="14"
				viewBox="0 0 16 16"
				className="fill-none stroke-current stroke-[1.4]"
			>
				<circle cx="8" cy="8" r="3.2" />
				<path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.2 1.2M11.8 11.8L13 13M13 3l-1.2 1.2M4.2 11.8L3 13" />
			</svg>
		);
	}
	if (theme === "dark") {
		return (
			<svg
				aria-hidden
				width="14"
				height="14"
				viewBox="0 0 16 16"
				className="fill-none stroke-current stroke-[1.4]"
			>
				<path d="M13 9.5A5.6 5.6 0 0 1 6.5 3a5.6 5.6 0 1 0 6.5 6.5Z" />
			</svg>
		);
	}
	return (
		<svg
			aria-hidden
			width="14"
			height="14"
			viewBox="0 0 16 16"
			className="fill-none stroke-current stroke-[1.4]"
		>
			<rect x="1.5" y="3" width="13" height="8.5" rx="1" />
			<path d="M5.5 14h5" />
		</svg>
	);
}
