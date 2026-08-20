import type { ReactNode } from "react";
import {
	Dialog as AriaDialog,
	DialogTrigger,
	Heading,
	Modal,
	ModalOverlay,
} from "react-aria-components";
import { cn } from "../cn.ts";
import { IconButton } from "./icon-button.tsx";

export type DialogProps = {
	title: string;
	children: ReactNode | ((close: () => void) => ReactNode);
	isOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	closeLabel: string;
	size?: "sm" | "md" | "lg";
	/** When omitted the dialog is controlled by `isOpen`. */
	trigger?: ReactNode;
	className?: string;
};

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" } as const;

/** Focus trapping and restoration come from react-aria; only the skin is ours. */
export function Dialog({
	title,
	children,
	isOpen,
	onOpenChange,
	closeLabel,
	size = "md",
	trigger,
	className,
}: DialogProps) {
	const modal = (
		<ModalOverlay
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable
			className={cn(
				"fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]",
				"entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out",
			)}
		>
			<Modal
				className={cn(
					"w-full entering:animate-in entering:zoom-in-95 entering:slide-in-from-bottom-2 exiting:animate-out exiting:zoom-out-95",
					SIZES[size],
				)}
			>
				<AriaDialog
					className={cn(
						"flex max-h-[85dvh] flex-col overflow-hidden rounded-[var(--radius-container)]",
						"border border-[var(--border)] bg-[var(--bg-overlay)] shadow-[var(--shadow-overlay)] outline-none",
						className,
					)}
				>
					{({ close }) => (
						<>
							<div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3">
								<Heading slot="title" className="text-md font-medium text-[var(--text)]">
									{title}
								</Heading>
								<IconButton label={closeLabel} onPress={close} size="sm" hideTooltip>
									<svg
										aria-hidden
										width="12"
										height="12"
										viewBox="0 0 12 12"
										className="fill-none stroke-current stroke-[1.5]"
									>
										<path d="M2 2 L10 10 M10 2 L2 10" />
									</svg>
								</IconButton>
							</div>
							<div className="overflow-auto px-4 py-4">
								{typeof children === "function" ? children(close) : children}
							</div>
						</>
					)}
				</AriaDialog>
			</Modal>
		</ModalOverlay>
	);

	return trigger === undefined ? (
		modal
	) : (
		<DialogTrigger>
			{trigger}
			{modal}
		</DialogTrigger>
	);
}
