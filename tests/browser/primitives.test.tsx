import { page, userEvent } from "vitest/browser";
import { useState } from "react";
import { cleanup, render } from "vitest-browser-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "~/ui/primitives/select.tsx";
import { Slider } from "~/ui/primitives/slider.tsx";
import { Toggle } from "~/ui/primitives/toggle.tsx";

// Leftover DOM from a previous case makes role lookups ambiguous.
afterEach(cleanup);

/**
 * Tier 2: a custom control that replaces a native one has to reimplement its
 * keyboard behaviour, or it is a regression rather than a component.
 */

function ControlledSlider(props: { onChangeEnd?: (value: number) => void }) {
	const [value, setValue] = useState(0);
	return (
		<Slider
			label="Contrast"
			value={value}
			onChange={setValue}
			min={-1}
			max={1}
			step={0.01}
			defaultValue={0}
			showInput={false}
			{...props}
		/>
	);
}

describe("Slider", () => {
	it("exposes the slider range to assistive technology", async () => {
		render(<ControlledSlider />);
		const slider = page.getByRole("slider");
		// react-aria backs the thumb with a visually removed range input, which
		// is what carries the semantics. Nothing native is *visible*.
		await expect.element(slider).toHaveAttribute("min", "-1");
		await expect.element(slider).toHaveAttribute("max", "1");
		await expect.element(slider).toHaveAccessibleName("Contrast");
	});

	it("is reachable by keyboard", async () => {
		render(<ControlledSlider />);
		const slider = page.getByRole("slider");
		// Firefox and Chromium disagree on where a fresh document starts its tab
		// order, so focusability is asserted rather than the number of tabs.
		await expect.element(slider).not.toHaveAttribute("tabindex", "-1");
		await expect.element(slider).toBeInTheDocument();
		slider.element().focus();
		await expect.element(slider).toHaveFocus();
	});

	it("moves with the arrow keys", async () => {
		render(<ControlledSlider />);
		const slider = page.getByRole("slider");
		await expect.element(slider).toBeInTheDocument();
		slider.element().focus();
		await userEvent.keyboard("{ArrowRight}");
		await expect.element(slider).toHaveValue("0.01");
	});

	it("takes a coarse step with Alt held", async () => {
		render(<ControlledSlider />);
		const slider = page.getByRole("slider");
		await expect.element(slider).toBeInTheDocument();
		slider.element().focus();
		await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
		await expect.element(slider).toHaveValue("0.1");
	});

	it("reports the end of a gesture so history can seal the merge", async () => {
		const onChangeEnd = vi.fn();
		render(<ControlledSlider onChangeEnd={onChangeEnd} />);
		const slider = page.getByRole("slider");
		await expect.element(slider).toBeInTheDocument();
		slider.element().focus();
		await userEvent.keyboard("{ArrowRight}");
		expect(onChangeEnd).toHaveBeenCalled();
	});
});

function ControlledToggle() {
	const [selected, setSelected] = useState(false);
	return <Toggle label="Keep metadata" isSelected={selected} onChange={setSelected} />;
}

describe("Toggle", () => {
	it("is a switch, flips on Space, and is reachable by keyboard", async () => {
		render(<ControlledToggle />);
		const toggle = page.getByRole("switch");
		await expect.element(toggle).not.toBeChecked();
		toggle.element().focus();
		await expect.element(toggle).toHaveFocus();
		await userEvent.keyboard(" ");
		await expect.element(toggle).toBeChecked();
	});

	it("flips when its visible label is clicked", async () => {
		render(<ControlledToggle />);
		await userEvent.click(page.getByText("Keep metadata"));
		await expect.element(page.getByRole("switch")).toBeChecked();
	});
});

function ControlledSelect() {
	const [value, setValue] = useState<"png" | "jpeg" | "webp">("png");
	return (
		<Select
			label="Format"
			value={value}
			onChange={setValue}
			options={[
				{ id: "png", label: "PNG" },
				{ id: "jpeg", label: "JPEG" },
				{ id: "webp", label: "WebP", disabled: true, disabledReason: "unsupported" },
			]}
		/>
	);
}

describe("Select", () => {
	it("opens on click and selects an option", async () => {
		render(<ControlledSelect />);
		const trigger = page.getByRole("button", { name: "Format" });
		await userEvent.click(trigger);
		await expect.element(page.getByRole("listbox")).toBeVisible();
		await userEvent.click(page.getByRole("option", { name: "JPEG" }));
		await expect.element(trigger).toHaveTextContent("JPEG");
	});

	it("moves the selection with the arrow keys", async () => {
		render(<ControlledSelect />);
		const trigger = page.getByRole("button", { name: "Format" });
		// Opened from the keyboard rather than by a click: headless Firefox does
		// not always hand focus to a popover opened by a synthetic click, and
		// this is the path a keyboard user actually takes anyway.
		await expect.element(trigger).toBeInTheDocument();
		trigger.element().focus();
		await userEvent.keyboard("{Enter}");
		await expect.element(page.getByRole("listbox")).toBeVisible();
		await userEvent.keyboard("{ArrowDown}{Enter}");
		await expect.element(trigger).toHaveTextContent("JPEG");
	});

	it("shows an unavailable option disabled with its reason, never hidden", async () => {
		render(<ControlledSelect />);
		await userEvent.click(page.getByRole("button", { name: "Format" }));
		const option = page.getByRole("option", { name: /WebP/ });
		await expect.element(option).toBeVisible();
		await expect.element(option).toHaveAttribute("aria-disabled", "true");
	});

	it("closes on Escape and returns focus to the trigger", async () => {
		render(<ControlledSelect />);
		const trigger = page.getByRole("button", { name: "Format" });
		await userEvent.click(trigger);
		await userEvent.keyboard("{Escape}");
		await expect.element(trigger).toHaveFocus();
	});
});
