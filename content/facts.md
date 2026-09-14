---
name: Kushal Gaddamwar
role: Agentic AI Engineer
current: AI Engineer at Boston University's Questrom Computational Lab
tagline: I engineer the systems around LLMs. Not the prompts inside them.
location: Boston, MA
email: kushal7887pd@gmail.com
phone: "+1 (857) 328-4611"
linkedin: https://linkedin.com/in/kushal-gaddamwar
github: https://github.com/Kushal9889
repo: https://github.com/Kushal9889/kushal-portfolio-v2
site: https://kushal-portfolio-223.netlify.app
available: January 2027, earlier for the right team
focus: Agentic orchestration · RAG retrieval · Evals and observability · Production deploys
proof: He found a silent error-swallowing bug in LangChain's SDK. A maintainer merged the fix in 57 hours.
lastVerified: 2026-08-09
---

## Who he is

**Kushal Gaddamwar builds agentic AI systems that run in production.** He is an AI Engineer at Boston
University's Questrom Computational Lab and an M.S. Computer Science candidate at BU, graduating
December 2026.

The work he does is context engineering: deciding what a model sees on every inference call.
Retrieval, memory, tool surface, evaluation. Most of the difficulty in agentic systems is not the
prompt, it is everything around the prompt.

He is not a researcher and not an ML training engineer. He has never trained a model and does not
claim to. He builds systems that stay correct under load.

## What he is good at

**Finding the place a system is wrong before it fails loudly.**

Two examples. At Questrom he traced answer quality problems to retrieval rather than generation,
which is where they usually are and rarely where people look first. In LangChain's deepagents SDK
he found a code path that reported success while discarding an error, and wrote it up precisely
enough that a maintainer shipped the fix in 57 hours.

Both are the same skill: reading a system closely enough to see where it contradicts itself.

## What he does not do

Model training. He has no PyTorch or TensorFlow training experience and does not present himself as
an ML engineer.

Data science and statistical modeling.

Pure backend work with no AI layer. He can do it, having done it at IMG Systems and Growaza, but it
is not what he is optimising his career for.

## Boston University, Questrom Computational Lab

Role: AI Engineer, Graduate Researcher. May 2026 to present. Boston, MA.

@metric 14 | tools on one LangGraph agent
@metric BM25 + vector | hybrid retrieval, Cohere reranked
@metric LLM-as-a-Judge | hallucination and retrieval scoring

@ask When is multi-agent orchestration worth the coordination cost? | Boston University, Questrom Computational Lab

**He built a document intelligence assistant on Azure for an enterprise consulting client, owned
from ingestion through deployment:** a LangGraph agent exposing 14 tools for document question
answering, cross-document comparison and template-driven generation, grounded by hybrid BM25 and
vector retrieval with Cohere re-ranking, guarded by PII and entity redaction, and scored for
hallucination rate by LLM-as-a-Judge evaluations.

The constraint: consultants needed answers grounded in a large private document corpus, where a
wrong answer delivered confidently is worse than no answer.

What he built. A LangGraph agent exposing 14 tools covering document question answering,
cross-document comparison, and template-driven generation. Hybrid retrieval fusing BM25 keyword
search with vector search, plus LLM-based query rewriting and Cohere re-ranking. LLM-as-a-Judge
evaluations measuring hallucination rate and retrieval quality. PII and entity redaction guardrails
applied across ingested documents. Header-aware chunking, Markdown-header splitting plus recursive
splitting, with SHA-256 deduplication and Azure Blob Storage metadata. Streaming FastAPI endpoints
over Server-Sent Events with a React single-page app. A Cosmos DB Gremlin knowledge graph linking
clients, projects, and technologies.

Stack: Azure OpenAI GPT-4o, Azure AI Search, LangGraph, FastAPI, React, Cosmos DB Gremlin, Cohere.

The trade-off worth asking about: hybrid retrieval costs more per query than dense-only. Dense
embeddings compress meaning and lose surface form, so they miss exact terms, and in a consulting
corpus the exact terms are client names, project codes, and document titles. The cost was worth it.

## IMG Systems

Role: Software Engineering Intern. August 2024 to April 2025. Remote.

@metric +20% | extraction accuracy | resume
@metric 95% | schema accuracy, up from 75-78% | resume
@metric 5,000+ | profiles parsed per month
@metric -25% | REST API latency

@ask What did he over-engineer at IMG, and how did he find out? | IMG Systems

**He extended a Python document-parsing pipeline built on Apache Tika, raising extraction accuracy 20
percent** across more than 5,000 candidate profiles a month and cutting recruiter screening time 15
percent.

He enforced structured-output validation with Pydantic against a JSON Schema, reaching 95 percent
schema accuracy and reducing manual review across a six-person team. Before the validation layer,
schema conformance sat around 75 to 78 percent.

He containerized Python microservices backed by PostgreSQL and Redis with Docker, trimming REST API
latency 25 percent and lifting throughput 30 percent, and automated CI/CD through GitHub Actions for
zero-downtime releases.

He also tuned the collaborative filtering that ranks candidates against a role, raising match
accuracy 20 percent while cutting false positives 18 percent. Automating the recruiter workflow in
Python and Node.js saved the team more than 12 hours a week, across 8 Agile sprints delivered at 95
percent on-time.

Honest scope: this was an internship extending existing systems, not a greenfield build. He owned
the pipeline extension, the schema layer, and the CI/CD setup independently.

**The mistake he made here, and it is a good interview answer: his first Pydantic schemas were too
strict.** Documents that were merely unusual got rejected alongside documents that were genuinely
malformed. He fixed it with fallback field validators and logging on the rejection path, which
turned silent data loss into a visible signal.

## Growaza

Role: Associate Software Engineer Intern. January 2024 to July 2024. India.

@metric -30% | API response time | resume
@metric +22% | engagement, 1,000+ daily users
@metric 2,000+ | SKUs tracked live

**He cut API response time 30 percent using in-memory caching and asynchronous request handling,**
lifting engagement 22 percent for more than 1,000 daily active users on an e-commerce platform.

He launched a MySQL inventory dashboard tracking more than 2,000 SKUs, and secured REST endpoints
with JWT and role-based access control across admin, manager, and staff levels. Deployed on AWS EC2
and S3.

He was an intern on that team and did not manage anyone, which is worth stating plainly because the
resume line said "led".

Stack: React, Redux, MySQL, Redis, Node.js, JWT, RBAC, AWS EC2 and S3.

## BU Life AI

**A live multi-agent campus assistant for Boston University students, running since January
2026:** a LangGraph supervisor classifies intent and routes to one of three specialised ReAct
agents for places, resources and events, each on its own thread so concurrent users never share
state, retrieving over NVIDIA NV-Embed 1024-dimension vectors in pgvector fused with BM25, which
cut redundant LLM calls 70 percent.

@metric -70% | redundant LLM calls
@metric 3 | specialised agents, isolated state
@metric 1024-dim | NV-Embed over pgvector

Live: [bulife-ai.netlify.app](https://bulife-ai.netlify.app/)
Source: [github.com/Kushal9889/BU-Life-AI](https://github.com/Kushal9889/BU-Life-AI)

The constraint: students ask heterogeneous questions across housing, dining, events, and campus
resources. One agent with a single long context prompt mixes tool namespaces across those domains,
which causes retrieval contamination and reasoning drift over a session.

**The decision: a LangGraph supervisor node classifies intent and routes to one of three specialised
ReAct agents**, for places, resources, and events. Each agent owns its own LangGraph thread, so
concurrent users never share state. The cost is orchestration complexity. What it buys is state
isolation and a 70 percent reduction in redundant LLM calls.

Retrieval combines BM25 lexical search with NVIDIA NV-Embed 1024-dimension vectors over pgvector,
merged through an EnsembleRetriever. The retriever is initialised once at startup as a singleton,
so there is no per-request re-ingestion cost.

Inference runs on NVIDIA NIM, which is free, with AWS Bedrock and Claude 3 Haiku behind it as a
paid fallback for when NIM is unavailable. Two providers, the free one first, which is the same
failover shape the portfolio uses and for the same reason: the cheap path serves almost every
request and the paid path exists so an outage degrades instead of failing.

Stack: LangGraph, FastAPI, Next.js, TypeScript, pgvector, Neon Postgres, NVIDIA NIM, LangSmith

Tokens stream over Server-Sent Events. The frontend is on Netlify and the backend on Render.

What breaks at 10x: the Render free tier is the first bottleneck, CPU throttling and cold starts.
Neon connection limits are second. The fix is a paid tier with persistent workers and PgBouncer
pooling. He has not needed it yet and has not pretended otherwise.

## Open source, LangChain deepagents

**He found and root-caused a silent error-swallowing bug in LangChain's deepagents SDK, and a
maintainer merged the fix 57 hours after he reported it,** crediting his reproduction in the pull
request body.

@metric 57 hours | from his report to a merged fix | https://github.com/langchain-ai/deepagents/pull/4925
@metric 3 | places the file already contradicted itself | https://github.com/langchain-ai/deepagents/issues/4846
@metric credited | in the merged pull request body | https://github.com/langchain-ai/deepagents/pull/4925

@ask What did the maintainer change that he did not propose? | Open source, LangChain deepagents

@artifact Issue he filed | closed | langchain-ai/deepagents#4846 | https://github.com/langchain-ai/deepagents/issues/4846
@artifact Fix a maintainer wrote | merged | langchain-ai/deepagents#4925 | https://github.com/langchain-ai/deepagents/pull/4925

`CompositeBackend.ls("/")` and `als("/")` aggregated results at the root and discarded errors from
the default backend, returning a successful-looking listing containing only virtual route
directories. A caller whose backend had failed would see a healthy but nearly empty filesystem.

**What made the report land was not spotting a crash, because there was no crash.** It was showing that
the behaviour contradicted the codebase's own documented invariant, quoted from `_merge_glob_results`:
a backend error must not be swallowed as a partial success. The routed branch already checked for
errors. The grep root merge already returned default backend errors first. Only this path did not.
He also traced the precedent, the same bug class as issue #3105, fixed for sandbox backends in #3359.

Filed 19 July 2026 at 15:20 UTC. Mason Daugherty, a LangChain maintainer, wrote and merged the fix on
22 July at 00:45 UTC, 57 hours later, in 29 added lines across 2 files with nothing deleted. The pull
request body reads: Credit to @Kushal9889 for reporting the issue and providing the reproduction.

**Fifty-seven hours from a stranger's bug report to a merged fix in a LangChain SDK.** He offered in
the issue to write the patch himself. The maintainer wrote it instead, which is the ordinary outcome
when the report is good enough that fixing it takes twenty minutes.

## Certifications

NVIDIA-Certified Professional: Agentic AI, known as NCP-AAI, earned 2026. This is the one that
matters: a proctored professional exam from the vendor whose inference stack the field runs on,
covering agent design, orchestration, and deployment. Verifiable on Credly.
https://www.credly.com/badges/c8f105aa-1815-40cc-85a1-e5a2ef20c920/public_url

AWS Cloud Technical Essentials, Amazon Web Services, completed January 2026.
https://www.coursera.org/account/accomplishments/verify/4L1ZWS6VK2L8

Generative AI: Prompt Engineering Basics, IBM, completed January 2026.
https://www.coursera.org/account/accomplishments/verify/4GQE7X5TB7FT

Google Cloud Fundamentals: Core Infrastructure, Google Cloud, 2025.
https://www.coursera.org/account/accomplishments/verify/T3SB0BFWGHI8

IBM RAG and Agentic AI Professional Certificate, a ten-course program. Three courses are complete
and individually verifiable: Develop Generative AI Applications, Build RAG Applications, and Vector
Databases for RAG. The remaining seven cover advanced retrievers, multimodal generative AI, building
AI agents, agentic AI with LangChain and LangGraph, agentic AI with CrewAI, AutoGen and BeeAI,
building agents with the Model Context Protocol, and a capstone project.

## Education

Boston University, M.S. Computer Science. September 2025 to December 2026 expected. Boston, MA.
Coursework: Generative AI, Web Mining and Graph Analytics, Software Engineering, AI Systems.

IIIT Design and Manufacturing Jabalpur, B.Tech Computer Science and Engineering. October 2020 to
June 2024. India.

## Publications

@metric 91.4% | combined transformer and GNN accuracy | https://doi.org/10.1109/ICAICCIT64383.2024.10912101
@metric 88.2% | transformer alone | https://doi.org/10.1109/ICAICCIT64383.2024.10912101
@metric 13.5s | detect and fix, against 25.4s for static analysis | https://doi.org/10.1109/ICAICCIT64383.2024.10912101

@artifact IEEE ICAICCIT 2024, first author | published | Deep Learning for Contextual Bug Detection and Automated Fixes | https://doi.org/10.1109/ICAICCIT64383.2024.10912101
@artifact IGI Global 2024, co-author | published | Cyber-Physical Systems: Security and Optimization Strategies | https://github.com/Kushal9889/Cyber-Physical-Systems-and-the-Future-of-Urban-Living-Decision-Making-Challenges-and-Opportunities

**He published research on finding bugs automatically, then found one by hand in
a production SDK.** The IEEE paper is about contextual bug detection: a
transformer reads the code, a graph neural network reads the structure around it,
and the combination reaches 91.4% accuracy where the transformer alone reaches
88.2% and the graph network alone 85.7%. Detection and fix together run in 13.5
seconds against 25.4 for static analysis.

The LangChain defect in section 01 is the same problem outside the lab. It was a
silent failure with no exception and no stack trace, which is precisely the class
static analysis does not catch and the class the paper argues context is needed
for. First author, pages 624 to 629.
[doi:10.1109/ICAICCIT64383.2024.10912101](https://doi.org/10.1109/ICAICCIT64383.2024.10912101)
and [the code](https://github.com/Kushal9889/Deep-Learning-for-Contextual-Bug-Detection-and-Automated-Fixes-in-Software-Systems),
which carries a CITATION.cff so GitHub renders a citation button.

IGI Global 2024, co-author. Cyber-Physical Systems: Security and Optimization Strategies.
[Read the chapter and code](https://github.com/Kushal9889/Cyber-Physical-Systems-and-the-Future-of-Urban-Living-Decision-Making-Challenges-and-Opportunities)

## Skills

Languages: Python, SQL, TypeScript, JavaScript, C++. Data structures and algorithms.

Agentic AI: multi-agent orchestration, ReAct, tool calling, function calling, structured outputs,
context engineering, prompt engineering, Model Context Protocol, natural language processing.

Frameworks: LangChain, LangGraph, LangSmith, LlamaIndex, NVIDIA NIM, OpenAI API, Azure OpenAI.

Retrieval: RAG, agentic RAG, hybrid search, BM25, reranking, embeddings, semantic search, chunking
strategies, pgvector, ChromaDB, Azure AI Search, NV-Embed.

Evaluation and reliability: LLM evaluation, LLM-as-a-Judge, guardrails, grounding, hallucination
reduction, PII redaction, LLM observability, tracing.

Backend and MLOps: FastAPI, RESTful APIs, microservices, async Python, Pydantic, Docker, Kubernetes,
GitHub Actions, CI/CD, model deployment, low-latency inference, Server-Sent Events.

On Kubernetes specifically: he has used it and is not proficient in it. It is listed because it is
real, not because it is a strength, and it is deliberately kept out of his headline and summary so
that nobody screens him on it. Ask him about Docker and CI/CD instead, which he owned end to end.

Databases: PostgreSQL, MySQL, MongoDB, Redis, Neo4j, Cosmos DB.

Cloud: AWS EC2, S3, Lambda, API Gateway. Microsoft Azure. Google Cloud Platform.

Frontend: React, Redux, Next.js.

## Achievements

@metric 99.1 percentile | JEE Mains 2020, of 1.2 million candidates | resume
@metric 70+ | members in the coding community he co-founded
@metric GSoC and Kickstart top 200 | where his mentees landed

JEE Mains 2020: 99.1 percentile of 1.2 million candidates, top 0.9 percent nationally.

CodeChef global rank 64, February 2022 Long Challenge. Third place, Code Rumble 2023.

Co-founded BITBYTE, a 70-plus member coding community at IIIT-DM Jabalpur. Mentees reached Google
Kickstart top 200, Google Summer of Code, and three internships.

Advisory Committee Head, Tarang Fest 2023. Coordinated programming across 13 colleges and 250-plus
students, raised $12,000 from more than 25 sponsors.

## Availability

Full-time from January 2027, or earlier for the right team. Open to remote, hybrid, and on-site
across the United States. Based in Boston.

Target roles: Agentic AI Engineer, Applied AI Engineer, LLM Engineer, AI Platform Engineer, Context
Engineer.

## Work authorisation

F-1 student visa. OPT-eligible on graduation in December 2026, with the three-year STEM extension
available. That is roughly three years of work authorisation before H-1B sponsorship is required.

This is answered only when asked. It is not raised otherwise.

## This site

Two decisions on this page are worth asking about, and both went the opposite way
to the default.

**The graph runs without a checkpointer.** LangGraph persists state after every
node by default, which is right for a long-running stateful agent and wrong here.
A Postgres saver costs 20 to 50 milliseconds per write, and this graph runs three
nodes to answer one question in a conversation that lives in a browser tab.
Conversation history rides with each request from the browser tab that is having
the conversation, which trades durability he does not need for latency the reader
can feel. That half was missing for a while: the graph shipped with the decision
written down and the history never implemented, so every follow-up question was
answered as though it were the first. It is in `content/notes/defects.md` with
the rest.

**When every model provider fails, the answer degrades rather than erroring.**
With no provider reachable, the agent returns the retrieved source paragraph
instead of a failure: the reader still gets the grounded material, unsummarised,
and the rest of the page keeps working. Silence is the failure mode worth
avoiding, not imperfection.

**The rate limit has a known ceiling and it is stated rather than hidden.** The
per-IP token budget is held in memory, so on serverless it counts per warm
instance rather than globally. That stops one client hammering one instance,
which is the realistic abuse case for a portfolio, and it would not stop a
distributed one. The upgrade path is a shared store such as Upstash Redis, and
it has not been taken because the traffic does not justify it yet.

**The evaluation suite has no LLM judge, deliberately.** He built LLM-as-a-Judge
evaluation at the Questrom lab, where a large private corpus made grading by
model the only tractable option. Here the suite is 25 cases with known
correct behaviour, so assertions are substring and route checks. A judge would
add cost, latency, and a second thing to trust, to grade questions whose right
answer is already written down. The technique is not better than the check; it is
what you reach for when a check is not available.


**Nothing here is independent of anything else, and pretending otherwise would be
the first dishonest line on the page.** It runs on Netlify functions, answers
through free-tier inference with failover across four providers, and holds no
session and no conversation history on the server. When a provider caps, the
next one serves. When all four are gone, the retrieved paragraph is served
unsummarised.

**There is a vector database, and it is deliberately not in the answer path.**
Neon Postgres with pgvector holds all 53 passages under a real HNSW index on
`vector_cosine_ops`, rebuilt on every deploy. No question a visitor asks touches
it. Retrieval serves from an index bundled with the function, because that is
what the measurement says: scored on the same question in the same request, the
exhaustive in-memory scan takes 0.5 to 2.9 milliseconds and the database takes
46 to 198, which is 30 to 380 times longer for the same top result. Both need
the query embedding first, so that cost is excluded from both sides. The
database exists so that sentence is a measurement rather than an excuse.

**The site refuses to ship claims it cannot support, and the refusal is
automated.** A link checker resolves every external URL and fails on a dead one.
A facts gate fails the build when the page renders a section the corpus lacks,
when a metric carries no source, when the availability date has passed, or when
a resume keyword has gone missing from this file. A token linter fails on a
colour written outside the stylesheet. An audit runs 107 structural
checks. The evaluation suite runs 25, five times each. None of it makes the work better; all
of it stops the page describing work that is not there.

The page you are reading is the work sample. The agent answering questions runs a LangGraph graph
with four nodes, hybrid BM25 and dense retrieval over this file and his engineering notes, a policy
layer, and per-answer cost accounting. Every latency number shown was measured on the request you
are looking at, not configured.

Source: https://github.com/Kushal9889/kushal-portfolio-v2
