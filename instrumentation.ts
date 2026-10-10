/**
 * OpenTelemetry for the agent, registered only when someone is listening.
 *
 * With OTEL_EXPORTER_OTLP_ENDPOINT set, spans go to that collector (Langfuse,
 * Phoenix, Datadog, Jaeger: anything that speaks OTLP). OTEL_DEBUG=console
 * prints them to the server log for a local check. With neither, nothing is
 * registered and @opentelemetry/api stays a no-op, so the agent pays nothing.
 * Span attributes follow the OpenTelemetry GenAI semantic conventions
 * (lib/agent/graph.ts).
 */
export async function register() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const debug = process.env.OTEL_DEBUG === "console";
  if (!endpoint && !debug) return;
  const { registerOTel } = await import("@vercel/otel");
  if (debug) {
    const { ConsoleSpanExporter } = await import("@opentelemetry/sdk-trace-base");
    registerOTel({ serviceName: "kushal-portfolio", traceExporter: new ConsoleSpanExporter() });
  } else {
    registerOTel({ serviceName: "kushal-portfolio" });
  }
}
