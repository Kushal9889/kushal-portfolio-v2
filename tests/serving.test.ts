import assert from "node:assert/strict";
import { test } from "node:test";
import spec from "../content/serving.json";
import { serve } from "../lib/serving";

const [m8, m70] = spec.models;
const gpu = spec.gpus[0];

test("KV cache per token matches the published shape (Llama 3.1 8B: 128 KiB fp16)", () => {
  assert.equal(serve({ model: m8, gpu, gpus: 1, context: 1, batch: 1, weightBytes: 2 }).kvPerTokenKB, 128);
});

test("70B in fp16 does not fit one 80 GB GPU; it fits four", () => {
  assert.equal(serve({ model: m70, gpu, gpus: 1, context: 4096, batch: 1, weightBytes: 2 }).fits, false);
  assert.equal(serve({ model: m70, gpu, gpus: 4, context: 4096, batch: 1, weightBytes: 2 }).fits, true);
});

test("batching raises throughput and lowers each user's speed", () => {
  const one = serve({ model: m8, gpu, gpus: 1, context: 4096, batch: 1, weightBytes: 2 });
  const many = serve({ model: m8, gpu, gpus: 1, context: 4096, batch: 32, weightBytes: 2 });
  assert.ok(many.tokensPerSecond > one.tokensPerSecond * 5);
  assert.ok(many.perUserTokensPerSecond < one.perUserTokensPerSecond);
});

test("max batch is the most sequences whose cache fits beside the weights", () => {
  const r = serve({ model: m8, gpu, gpus: 1, context: 8192, batch: 1, weightBytes: 2 });
  assert.equal(serve({ model: m8, gpu, gpus: 1, context: 8192, batch: r.maxBatch, weightBytes: 2 }).fits, true);
  assert.equal(serve({ model: m8, gpu, gpus: 1, context: 8192, batch: r.maxBatch + 1, weightBytes: 2 }).fits, false);
});
