import { type ReactNode } from 'react';
import { EditorToolTray } from '@/components/editor/EditorToolTray.tsx';
import { FloatingPanel } from '@/components/ui/FloatingPanel.tsx';
import { HalfSheet } from '@/components/ui/HalfSheet.tsx';
import { InspectorPane } from '@/components/ui/InspectorPane.tsx';
import { useEditorLayoutPrefs, type EditorKey } from '@/hooks/useEditorLayoutPrefs.ts';

/** Fixed sidebar width per layout tier */
const SIDEBAR_WIDTH = { desktop: 340, ultrawide: 380 } as const;

interface EditorShellProps {
	editor: EditorKey;
	main: ReactNode;
	/** The panel content (rendered inside the sidebar/sheet/floating panel) */
	sidebar?: ReactNode;
	/** The ToolRail element — rendered differently per breakpoint */
	toolRail?: ReactNode;
	timeline?: ReactNode;
	overlays?: ReactNode;
	sidebarLabel?: string;
	hasFile?: boolean;
	/** Whether a tool panel is currently open (for tablet floating panel) */
	toolPanelOpen?: boolean;
	/** Called when the tablet floating panel should close */
	onToolPanelClose?: () => void;
}

export function EditorShell({
	editor,
	main,
	sidebar,
	toolRail,
	timeline,
	overlays,
	sidebarLabel = 'inspector',
	hasFile = false,
	toolPanelOpen = false,
	onToolPanelClose,
}: EditorShellProps) {
	const { tier, sidebarOpen, setSidebarOpen } = useEditorLayoutPrefs({ editor });

	const showSidebar = hasFile && sidebar;
	const isMobile = tier === 'mobile';
	const isTablet = tier === 'tablet';
	const isUltrawide = tier === 'ultrawide';
	const sidebarWidth = isUltrawide ? SIDEBAR_WIDTH.ultrawide : SIDEBAR_WIDTH.desktop;

	return (
		<div data-editor={editor} className="h-full flex flex-col">
			<div className="h-0.5 gradient-accent shrink-0" />

			<div className={`flex-1 min-h-0 flex ${isUltrawide ? 'justify-center' : ''}`}>
				<div
					className={`flex flex-1 min-h-0 min-w-0 overflow-hidden ${isUltrawide ? 'max-w-[1920px] w-full border-x border-border/30' : ''}`}
				>
					{/* Main content + timeline + mobile tool tray */}
					<div className="flex-1 flex flex-col min-w-0 animate-fade-in">
						{main}
						{timeline}

						{/* Mobile: Tool Tray + Half-Sheet */}
						{showSidebar && isMobile && (
							<>
								{toolRail && <EditorToolTray>{toolRail}</EditorToolTray>}
								<HalfSheet
									open={sidebarOpen}
									onClose={() => {
										setSidebarOpen(false);
									}}
								>
									{sidebar}
								</HalfSheet>
							</>
						)}
					</div>

					{/* Desktop / Ultrawide: Fixed Inspector */}
					{showSidebar && !isMobile && !isTablet && (
						<InspectorPane width={sidebarWidth} ariaLabel={sidebarLabel}>
							{toolRail && (
								<div className="shrink-0 border-b border-border/70 bg-surface-raised/15">
									{toolRail}
								</div>
							)}
							<div className="flex-1 min-h-0 overflow-hidden flex flex-col">{sidebar}</div>
						</InspectorPane>
					)}

					{/* Tablet: Vertical ToolRail + Floating Panel */}
					{showSidebar && isTablet && (
						<div className="relative flex shrink-0">
							{toolRail && (
								<div className="shrink-0 border-l border-border bg-surface flex flex-col">
									{toolRail}
								</div>
							)}
							<FloatingPanel
								open={toolPanelOpen}
								onClose={onToolPanelClose ?? (() => {})}
								width={320}
								ariaLabel={sidebarLabel}
							>
								{sidebar}
							</FloatingPanel>
						</div>
					)}
				</div>
			</div>

			{overlays}
		</div>
	);
}
