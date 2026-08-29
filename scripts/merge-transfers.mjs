// Merge an incremental transfer delta into the full archive on a clean BLOCK boundary.
//
// The delta pull starts at the archive's current MAX block and re-pulls that whole boundary block,
// so the merge is: keep every archive row BELOW the boundary block, then append the entire delta
// (which covers the boundary block and everything after). This can never duplicate or drop a row at
// the seam — the boundary block is replaced wholesale. Mirrors the SPX "boundary-day-replace" pattern.
//
// Usage: node scripts/merge-transfers.mjs --archive=transfers.csv --delta=delta.csv --out=transfers.csv
// Streams the archive (it is large) so memory stays flat. Pure helper `cutoffBlock` is exported+tested.
import { createReadStream, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const blockIdx = (headerLine) => headerLine.split(",").map(s => s.trim().toLowerCase()).indexOf("block");

// The seam: the smallest block present in the delta. Everything strictly below it is kept from the
// archive; everything at/above it comes from the delta.
export function cutoffBlock(deltaLines) {
  let min = Infinity, bi = -1;
  for (let i = 0; i < deltaLines.length; i++) {
    const line = deltaLines[i];
    if (!line.trim()) continue;
    if (bi < 0) { bi = blockIdx(line); continue; }        // header
    const b = Number(line.split(",")[bi]);
    if (Number.isFinite(b) && b < min) min = b;
  }
  return min === Infinity ? null : min;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const { archive, delta, out } = args;
  if (!archive || !delta || !out) { console.error("usage: node scripts/merge-transfers.mjs --archive=A.csv --delta=D.csv --out=O.csv"); process.exit(1); }

  const deltaLines = (await readFile(delta, "utf8")).split(/\r?\n/);
  const cutoff = cutoffBlock(deltaLines);
  if (cutoff == null) { console.log("delta empty — archive unchanged"); return; }

  const tmp = out + ".tmp";
  const w = createWriteStream(tmp);
  let hdr = null, bi = -1, kept = 0, dropped = 0;
  const rl = createInterface({ input: createReadStream(archive), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (hdr == null) { hdr = line; bi = blockIdx(line); w.write(line + "\n"); continue; }
    const b = Number(line.split(",")[bi]);
    if (Number.isFinite(b) && b < cutoff) { w.write(line + "\n"); kept++; } else { dropped++; }
  }
  // append the whole delta (skip its header)
  let added = 0;
  for (let i = 0; i < deltaLines.length; i++) {
    const l = deltaLines[i];
    if (!l.trim() || i === 0) continue;
    w.write(l + "\n"); added++;
  }
  await new Promise(r => w.end(r));
  const { rename } = await import("node:fs/promises");
  await rename(tmp, out);
  console.log(`merged: cutoff block ${cutoff} · kept ${kept} archive rows below · replaced ${dropped} at/above · +${added} delta → ${out} (${kept + added} rows)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
