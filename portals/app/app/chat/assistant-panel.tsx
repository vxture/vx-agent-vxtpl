/**
 * Workspace assistant conversation panel.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon, Input, ShellIconButton } from "../ds";
import { conversationTitle, type useAssistantConversations } from "./assistant-conversations";
import "./assistant-panel.css";

interface AssistantPanelProps {
  readonly chat: ReturnType<typeof useAssistantConversations>;
  readonly wide: boolean;
  readonly onWidthChange: () => void;
  readonly onClose: () => void;
}

function WidthGlyph({ wide }: { wide: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v18m-8-9h5m6 0h5" />
      <path d={wide ? "m6 9 3 3-3 3m12-6-3 3 3 3" : "m7 9-3 3 3 3m10-6 3 3-3 3"} />
    </svg>
  );
}

export function AssistantPanel({ chat, wide, onWidthChange, onClose }: AssistantPanelProps) {
  const messages = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<"history" | "actions" | null>(null);
  const { active } = chat;
  useEffect(() => {
    if (messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [active.messages]);

  return (
    <section
      className="assistant-panel"
      aria-label="AI assistant conversation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu) {
          event.preventDefault();
          setMenu(null);
        }
      }}
    >
      <header className="assistant-panel-header">
        <h2><Icon name="sparkles" size="sm" aria-hidden="true" /><span>AI assistant</span></h2>
        <div className="assistant-panel-actions">
          <ShellIconButton icon="arrow-left-right" label={wide ? "Narrow assistant" : "Widen assistant"} onClick={onWidthChange}>
            <WidthGlyph wide={wide} />
          </ShellIconButton>
          <ShellIconButton icon="plus" label="New conversation" onClick={() => { setMenu(null); chat.start(); }} />
          <ShellIconButton icon="list" label="All conversations" active={menu === "history"} onClick={() => setMenu(menu === "history" ? null : "history")} />
          <ShellIconButton icon="dots-three" label="More conversation actions" active={menu === "actions"} onClick={() => setMenu(menu === "actions" ? null : "actions")} />
          <ShellIconButton icon="x" label="Close assistant" onClick={onClose} />
          {menu === "history" && (
            <div className="assistant-panel-menu" aria-label="All conversations">
              <ul className="assistant-conversation-list">
                {chat.conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      aria-current={active.id === conversation.id || undefined}
                      onClick={() => { chat.setActiveId(conversation.id); setMenu(null); }}
                    >
                      {conversationTitle(conversation)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {menu === "actions" && (
            <div className="assistant-panel-menu" aria-label="Conversation actions">
              <Button variant="ghost" disabled={active.busy || (!active.messages.length && !active.draft)} onClick={() => { chat.clear(); setMenu(null); }}>Clear conversation</Button>
            </div>
          )}
        </div>
      </header>
      <div ref={messages} className="assistant-panel-messages" role="log" aria-label="Conversation messages">
        {active.messages.length === 0 && (
          <div className="assistant-panel-empty">
            <Icon name="sparkles" size="xl" aria-hidden="true" />
            <h3>Where should we start?</h3>
            <p>Tell me what you want to work on.</p>
          </div>
        )}
        {active.messages.map((message, index) => (
          <div className="assistant-panel-message" key={index} data-role={message.role}>{message.content}</div>
        ))}
        {active.busy && <p role="status">Thinking...</p>}
      </div>
      <form className="assistant-panel-composer" onSubmit={(event) => { event.preventDefault(); void chat.send(); }}>
        {active.error && <p role="alert">{active.error}</p>}
        <div>
          <Input aria-label="Message assistant" value={active.draft} onChange={(event) => chat.setDraft(event.target.value)} maxLength={500} disabled={active.busy} />
          <Button type="submit" disabled={active.busy || !active.draft.trim()}>Send</Button>
        </div>
      </form>
    </section>
  );
}
