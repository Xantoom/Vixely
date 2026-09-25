import { m } from '@/paraglide/messages.js';

/**
 * Tells screen readers that an export started and ended, which the button only shows. A failure
 * is an alert of its own.
 */
export function ExportAnnounce({ status }: { status: 'idle' | 'saving' | 'saved' | 'failed' }) {
	return (
		<p role="status" className="sr-only">
			{status === 'saving' ? m.exporting() : status === 'saved' ? m.saved() : ''}
		</p>
	);
}
