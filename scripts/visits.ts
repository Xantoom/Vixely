/**
 * The pages shown, as counted by worker/index.ts: the most visited pages over a number of days,
 * then visits by language, screen, country and the sites visitors came from.
 *
 *   CLOUDFLARE_API_TOKEN=… bun scripts/visits.ts [days]
 *
 * The token needs the "Account Analytics: Read" permission. Written as Markdown tables, which the
 * Visits workflow shows in its summary (.github/workflows/visits.yml).
 */

const ACCOUNT = '480ab55dd9b66a585ffd0d71676d26d2';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Set CLOUDFLARE_API_TOKEN (Account Analytics: Read).');

const days = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 7);
const dataset = 'vixely_visits';

/** blob1 page, blob2 language, blob3 country, blob4 screen, blob5 the site visitors came from. */
const COLUMNS = { page: 'blob1', language: 'blob2', country: 'blob3', screen: 'blob4', from: 'blob5' } as const;

async function top(column: keyof typeof COLUMNS, limit: number): Promise<{ key: string; visits: number }[]> {
	const sql = `SELECT ${COLUMNS[column]} AS key, SUM(_sample_interval) AS visits FROM ${dataset}
		WHERE timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY key ORDER BY visits DESC LIMIT ${limit} FORMAT JSON`;
	const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` },
		body: sql,
	});
	if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
	const { data } = (await response.json()) as { data: { key: string; visits: number | string }[] };
	return data.map((row) => ({ key: row.key || '(none)', visits: Number(row.visits) }));
}

console.log(`## Visits, last ${days} days (${dataset})`);
for (const [column, limit] of [['page', 40], ['language', 5], ['screen', 5], ['country', 15], ['from', 15]] as const) {
	// oxlint-disable-next-line no-await-in-loop -- one table after the other, in order
	const rows = await top(column, limit);
	console.log(`\n| ${column} | visits |\n| --- | ---: |`);
	for (const { key, visits } of rows) console.log(`| ${key} | ${visits} |`);
}
