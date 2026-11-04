import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';

/** Shown when a screen crashes, in place of the router's own message. */
export function ErrorScreen() {
	return (
		<main className="mx-auto grid min-h-full w-full max-w-[44rem] content-center justify-items-start gap-6 px-[clamp(1rem,4vw,2.5rem)] py-16">
			<h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-bold tracking-[-0.025em]">
				{m.error_title()}
			</h1>
			<p className="text-body text-ink-2">{m.error_body()}</p>
			<Button
				variant="primary"
				onClick={() => {
					location.reload();
				}}
			>
				{m.error_reload()}
			</Button>
		</main>
	);
}
