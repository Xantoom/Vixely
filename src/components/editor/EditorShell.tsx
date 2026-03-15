import { Settings } from 'lucide-react';
import { type ReactNode } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet.tsx';
import { InspectorPane } from '@/components/ui/InspectorPane.tsx';
import { useEditorLayoutPrefs, type EditorKey, type EditorStage } from '@/hooks/useEditorLayoutPrefs.ts';

/** Fixed sidebar width per layout tier */
const SIDEBAR_WIDTH = { desktop: 340, ultrawide: 380 } as const;

interface EditorShellProps {
	editor: EditorKey;
	main: ReactNode;
	sidebar?: ReactNode;
	timeline?: ReactNode;
	overlays?: ReactNode;
	sidebarLabel?: string;
	hasFile?: boolean;
	stage?: EditorStage;
	onStageChange?: (stage: EditorStage) => void;
}

export function EditorShell({
	editor,
	main,
	sidebar,
	timeline,
	overlays,
	sidebarLabel = 'inspector',
	hasFile = false,
}: EditorShellProps) {
	const { tier, sidebarOpen, sidebarCollapsed, setSidebarOpen, toggleSidebarCollapsed } = useEditorLayoutPrefs({
		editor,
		defaultInspectorWidth: 340,
		defaultStage: 'source',
	});

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
					{/* Main content + timeline */}
					<div className="flex-1 flex flex-col min-w-0 animate-fade-in">
						{main}
						{timeline}
					</div>

					{/* Desktop / Ultrawide */}
					{showSidebar && !isMobile && !isTablet && (
						<InspectorPane width={sidebarWidth} ariaLabel={sidebarLabel}>
							{sidebar}
						</InspectorPane>
					)}

					{/* Tablet: Collapsible */}
					{showSidebar && isTablet && (
						<InspectorPane
							width={sidebarWidth}
							ariaLabel={sidebarLabel}
							collapsible
							collapsed={sidebarCollapsed}
							onToggleCollapse={toggleSidebarCollapsed}
						>
							{sidebar}
						</InspectorPane>
					)}
				</div>
			</div>

			{/* Mobile: FAB + BottomSheet */}
			{showSidebar && isMobile && (
				<>
					<button
						className="fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full gradient-accent flex items-center justify-center shadow-lg cursor-pointer"
						onClick={() => {
							setSidebarOpen(true);
						}}
						type="button"
						aria-label={`Open ${editor} settings`}
						title={`Open ${editor} settings`}
					>
						<Settings size={20} className="text-white" />
					</button>
					<BottomSheet
						open={sidebarOpen}
						onClose={() => {
							setSidebarOpen(false);
						}}
					>
						{sidebar}
					</BottomSheet>
				</>
			)}

			{overlays}
		</div>
	);
}
