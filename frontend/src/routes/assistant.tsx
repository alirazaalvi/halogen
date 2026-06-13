import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "AI Relocation Assistant — FamilyMove Sweden" },
      { name: "description", content: "Ask the FamilyMove AI assistant about neighborhoods, schools, commute and family life in Sweden." },
    ],
  }),
  component: AssistantPage,
});

const initial: UIMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    parts: [
      {
        type: "text",
        text:
          "Hej! I'm your FamilyMove assistant. Tell me about your family — kids' ages, where you work, budget, lifestyle — and I'll suggest the best Swedish neighborhoods for you.",
      },
    ],
  },
];

const suggestions = [
  "Best areas for young families",
  "Safest neighborhoods near Stockholm",
  "Best schools under 5M SEK",
  "Best areas without needing a car",
  "We have two children and work in Kista — which area?",
];

function AssistantPage() {
  const transport = useRef(new DefaultChatTransport({ api: "/api/chat" })).current;
  const { messages, sendMessage, status } = useChat({
    id: "assistant",
    messages: initial,
    transport,
  });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || isLoading) return;
    setInput("");
    await sendMessage({ text: t });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
        <div className="mb-6">
          <h1 className="font-display text-4xl">AI Relocation Assistant</h1>
          <p className="mt-2 text-muted-foreground">Tailored neighborhood recommendations powered by Lovable AI.</p>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto rounded-3xl border border-border bg-card/60 p-5">
          {messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              Thinking…
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a neighborhood, school, commute…"
            className="flex-1 rounded-2xl border border-border bg-card px-5 py-4 outline-none focus:border-primary"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-2xl bg-primary px-5 py-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

function Message({ m }: { m: UIMessage }) {
  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-leaf/20 text-leaf-foreground">✦</div>
      <div className="max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed">
        {text}
      </div>
    </div>
  );
}
