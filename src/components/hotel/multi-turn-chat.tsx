"use client";

import { ChevronDown, ChevronUp, Send, Sparkles } from "lucide-react";
import { useState } from "react";

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

export function MultiTurnChat({
  messages,
  pending,
  disabled,
  onSend,
}: {
  messages: ChatMessage[];
  pending: boolean;
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const submit = async () => {
    const message = value.trim();
    if (!message || pending || disabled) return;
    setValue("");
    setExpanded(true);
    await onSend(message);
  };
  return (
    <section className={`chat-dock${expanded ? " is-expanded" : ""}`}>
      <button
        className="chat-toggle"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <Sparkles size={21} />
        <span className="chat-summary">
          {messages.at(-1)?.text ?? "Tell me what matters: coffee, transit, or atmosphere…"}
        </span>
        {expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
      </button>
      {expanded ? (
        <div className="chat-transcript" aria-live="polite">
          {messages.length === 0 ? (
            <p className="chat-empty">
              Each turn can become a recalled preference and add new map pins.
            </p>
          ) : (
            messages.map((message) => (
              <p className={`chat-message ${message.role}`} key={message.id}>
                {message.text}
              </p>
            ))
          )}
          {pending ? (
            <p className="chat-message assistant typing">Recalling your preferences…</p>
          ) : null}
        </div>
      ) : null}
      <div className="chat-composer">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder={
            disabled ? "Sign in and search for hotels first" : "Add a preference or map pin…"
          }
          disabled={disabled || pending}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || pending || !value.trim()}
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </section>
  );
}
