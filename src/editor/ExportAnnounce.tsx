import { useLeaveGuard } from '@/app/leave-guard';
import { m } from '@/paraglide/messages.js';

/**
 * Tells screen readers that an export started and ended, which the button only shows (a failure
 * is an alert of its own), and asks before the tab closes while it runs.
 */
export function ExportAnnounce({ status }: { status: 'idle' | 'saving' | 'saved' | 'failed' }) {
	useLeaveGuard(status === 'saving');
	return (
		<p role="status" className="sr-only">
			{status === 'saving' ? m.exporting() : status === 'saved' ? m.saved() : ''}
		</p>
	);
}
