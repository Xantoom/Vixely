/**
 * Monetag ad zone configuration.
 *
 * Set these in your `.env` file:
 *   VITE_MONETAG_FOOTER_ZONE=your_zone_id
 *   VITE_MONETAG_SIDEBAR_ZONE=your_zone_id
 *   VITE_MONETAG_EXPORT_ZONE=your_zone_id
 */
export const MONETAG_ZONES = {
	footer: import.meta.env.VITE_MONETAG_FOOTER_ZONE ?? '',
	sidebar: import.meta.env.VITE_MONETAG_SIDEBAR_ZONE ?? '',
	export: import.meta.env.VITE_MONETAG_EXPORT_ZONE ?? '',
} as const;

export type MonetagZone = keyof typeof MONETAG_ZONES;
