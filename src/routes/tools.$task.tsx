import { createFileRoute, notFound } from '@tanstack/react-router';
import { useEffect } from 'react';
import { usePageHead } from '@/app/head';
import { TaskContext } from '@/app/task-context';
import { setTaskIntent, taskBySlug } from '@/app/tasks';
import { AudioEditorScreen } from '@/editors/audio/AudioEditorScreen';
import { GifEditorScreen } from '@/editors/gif/GifEditorScreen';
import { ImageEditorScreen } from '@/editors/image/ImageEditorScreen';
import { SubtitleEditorScreen } from '@/editors/subtitles/SubtitleEditorScreen';
import { VideoEditorScreen } from '@/editors/video/VideoEditorScreen';

const SCREENS = {
	video: VideoEditorScreen,
	image: ImageEditorScreen,
	gif: GifEditorScreen,
	audio: AudioEditorScreen,
	subtitles: SubtitleEditorScreen,
};

export const Route = createFileRoute('/tools/$task')({
	beforeLoad: ({ params }) => {
		// oxlint-disable-next-line only-throw-error -- how TanStack Router says a page doesn't exist
		if (!taskBySlug(params.task)) throw notFound();
	},
	component: function TaskPage() {
		const { task: slug } = Route.useParams();
		const task = taskBySlug(slug);
		// Set while rendering, so the editor finds it however soon a file opens, and again once
		// mounted, as React may unmount and mount again in between.
		const intent = task?.intent ?? null;
		setTaskIntent(intent);
		useEffect(() => {
			setTaskIntent(intent);
			return () => {
				setTaskIntent(null);
			};
		}, [intent]);
		usePageHead(task?.title() ?? null, task?.description());
		if (!task) return null;
		const Screen = SCREENS[task.editor];
		return (
			<TaskContext value={task}>
				<Screen key={slug} initialTool={task.tool} />
			</TaskContext>
		);
	},
});
