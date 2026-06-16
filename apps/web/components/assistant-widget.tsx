"use client";

import { Bot, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "How many candidates are in each funnel stage?",
  "Find contacts stuck at 'applied'",
  "Draft a welcome email for new sign-ups"
];

export function AssistantWidget({ lcId, lcName }: { lcId: string; lcName: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, tools]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setTools([]);
    const history: Msg[] = [...messages, { role: "user", text: trimmed }];
    setMessages([...history, { role: "assistant", text: "" }]);
    setBusy(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lcId, messages: history })
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        appendToLast(`⚠️ ${err.error ?? "Something went wrong."}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as { type: string; value?: string; name?: string; status?: string; message?: string };
          if (evt.type === "text" && evt.value) appendToLast(evt.value);
          else if (evt.type === "tool" && evt.status === "running" && evt.name) setTools((t) => [...t, evt.name!]);
          else if (evt.type === "error") appendToLast(`\n\n⚠️ ${evt.message}`);
        }
      }
    } catch {
      appendToLast("⚠️ Connection interrupted.");
    } finally {
      setBusy(false);
      setTools([]);
    }
  }

  function appendToLast(chunk: string) {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") next[next.length - 1] = { ...last, text: last.text + chunk };
      return next;
    });
  }

  return (
    <>
      {!open && (
        <button className="assistant-fab" onClick={() => setOpen(true)} aria-label="Open AI assistant">
          <Sparkles size={18} />
        </button>
      )}

      {open && (
        <div className="assistant-panel" role="dialog" aria-label="AI assistant">
          <header className="assistant-head">
            <span className="assistant-title">
              <Bot size={16} /> CRM Assistant
            </span>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close assistant">
              <X size={15} />
            </button>
          </header>

          <div className="assistant-body" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="assistant-empty">
                <Sparkles size={20} />
                <p>Ask me anything about <strong>{lcName}</strong>’s pipeline. I can search, summarize, and draft for you.</p>
                <div className="assistant-suggest">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "assistant-msg user" : "assistant-msg bot"}>
                  {m.text || (busy && i === messages.length - 1 ? <span className="assistant-typing">…</span> : "")}
                </div>
              ))
            )}
            {busy && tools.length > 0 && (
              <div className="assistant-tools">
                {tools.map((t, i) => (
                  <span key={i} className="assistant-tool-chip">⚙ {t.replace(/_/g, " ")}</span>
                ))}
              </div>
            )}
          </div>

          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask or instruct…"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
