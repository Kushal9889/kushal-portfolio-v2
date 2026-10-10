import { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { DocumentInterface } from "@langchain/core/documents";
import { rerank } from "./model";

/**
 * The relevance gate, as a LangChain document compressor.
 *
 * Cosine on this corpus cannot say "not in his profile": on the dev split the
 * best section of an unanswerable question scored up to 0.23, the same as the
 * weakest answerable one. A cross-encoder reads the question and the passage
 * together and returns a logit with a usable gap (+3.2 against -7.8 on the
 * first probe). Each kept document carries its logit in `metadata.relevance`;
 * the caller turns the best one into a band. Returns null when the reranker is
 * unreachable, so the caller can fall back to a fixed rule instead of guessing.
 */
export class NvidiaRerank extends BaseDocumentCompressor {
  constructor(
    private readonly topN = 5,
    private readonly deadline = Infinity,
  ) {
    super();
  }

  async compressDocuments(docs: DocumentInterface[], query: string): Promise<DocumentInterface[]> {
    const scores = await rerank(query, docs.map((d) => d.pageContent), this.deadline);
    if (!scores) throw new Error("rerank unavailable");
    return scores
      .slice(0, this.topN)
      .map((s) => ({ ...docs[s.index], metadata: { ...docs[s.index].metadata, relevance: s.score } }));
  }
}
