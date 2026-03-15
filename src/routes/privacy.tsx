import { createFileRoute, Link } from '@tanstack/react-router';
import { Seo } from '@/components/Seo.tsx';

export const Route = createFileRoute('/privacy')({ component: PrivacyPage });

function PrivacyPage() {
	return (
		<>
			<Seo
				title="Privacy Policy — Vixely"
				description="Vixely privacy policy. Your files stay on your device and are never uploaded. GDPR compliant."
				path="/privacy"
			/>

			<div className="max-w-2xl mx-auto px-8 py-16 animate-fade-in overflow-y-auto h-full">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-[14px] text-text-tertiary hover:text-text-secondary transition-colors mb-8"
				>
					<svg
						className="h-3.5 w-3.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					>
						<path d="M19 12H5M12 19l-7-7 7-7" />
					</svg>
					Back to Vixely
				</Link>

				<h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
				<p className="mt-2 text-sm text-text-tertiary">Last updated: March 2026</p>

				<div className="mt-10 flex flex-col gap-8 text-sm text-text-secondary leading-relaxed">
					<Section title="The short version">
						<p>
							Vixely processes everything locally in your browser. Your files{' '}
							<strong className="text-text">never leave your device</strong>. We don't upload, store, or
							have access to any media you edit.
						</p>
					</Section>

					<Section title="Data controller">
						<p>
							The data controller for Vixely is the publisher identified in the{' '}
							<Link to="/legal" className="underline text-accent hover:text-accent/80 transition-colors">
								Legal Notice
							</Link>
							. For any privacy-related inquiries, contact us at{' '}
							<strong className="text-text">contact@vixely.app</strong>.
						</p>
					</Section>

					<Section title="What data we collect">
						<p>
							<strong className="text-text">Your media files:</strong> None. All video, image, and GIF
							processing runs client-side via WebAssembly. No file data is transmitted to any server.
						</p>
						<p className="mt-2">
							<strong className="text-text">Personal data:</strong> We do not require account creation. We
							do not collect names, email addresses, or any personally identifiable information.
						</p>
						<p className="mt-2">
							<strong className="text-text">Technical data:</strong> Our hosting provider (Railway) may
							log standard server access data (IP addresses, timestamps, browser user agent) as part of
							normal web server operations. This data is managed by Railway under their own privacy
							policy.
						</p>
					</Section>

					<Section title="Cookies and local storage">
						<p>Vixely uses the following categories of cookies and local storage:</p>
						<div className="mt-3 space-y-3">
							<CookieCategory
								name="Essential"
								description="Required for the app to function properly. These store your cookie consent preferences and editor settings (layout preferences, tool states). No personal data is stored."
								canDisable={false}
							/>
							<CookieCategory
								name="Analytics"
								description="When enabled, we may use Google Analytics to collect anonymous, aggregated usage data (page views, feature usage counts) to improve the product. This data is processed by Google under their privacy policy. These cookies are only activated with your explicit consent."
								canDisable={true}
							/>
							<CookieCategory
								name="Advertising"
								description="When enabled, Google AdSense may set cookies to display relevant advertisements and help support the project. Ad cookies collect browsing behavior data and are processed by Google. These cookies are only activated with your explicit consent."
								canDisable={true}
							/>
						</div>
						<p className="mt-3">
							You can manage your cookie preferences at any time using the cookie settings accessible from
							the bottom of any page.
						</p>
					</Section>

					<Section title="Third-party services">
						<p>Vixely may use the following third-party services:</p>
						<ul className="mt-2 list-disc pl-5 space-y-1">
							<li>
								<strong className="text-text">Google Fonts</strong> — loaded for typography. Google may
								collect usage data (see{' '}
								<a
									href="https://policies.google.com/privacy"
									target="_blank"
									rel="noopener noreferrer"
									className="underline text-accent hover:text-accent/80 transition-colors"
								>
									Google Privacy Policy
								</a>
								).
							</li>
							<li>
								<strong className="text-text">Google Analytics</strong> — anonymous usage analytics,
								only with your consent.
							</li>
							<li>
								<strong className="text-text">Google AdSense</strong> — advertising, only with your
								consent.
							</li>
							<li>
								<strong className="text-text">Railway</strong> — hosting provider for the website.
							</li>
							<li>
								<strong className="text-text">Cloudflare</strong> — DNS and CDN services.
							</li>
						</ul>
						<p className="mt-2">
							All media processing libraries (Mediabunny, WASM modules) are bundled locally and do not
							make external network requests.
						</p>
					</Section>

					<Section title="Data security">
						<p>
							Because your files never leave your browser, the risk of data breach from file processing is
							inherently eliminated. We use HTTPS for all page loads and set appropriate security headers
							(COOP/COEP) for WebAssembly compatibility.
						</p>
					</Section>

					<Section title="International data transfers">
						<p>
							Our hosting provider (Railway) and DNS provider (Cloudflare) operate servers globally,
							including in the United States. If you are located in the EU/EEA, standard web requests may
							involve data transfers to countries outside the EU/EEA. These providers offer appropriate
							safeguards for data transfers.
						</p>
					</Section>

					<Section title="Your rights under GDPR">
						<p>
							If you are located in the European Union or European Economic Area, you have the following
							rights regarding your personal data:
						</p>
						<ul className="mt-2 list-disc pl-5 space-y-1">
							<li>
								<strong className="text-text">Right of access</strong> — request a copy of any personal
								data we hold about you
							</li>
							<li>
								<strong className="text-text">Right to rectification</strong> — request correction of
								inaccurate data
							</li>
							<li>
								<strong className="text-text">Right to erasure</strong> — request deletion of your data
								("right to be forgotten")
							</li>
							<li>
								<strong className="text-text">Right to data portability</strong> — receive your data in
								a structured, machine-readable format
							</li>
							<li>
								<strong className="text-text">Right to object</strong> — object to processing based on
								legitimate interests
							</li>
							<li>
								<strong className="text-text">Right to restrict processing</strong> — request limitation
								of processing in certain circumstances
							</li>
							<li>
								<strong className="text-text">Right to withdraw consent</strong> — withdraw consent at
								any time via cookie settings
							</li>
						</ul>
						<p className="mt-2">
							Since Vixely collects minimal personal data, most of these rights are automatically
							satisfied. You can clear your browser's local storage at any time to reset all preferences.
						</p>
					</Section>

					<Section title="Right to complain">
						<p>
							You have the right to lodge a complaint with a supervisory authority. For France, this is
							the{' '}
							<a
								href="https://www.cnil.fr"
								target="_blank"
								rel="noopener noreferrer"
								className="underline text-accent hover:text-accent/80 transition-colors"
							>
								CNIL
							</a>{' '}
							(Commission Nationale de l'Informatique et des Libertés).
						</p>
					</Section>

					<Section title="Data retention">
						<p>
							Local storage data (preferences, cookie consent) is retained in your browser until you clear
							it. Server-side access logs (managed by Railway) are retained according to Railway's data
							retention policy.
						</p>
					</Section>

					<Section title="Children's privacy">
						<p>
							Vixely is not directed at children under 16. We do not knowingly collect personal data from
							children. If we become aware that we have collected personal data from a child under 16, we
							will take steps to delete it.
						</p>
					</Section>

					<Section title="Changes to this policy">
						<p>
							We may update this privacy policy from time to time. Changes will be posted on this page
							with an updated revision date. Your continued use of Vixely after changes constitutes
							acceptance of the updated policy.
						</p>
					</Section>

					<Section title="Contact">
						<p>
							Questions about this policy? Contact us at{' '}
							<strong className="text-text">contact@vixely.app</strong> or visit our{' '}
							<Link to="/legal" className="underline text-accent hover:text-accent/80 transition-colors">
								Legal Notice
							</Link>{' '}
							page.
						</p>
					</Section>
				</div>
			</div>
		</>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section>
			<h2 className="text-base font-semibold text-text mb-2">{title}</h2>
			{children}
		</section>
	);
}

function CookieCategory({ name, description, canDisable }: { name: string; description: string; canDisable: boolean }) {
	return (
		<div className="rounded-lg border border-border bg-bg/50 p-3">
			<div className="flex items-center justify-between mb-1">
				<span className="text-[13px] font-semibold text-text">{name}</span>
				<span
					className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
						canDisable ? 'bg-surface-raised text-text-tertiary' : 'bg-accent/10 text-accent'
					}`}
				>
					{canDisable ? 'Optional' : 'Required'}
				</span>
			</div>
			<p className="text-[12px] text-text-tertiary leading-relaxed">{description}</p>
		</div>
	);
}
