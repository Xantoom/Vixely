import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { EDITORS, type MediaKind, type ToolId } from '@/editors/registry';
import { useSubtitleProject } from '@/editors/subtitles/project';
import { MuxFooter, MuxTracks } from '@/editors/video/MuxPanel';
import { VideoPreview } from '@/editors/video/VideoPreview';
import { type OpenedFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { OptionList } from '@/ui/fields';
import { MEDIA_ICONS } from '@/ui/icons';
import { EditorLayout, PanelTitle } from './EditorLayout';
import { FilePanel, ToolLater } from './Inspector';
import { Timeline } from './Timeline';
import { Viewer } from './Viewer';

const OPEN_IN = {
	audio: () => m.audio_from_video(),
	gif: () => m.make_gif(),
	subtitles: () => m.subtitles_from_video(),
};

/**
 * Opens the current video in another editor: its soundtrack in the audio one, a GIF in the GIF
 * one, its subtitle tracks in the subtitle one.
 */
function OpenIn({ kind }: { kind: 'audio' | 'gif' | 'subtitles' }) {
	const openAs = useSession((state) => state.openAs);
	const navigate = useNavigate();
	const Icon = MEDIA_ICONS[kind];
	return (
		<Button
			onClick={() => {
				openAs(kind);
				void navigate({ to: EDITORS[kind].path });
			}}
		>
			<Icon size={16} aria-hidden="true" />
			{OPEN_IN[kind]()}
		</Button>
	);
}

/**
 * Export of the video as it is: its tracks copied, nothing re-encoded, the subtitles as the
 * subtitle editor left them. Converting comes with the video editor's own tools.
 */
function VideoExportPanel({ opened }: { opened: OpenedFile }) {
	return (
		<>
			<PanelTitle>{m.export_video_title()}</PanelTitle>
			<OptionList
				label={m.export_encoding()}
				value="copy"
				options={[
					{ value: 'copy', label: m.encoding_copy(), detail: opened.format.toUpperCase() },
					{ value: 'encode', label: m.encoding_convert(), disabled: true, reason: m.mux_convert_later() },
				]}
				onChange={() => {}}
			/>
			<MuxTracks opened={opened} />
		</>
	);
}

/** Screen for editors whose tools are not built yet: opens files and shows what they contain. */
export function EditorScreen({ kind, initialTool }: { kind: MediaKind; initialTool?: ToolId }) {
	const editor = EDITORS[kind];
	const current = useSession((state) => state.current);
	const opened = current?.kind === kind ? current : null;
	const [tool, setTool] = useState<ToolId>(
		initialTool && (editor.tools.includes(initialTool) || initialTool === 'export') ? initialTool : 'info',
	);
	const openProject = useSubtitleProject((state) => state.open);
	const video = kind === 'video' ? opened : null;

	// The subtitle tracks are read with the video, like a player lists them; the subtitle editor
	// then finds them, and its edits come back here.
	useEffect(() => {
		if (video) openProject({ ...video, kind: 'subtitles' });
	}, [video, openProject]);

	return (
		<EditorLayout
			kind={kind}
			fileName={opened?.file.name}
			tool={tool}
			onTool={setTool}
			actions={
				video
					? {
							canUndo: false,
							canRedo: false,
							onUndo: () => {},
							onRedo: () => {},
							onExport: () => {
								setTool('export');
							},
							exportActive: tool === 'export',
						}
					: undefined
			}
			viewer={
				kind === 'video' && opened?.info?.video?.decodable ? (
					<VideoPreview opened={opened} />
				) : (
					<Viewer kind={kind} opened={opened} />
				)
			}
			timeline={
				editor.timed && opened ? (
					<Timeline file={opened.file} info={opened.info} poster={opened.poster} />
				) : undefined
			}
			inspector={
				video && tool === 'export' ? (
					<VideoExportPanel opened={video} />
				) : tool === 'info' ? (
					<>
						<FilePanel opened={opened} />
						{kind === 'video' && opened && (
							<div className="grid gap-2">
								{opened.info?.video?.decodable && <OpenIn kind="gif" />}
								{opened.info?.audio && <OpenIn kind="audio" />}
								<OpenIn kind="subtitles" />
							</div>
						)}
					</>
				) : (
					<ToolLater kind={kind} tool={tool} />
				)
			}
			inspectorFooter={video && tool === 'export' ? <MuxFooter opened={video} /> : undefined}
		/>
	);
}
