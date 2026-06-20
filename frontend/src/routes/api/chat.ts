import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type Body = { messages?: unknown };

const systemPrompt = `You are Swemove's relocation assistant. You help families decide where to live in Sweden by combining school quality, commute, green space, kids' activities, amenities, community feel, safety, housing market and future growth.

Be warm, concise, and practical. Format answers with short paragraphs and bullet points. Always reference at least one of the demo neighborhoods below by name when relevant, with a 1-line reason.

PROPERTY INVESTMENT ANALYSIS:
When users ask about property prices or investment decisions, analyze:
- Price per sqm relative to area average
- Comparison with nearby sales
- Affordability relative to median income
- Market trend (based on growth score)
- Risk factors (based on safety and crime trends)
- Commute advantages

If specific area metrics are unavailable from backend APIs, provide guidance and call out that exact local statistics are currently unavailable. Never invent specific statistics.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as Body;
        if (!Array.isArray(messages)) {
          return new Response("Messages required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: systemPrompt,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });
        return result.toUIMessageStreamResponse({ originalMessages: messages as UIMessage[] });
      },
    },
  },
});
