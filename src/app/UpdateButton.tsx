import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Alert } from '@/ui/Alert';
import { Button } from '@/ui/Button';
import { useLocale } from './locale';
import { applyUpdate, usePwa } from './pwa';

/**
 * A new version is ready while a file is open: without one it takes over by itself (main.tsx).
 * Loading it closes the file, so the button says what that means before doing it.
 */
export function UpdateButton() {
	useLocale();
	const ready = usePwa((state) => state.updateReady);
	const fileOpen = useSession((state) => Object.keys(state.opened).length > 0 || state.batch !== null);
	const [asking, setAsking] = useState(false);
	if (!ready) return null;
	return (
		<>
			<Button
				variant="primary"
				title={m.app_update_title()}
				aria-label={m.app_update()}
				onClick={() => {
					if (fileOpen) setAsking(true);
					else applyUpdate();
				}}
				className="mr-1 h-8 gap-1.5 px-3 max-sm:w-8 max-sm:px-0"
			>
				<RefreshCw className="size-4 flex-none" aria-hidden="true" />
				<span className="max-sm:hidden">{m.app_update_short()}</span>
			</Button>
			{asking && (
				<Alert
					title={m.app_update_title()}
					icon={<RefreshCw className="text-fg-muted size-5" aria-hidden="true" />}
					onClose={() => {
						setAsking(false);
					}}
					actions={
						<>
							<Button
								onClick={() => {
									setAsking(false);
								}}
							>
								{m.app_update_later()}
							</Button>
							<Button
								variant="primary"
								onClick={() => {
									applyUpdate();
								}}
							>
								{m.app_update_short()}
							</Button>
						</>
					}
				>
					{m.app_update_body()}
				</Alert>
			)}
		</>
	);
}
