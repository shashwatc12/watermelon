// Measures real latency and cost against a running instance.
// Usage: node scripts/bench.mjs [baseUrl] [runs]
//   e.g. node scripts/bench.mjs http://localhost:8787 20
const base = process.argv[2] || "http://localhost:8787";
const runs = Number(process.argv[3] || 20);
const text =
  "Week 9: Search migration is waiting on the platform team to finish the new index cluster. " +
  "The cutover date of Oct 21 is at risk if the cluster slips again.";

const lat = [];
let cost = 0;
let mock = false;
for (let i = 0; i < runs; i++) {
  const res = await fetch(`${base}/api/assess`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: `${text} (run ${i})` }),
  });
  if (!res.ok) { console.error(i, res.status, await res.text()); process.exit(1); }
  const d = await res.json();
  lat.push(d.meta.latencyMs);
  cost += d.meta.costUsd;
  mock = d.meta.mock;
}
lat.sort((a, b) => a - b);
const q = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
console.log(JSON.stringify({ runs, mock, p50_ms: q(0.5), p95_ms: q(0.95), avg_cost_usd: cost / runs }, null, 2));
if (mock) console.log("WARNING: mock mode. These are not Jev numbers.");
