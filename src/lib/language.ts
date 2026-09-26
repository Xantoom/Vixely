import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

/** ISO 639-2 bibliographic codes, as Matroska writes them, and their two-letter form. */
const LANGUAGE_CODES: Record<string, string> = {
	fre: 'fr',
	ger: 'de',
	dut: 'nl',
	chi: 'zh',
	cze: 'cs',
	gre: 'el',
	per: 'fa',
	rum: 'ro',
	slo: 'sk',
	alb: 'sq',
	arm: 'hy',
	baq: 'eu',
	bur: 'my',
	geo: 'ka',
	ice: 'is',
	mac: 'mk',
	mao: 'mi',
	may: 'ms',
	tib: 'bo',
	wel: 'cy',
};

/** `fre` → `French`, in the interface language; the code itself when unknown. */
export function languageName(code: string): string {
	if (!code || code === 'und') return m.subs_language_unknown();
	try {
		const name = new Intl.DisplayNames([getLocale()], { type: 'language' }).of(LANGUAGE_CODES[code] ?? code);
		return name && name !== code ? name.charAt(0).toUpperCase() + name.slice(1) : code;
	} catch {
		return code;
	}
}

/** A track as players name it: its language, then its own name; an unknown language is left out when the track has a name. */
export function trackName(language: string, name: string | null | undefined): string {
	const known = language && language !== 'und' ? languageName(language) : '';
	if (!known) return name || languageName(language);
	return [known, name].filter(Boolean).join(', ');
}

/** How many channels a track has, as players say it: mono, stereo, 5.1. */
export function channelLayout(channels: number): string {
	if (channels === 1) return m.channels_mono();
	if (channels === 2) return m.channels_stereo();
	if (channels === 6) return '5.1';
	if (channels === 8) return '7.1';
	return m.channels_count({ count: channels });
}
