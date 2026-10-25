/** Shared entry links and questions; every destination stays on the same page. */
export const VISITOR_JOURNEYS = [
  { label: "Recruiter", promise: "Experience and résumé", href: "#work", question: "Which roles fit his experience, and what work supports that fit?" },
  { label: "Interviewer", promise: "How he engineers", href: "#approach", question: "How does retrieval work here, and what tradeoffs did he make?" },
  { label: "Hiring manager", promise: "What he shipped", href: "#opensource", question: "What did he own and ship from ingestion through deployment?" },
  { label: "Referrer", promise: "An introduction ready to forward", href: "#contact-forward", question: "How would you introduce his work to a colleague in plain language?", phone: true },
] as const;

