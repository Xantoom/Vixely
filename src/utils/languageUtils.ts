/** ISO 639-1 (2-letter) and ISO 639-2 (3-letter) language code lookup table. */
export const LANG_NAMES: Record<string, string> = {
	// 2-letter ISO 639-1
	en: 'English',
	fr: 'French',
	de: 'German',
	es: 'Spanish',
	it: 'Italian',
	ja: 'Japanese',
	zh: 'Chinese',
	ko: 'Korean',
	pt: 'Portuguese',
	ru: 'Russian',
	ar: 'Arabic',
	hi: 'Hindi',
	pl: 'Polish',
	tr: 'Turkish',
	nl: 'Dutch',
	sv: 'Swedish',
	no: 'Norwegian',
	da: 'Danish',
	fi: 'Finnish',
	cs: 'Czech',
	hu: 'Hungarian',
	ro: 'Romanian',
	th: 'Thai',
	vi: 'Vietnamese',
	// 3-letter ISO 639-2
	eng: 'English',
	fre: 'French',
	fra: 'French',
	deu: 'German',
	ger: 'German',
	spa: 'Spanish',
	ita: 'Italian',
	jpn: 'Japanese',
	zho: 'Chinese',
	chi: 'Chinese',
	kor: 'Korean',
	por: 'Portuguese',
	rus: 'Russian',
	ara: 'Arabic',
	hin: 'Hindi',
	pol: 'Polish',
	tur: 'Turkish',
	nld: 'Dutch',
	dut: 'Dutch',
	swe: 'Swedish',
	nor: 'Norwegian',
	dan: 'Danish',
	fin: 'Finnish',
	ces: 'Czech',
	cze: 'Czech',
	hun: 'Hungarian',
	ron: 'Romanian',
	rum: 'Romanian',
	tha: 'Thai',
	vie: 'Vietnamese',
	ind: 'Indonesian',
	may: 'Malay',
	msa: 'Malay',
	heb: 'Hebrew',
	ukr: 'Ukrainian',
	bul: 'Bulgarian',
	hrv: 'Croatian',
	slk: 'Slovak',
	slo: 'Slovak',
	slv: 'Slovenian',
	cat: 'Catalan',
	ell: 'Greek',
	gre: 'Greek',
	lat: 'Latin',
	fil: 'Filipino',
	tam: 'Tamil',
	tel: 'Telugu',
	ben: 'Bengali',
	urd: 'Urdu',
	per: 'Persian',
	fas: 'Persian',
};

/** Resolve a language code to a display name, or null for unknown/empty/undefined codes. */
export function getLanguageName(code?: string): string | null {
	if (!code?.trim()) return null;
	const lower = code.trim().toLowerCase();
	if (lower === 'und' || lower === 'unk') return null;
	return LANG_NAMES[lower] ?? code.toUpperCase();
}

/** Format an audio channel count as a human-readable label, or null when unknown. */
export function formatChannels(channels?: number): string | null {
	if (channels == null) return null;
	if (channels === 1) return 'Mono';
	if (channels === 2) return 'Stereo';
	if (channels === 6) return '5.1';
	if (channels === 8) return '7.1';
	return `${channels}ch`;
}
