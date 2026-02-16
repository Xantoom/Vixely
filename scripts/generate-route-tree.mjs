#!/usr/bin/env node
import { Generator, getConfig } from '@tanstack/router-generator';

async function main() {
	const root = process.cwd();
	const config = getConfig(undefined, root);
	const generator = new Generator({ config, root });
	await generator.run();
}

main().catch((error) => {
	const message = error instanceof Error ? error.stack ?? error.message : String(error);
	console.error('[routes] Failed to generate route tree');
	console.error(message);
	process.exit(1);
});
