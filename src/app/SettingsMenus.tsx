import { Monitor, Moon, Sun } from 'lucide-react';
import { m } from '@/paraglide/messages.js';
import { locales } from '@/paraglide/runtime.js';
import { Flag } from '@/ui/Flag';
import { Menu } from '@/ui/Menu';
import { changeLocale, LOCALE_NAMES, useLocale } from './locale';
import { setThemeMode, type ThemeMode, useTheme } from './theme';

/** The language of the interface: the current one's flag, a menu of the others. */
export function LanguageMenu() {
	const locale = useLocale();
	return (
		<Menu
			label={m.language_menu()}
			title={m.language_menu()}
			value={locale}
			items={locales.map((code) => ({ value: code, label: LOCALE_NAMES[code], leading: <Flag locale={code} /> }))}
			onChange={changeLocale}
		>
			<Flag locale={locale} />
		</Menu>
	);
}

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

/** Light, dark or the system's theme; the button shows the mode chosen. */
export function ThemeMenu() {
	const { mode } = useTheme();
	const Icon = THEME_ICONS[mode];
	const labels: Record<ThemeMode, string> = {
		light: m.theme_light(),
		dark: m.theme_dark(),
		system: m.theme_system(),
	};
	return (
		<Menu
			label={m.theme_menu()}
			title={m.theme_menu()}
			value={mode}
			items={(['light', 'dark', 'system'] as const).map((id) => {
				const ItemIcon = THEME_ICONS[id];
				return {
					value: id,
					label: labels[id],
					leading: <ItemIcon className="size-[1.05rem]" aria-hidden="true" />,
				};
			})}
			onChange={setThemeMode}
		>
			<Icon className="size-5" aria-hidden="true" />
		</Menu>
	);
}
