/**
 * Workspace assistant conversation panel.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, Icon, ShellIconButton, Textarea } from "../ds";
import { conversationTitle, type useAssistantConversations } from "./assistant-conversations";
import { handleChatComposerKey, isChatEscapeKey } from "./chat-keyboard";
import { MAX_MESSAGE_LENGTH } from "./types";
import "./assistant-panel.css";

// Panel layout

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

// Conversation controls and focus

export function AssistantPanel({ chat, wide, onWidthChange, onClose }: AssistantPanelProps) {
  const messages = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const menuContent = useRef<HTMLDivElement>(null);
  const id = useId();
  const [menu, setMenu] = useState<"history" | "actions" | null>(null);
  const { active } = chat;
  const canSend = chat.canSend && !active.busy && Boolean(active.draft.trim());
  useEffect(() => {
    if (messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [active.messages]);

  useEffect(() => {
    // Let a narrow native dialog open before moving focus into its composer.
    const frame = requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const content = menuContent.current;
    const target = content?.querySelector<HTMLButtonElement>('[aria-current="true"]') ??
      content?.querySelector<HTMLButtonElement>("button:enabled");
    target?.focus();
  }, [menu]);

  function focusComposer() {
    setMenu(null);
    composer.current?.focus({ preventScroll: true });
  }

  return (
    <section
      className="assistant-panel"
      aria-label="AI assistant conversation"
      aria-keyshortcuts="Escape"
      onKeyDown={(event) => {
        if (!isChatEscapeKey(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (!menu) {
          onClose();
          return;
        }
        setMenu(null);
        (menu === "history" ? historyTrigger : actionsTrigger).current?.focus();
      }}
    >
      <header className="assistant-panel-header">
        <h2><Icon name="sparkles" size="sm" aria-hidden="true" /><span>AI assistant</span></h2>
        <div className="assistant-panel-actions">
          <ShellIconButton icon="arrow-left-right" label={wide ? "Narrow assistant" : "Widen assistant"} onClick={onWidthChange}>
            <WidthGlyph wide={wide} />
          </ShellIconButton>
          <ShellIconButton icon="plus" label="New conversation" onClick={() => { chat.start(); focusComposer(); }} />
          <ShellIconButton ref={historyTrigger} icon="list" label="All conversations" active={menu === "history"}
            aria-expanded={menu === "history"} aria-controls={menu === "history" ? id + "-history" : undefined}
            onClick={() => setMenu(menu === "history" ? null : "history")} />
          <ShellIconButton ref={actionsTrigger} icon="dots-three" label="More conversation actions" active={menu === "actions"}
            aria-expanded={menu === "actions"} aria-controls={menu === "actions" ? id + "-actions" : undefined}
            onClick={() => setMenu(menu === "actions" ? null : "actions")} />
          <ShellIconButton icon="x" label="Close assistant" onClick={onClose} />
          {menu === "history" && (
            <div id={id + "-history"} ref={menuContent} className="assistant-panel-menu" aria-label="All conversations">
              <ul className="assistant-conversation-list">
                {chat.conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      aria-current={active.id === conversation.id || undefined}
                      onClick={() => { chat.setActiveId(conversation.id); focusComposer(); }}
                    >
                      {conversationTitle(conversation)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {menu === "actions" && (
            <div id={id + "-actions"} ref={menuContent} className="assistant-panel-menu" aria-label="Conversation actions">
              <Button variant="ghost" disabled={active.busy || (!active.messages.length && !active.draft)} onClick={() => { chat.clear(); focusComposer(); }}>Clear conversation</Button>
            </div>
          )}
        </div>
      </header>
      <div ref={messages} className="assistant-panel-messages" role="log" aria-label="Conversation messages" tabIndex={0}>
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
      <form className="assistant-panel-composer" onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        focusComposer();
        void chat.send();
      }}>
        {active.error && <p role="alert">{active.error}</p>}
        <div className="assistant-panel-composer-row">
          <Textarea ref={composer} aria-label="Message assistant" aria-describedby={id + "-shortcuts"}
            value={active.draft} onChange={(event) => chat.setDraft(event.target.value)}
            onKeyDown={(event) => handleChatComposerKey(event, canSend)}
            rows={2} maxLength={MAX_MESSAGE_LENGTH} readOnly={active.busy} />
          <Button type="submit" disabled={!canSend} aria-keyshortcuts="Enter Control+Enter Meta+Enter">Send</Button>
        </div>
        <div id={id + "-shortcuts"} className="assistant-panel-shortcuts">
          <kbd>Enter</kbd> to send <span aria-hidden="true">&middot;</span> <kbd>Shift+Enter</kbd> for a new line
        </div>
      </form>
    </section>
  );
}
