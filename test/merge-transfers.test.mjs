import { test } from "node:test";
import assert from "node:assert/strict";
import { cutoffBlock } from "../scripts/merge-transfers.mjs";

const H = "sender,receiver,time,value,block";

test("cutoffBlock = smallest block in the delta (the seam)", () => {
  const lines = [H, "0xa,0xb,t,1,30", "0xb,0xc,t,2,40", "0xc,0xd,t,3,30"];
  assert.equal(cutoffBlock(lines), 30);
});

test("cutoffBlock ignores blank lines and finds min regardless of order", () => {
  const lines = [H, "0xa,0xb,t,1,55", "", "0xb,0xc,t,2,50", "0xc,0xd,t,3,99", ""];
  assert.equal(cutoffBlock(lines), 50);
});

test("cutoffBlock is null for a header-only / empty delta (archive unchanged)", () => {
  assert.equal(cutoffBlock([H]), null);
  assert.equal(cutoffBlock([H, ""]), null);
  assert.equal(cutoffBlock([]), null);
});

test("cutoffBlock respects the header's column position (block not last)", () => {
  const lines = ["block,sender,receiver,time,value", "20,0xa,0xb,t,1", "10,0xb,0xc,t,2"];
  assert.equal(cutoffBlock(lines), 10);
});
