import { test } from "node:test";
import assert from "node:assert/strict";
import { labelFunder, isExchange } from "../scripts/eth-labels.mjs";
import { pickFunder } from "../scripts/enrich-eth-funding.mjs";

test("labelFunder tags known exchange hot wallets, case-insensitive", () => {
  assert.equal(labelFunder("0x71660c4005ba85c37ccec55d0c4493e66fe775d3"), "Coinbase");
  assert.equal(labelFunder("0x28C6c06298d514Db089934071355E5743bf21d60"), "Binance"); // mixed case
  assert.equal(labelFunder("0x2910543af39aba0cd09dbb2d50200b3e800a63d2"), "Kraken");
  assert.equal(labelFunder("0xabc0000000000000000000000000000000000000"), null); // unknown = private
  assert.equal(labelFunder(null), null);
});

test("isExchange mirrors labelFunder", () => {
  assert.equal(isExchange("0x71660c4005ba85c37ccec55d0c4493e66fe775d3"), true);
  assert.equal(isExchange("0xabc0000000000000000000000000000000000000"), false);
});

test("pickFunder picks the earliest inbound value-bearing tx", () => {
  const A = "0xAAaAAaaAaaAaAAAaAAaAaAaaAaAAAaaaAAAaAAaa".toLowerCase();
  const rows = [
    { to: A, from: "0xfunder2", value: "5", timeStamp: "2000" },      // later inbound
    { to: A, from: "0xfunder1", value: "10", timeStamp: "1000" },     // EARLIEST inbound → the funder
    { to: A, from: "0xzero", value: "0", timeStamp: "500" },          // zero-value, ignored
    { to: "0xother", from: A, value: "3", timeStamp: "100" },         // outbound, ignored
  ];
  const best = pickFunder(rows, A);
  assert.equal(best.funder, "0xfunder1");
  assert.equal(best.wei, "10");
  assert.equal(best.ts, 1000 * 1000);
});

test("pickFunder returns null when nothing funds the address", () => {
  const A = "0x1111111111111111111111111111111111111111";
  assert.equal(pickFunder([{ to: "0x2", from: A, value: "9", timeStamp: "1" }], A), null);
  assert.equal(pickFunder([], A), null);
  assert.equal(pickFunder(null, A), null);
});
