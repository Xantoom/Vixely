export * from "./pool.ts";
export type { AnalysisWorkerApi } from "./analysis.worker.ts";

/**
 * Spawns the analysis worker.
 *
 * The `?worker` suffix is what makes the bundler emit it as a separate entry
 * rather than folding it into the calling chunk.
 */
export function createAnalysisWorker(): Worker {
	return new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
}
