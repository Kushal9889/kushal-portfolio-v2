## How retrieval on this page works
@source https://github.com/Kushal9889/kushal-portfolio-v2

**The agent answering questions here runs hybrid retrieval: BM25 over the corpus
and dense cosine over precomputed embeddings, fused with reciprocal rank fusion
at k=60.** Both retrievers rank every chunk, and a chunk's final score is the
sum of `1 / (60 + rank)` from each. RRF is used rather than a weighted score
blend because the two retrievers produce numbers on incomparable scales: BM25 is
unbounded and corpus-dependent, cosine similarity is bounded to a narrow band
near the top, and any fixed weighting between them is a constant that has to be
retuned every time the corpus changes. Ranks are comparable by construction.

**Every question is embedded, because the shortcut that skipped it failed when
measured.** The page used to skip the embedding call when the top BM25 score was
2.2 times the runner-up, reasoning that a rare term like "Growaza" or "NCP-AAI"
lands one chunk far clear of the rest. Across the eval set neither of those
queries passed the test. The one query that did was the weakest in the set,
because a lone match beats zero times anything. A lone weak match is the absence
of competition, and that is exactly when the dense half is most needed, so the
shortcut was removed. If the embedding call fails or runs out of time, the
keyword half still answers.

**Reciprocal rank fusion produces exact ties, and the tiebreak matters.** RRF is
symmetric: a chunk ranked first by keyword and second by embedding scores
exactly what a chunk ranked second and first scores. Left to a stable sort, the
tie broke on corpus order, which meant whichever section sat higher in the file
won. That is file layout masquerading as relevance. Ties now break on the better
single rank, because being one retriever's first choice beats being two
retrievers' second, and then on keyword score.

**A retrieved chunk has to earn its place in the context window.** The top-k is
a ceiling rather than a quota: a chunk scoring far under the leader is filler,
and filler is how a grounded answer drifts off the question that was asked. The
first result always survives, because a weak best match is still the best match
and answering from it beats answering from nothing.

**Select-to-ask retrieves on the phrase, not on the sentence wrapped around it.**
Highlighting text on the page sends `What does this mean: "..."`, and every word
of that wrapper is a BM25 term. Those words are common across the whole corpus,
so they dilute the phrase that carries the meaning: a question about the dense
retriever came back grounded in the achievements section. When a question wraps
a quoted span of real length, the span is the query and the wrapper is grammar.
