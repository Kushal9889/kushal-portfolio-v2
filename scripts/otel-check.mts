import { registerOTel } from "@vercel/otel";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
registerOTel({ serviceName: "check", traceExporter: new ConsoleSpanExporter() });
const { ask } = await import("/Users/kushalgaddamwar/vs_code/Claude/kushal-portfolio/v2/lib/agent/graph.ts");
const r = await ask("What did he build at IMG Systems?");
console.log("ANSWER_SOURCES", JSON.stringify(r.sources), "total", r.total);
await new Promise((ok) => setTimeout(ok, 6000));
