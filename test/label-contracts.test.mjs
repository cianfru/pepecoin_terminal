import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../scripts/label-contracts.mjs";

test("classify: DEX routers → router (aggregated retail)", () => {
  assert.equal(classify({ name: "UniversalRouter" }).kind, "router");
  assert.equal(classify({ name: "Spender" }).kind, "router");
  assert.equal(classify({ name: "AugustusV6" }).kind, "router"); // Paraswap
  assert.equal(classify({ name: "MainnetSettler" }).kind, "router"); // 0x — matches /settlement|0x/... actually via "settler"? ensure router
});

test("classify: smart-account wallets → account (a person)", () => {
  assert.equal(classify({ name: null, proxy: "eip7702", impls: ["EIP7702StatelessDeleGator"] }).kind, "account");
  assert.equal(classify({ name: "GnosisSafeProxy" }).kind, "account");
  assert.equal(classify({ name: null, impls: ["SimpleAccount"] }).kind, "account");
});

test("classify: vault kind or lending names → vault", () => {
  assert.equal(classify({ defi: true, name: "bcred" }).kind, "vault");
  assert.equal(classify({ name: "CompoundLendingPool" }).kind, "vault");
});

test("classify: behavioural fallback — many counterparties + ~0 bag → router-like", () => {
  assert.equal(classify({ name: null, cp: 40, bag: 0 }).kind, "router");
  assert.equal(classify({ name: null, cp: 3, bag: 100000 }).kind, "contract"); // holds a bag, few cp → unknown
});
