import { useLeaveGuard, useWakeLock } from '@/app/leave-guard';
import { ranOutOfStorage } from '@/media/save-target';
import { m } from '@/paraglide/messages.js';

/**
 * Tells screen readers that an export started and ended, which the button only shows (a failure
 * is an alert of its own), asks before the tab closes while it runs and keeps the screen on.
 */
export function ExportAnnounce({ status }: { status: 'idle' | 'saving' | 'saved' | 'failed' }) {
	useLeaveGuard(status === 'saving');
	useWakeLock(status === 'saving');
	if (status === 'failed' && ranOutOfStorage()) {
		return (
			<p role="alert" className="text-small text-danger">
				{m.export_storage_full()}
			</p>
		);
	}
	return (
		<p role="status" className="sr-only">
			{status === 'saving' ? m.exporting() : status === 'saved' ? m.saved() : ''}
		</p>
	);
}
