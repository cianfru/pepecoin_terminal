// Print the maximum `block` value in a transfers CSV — the delta pull's start point.
// Streams the file (it is large) and scans the block column by header name. Prints nothing (exit 0)
// if the file is missing or empty, so the workflow can treat "" as "seed with a full pull".
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";

const path = process.argv[2] || "transfers.csv";
if (!existsSync(path)) process.exit(0);

let bi = -1, max = 0, seen = false;
const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  if (bi < 0) { bi = line.split(",").map(s => s.trim().toLowerCase()).indexOf("block"); continue; }
  const b = Number(line.split(",")[bi]);
  if (Number.isFinite(b)) { if (b > max) max = b; seen = true; }
}
if (seen) process.stdout.write(String(max));
