import spec from "@/content/serving.json";

export type ServeModel = (typeof spec.models)[number];
export type ServeGpu = (typeof spec.gpus)[number];
export type ServeInput = { model: ServeModel; gpu: ServeGpu; gpus: number; context: number; batch: number; weightBytes: 1 | 2 };

const GB = 1e9;

/**
 * Roofline estimate of serving one model: what the weights and the KV cache
 * take, whether they fit, and how fast decode can go when every step has to
 * read the weights and the whole cache from memory once. Weights split
 * evenly over tensor-parallel GPUs; the KV cache is fp16 and paged in blocks.
 */
export function serve({ model, gpu, gpus, context, batch, weightBytes }: ServeInput) {
  const weights = model.params * weightBytes;
  // Keys and values, per layer, per KV head, per head dimension, 2 bytes each.
  const kvPerToken = 2 * model.layers * model.kvHeads * model.headDim * 2;
  const kv = kvPerToken * context * batch;
  const capacity = gpu.memoryGB * GB * gpus * (1 - spec.reserve);
  const used = weights + kv;
  // Every decode step reads the weights and every cached token once.
  const stepSeconds = used / (gpu.bandwidthTBs * 1e12 * gpus);
  const maxBatch = Math.max(0, Math.floor((capacity - weights) / (kvPerToken * context)));
  return {
    weightsGB: weights / GB,
    kvGB: kv / GB,
    capacityGB: capacity / GB,
    kvPerTokenKB: kvPerToken / 1024,
    blocks: Math.ceil(context / spec.blockTokens) * batch,
    fits: used <= capacity,
    load: used / capacity,
    tokensPerSecond: batch / stepSeconds,
    perUserTokensPerSecond: 1 / stepSeconds,
    maxBatch,
  };
}
