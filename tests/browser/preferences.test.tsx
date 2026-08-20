import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { en } from "~/i18n/locales/en.ts";
import { LOCALES } from "~/i18n/types.ts";
import { createTranslate } from "~/i18n/config.ts";
import { loadLocale } from "~/i18n/config.ts";
import {
	applyTheme,
	resolveTheme,
	THEME_BOOTSTRAP_SOURCE,
	usePreferences,
} from "~/stores/preferences.ts";
import { LanguageMenu, ThemeMenu } from "~/ui/preferences-controls.tsx";

const STORAGE_KEY = "vixely.preferences";

/**
 * Runs the bootstrap the way the browser does, from a script element rather
 * than through `eval` — which is also what the CSP allows.
 */
function runBootstrap(): void {
	const script = document.createElement("script");
	script.textContent = THEME_BOOTSTRAP_SOURCE;
	document.head.append(script);
	script.remove();
}

function storedState(): Record<string, unknown> {
	const raw = localStorage.getItem(STORAGE_KEY);
	return raw === null ? {} : (JSON.parse(raw).state as Record<string, unknown>);
}

beforeEach(() => {
	localStorage.removeItem(STORAGE_KEY);
	document.documentElement.removeAttribute("data-theme");
	// `messages` too: the store is a module singleton shared across test files.
	usePreferences.setState({
		theme: "system",
		locale: "en",
		localeChosenByUser: false,
		messages: en,
	});
});

afterEach(() => {
	cleanup();
	localStorage.removeItem(STORAGE_KEY);
	document.documentElement.removeAttribute("data-theme");
});

describe("theme switching", () => {
	it("resolves the system position from the OS preference", () => {
		expect(resolveTheme("system", true)).toBe("dark");
		expect(resolveTheme("system", false)).toBe("light");
		expect(resolveTheme("dark", false)).toBe("dark");
		expect(resolveTheme("light", true)).toBe("light");
	});

	it("removes data-theme under `system` so the media query takes over", () => {
		applyTheme("dark");
		expect(document.documentElement.dataset["theme"]).toBe("dark");
		applyTheme("system");
		expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
	});

	it("walks all three positions from the menu and writes the attribute", async () => {
		render(<ThemeMenu />);
		for (const position of ["Dark", "Light", "System"] as const) {
			await userEvent.click(page.getByRole("button"));
			await userEvent.click(page.getByRole("menuitem", { name: position }));
			if (position === "System") {
				expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
			} else {
				expect(document.documentElement.dataset["theme"]).toBe(position.toLowerCase());
			}
		}
	});

	it("persists the choice so it survives a reload", async () => {
		render(<ThemeMenu />);
		await userEvent.click(page.getByRole("button"));
		await userEvent.click(page.getByRole("menuitem", { name: "Dark" }));

		expect(storedState()["theme"]).toBe("dark");

		// The inline head script is what restores the theme before React runs,
		// which is what prevents a flash of the wrong theme on reload.
		document.documentElement.removeAttribute("data-theme");
		runBootstrap();
		expect(document.documentElement.dataset["theme"]).toBe("dark");
	});

	it("leaves nothing behind when no preference was ever stored", () => {
		runBootstrap();
		expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
	});
});

describe("language switching", () => {
	it("switches the interface and records the choice", async () => {
		render(<LanguageMenu />);
		// Located by role alone: the accessible name is the very thing under
		// test, so using it as the selector would beg the question.
		const trigger = page.getByRole("button");
		await expect.element(trigger).toHaveAccessibleName("Language");

		await userEvent.click(trigger);
		await userEvent.click(page.getByRole("menuitem", { name: "Français" }));

		await expect.element(trigger).toHaveTextContent("fr");
		await expect.element(trigger).toHaveAccessibleName("Langue");
		expect(storedState()["locale"]).toBe("fr");
		// Marked as a deliberate choice, so the OS locale no longer overrides it.
		expect(storedState()["localeChosenByUser"]).toBe(true);
		expect(document.documentElement.lang).toBe("fr");
	});

	it("renders real copy in every one of the seven locales", async () => {
		for (const locale of LOCALES) {
			const messages = await loadLocale(locale);
			const t = createTranslate(messages);
			expect(t("action.export").length).toBeGreaterThan(0);
			expect(t("export.progress", { percent: 40 })).toContain("40");
			expect(t("canvas.zoomLevel", { percent: 150 })).toContain("150");
		}
	});
});
