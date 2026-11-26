/**
 * Retains local conversation state while the assistant region is hidden.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Hook
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useRef, useState } from "react";
import { requestChatTurn } from "./client";
import type { ChatMessage } from "./types";

interface Conversation {
  id: number;
  draft: string;
  messages: ChatMessage[];
  busy?: boolean;
  error?: string;
}

function emptyConversation(id: number): Conversation {
  return { id, draft: "", messages: [] };
}

export function conversationTitle(conversation: Conversation) {
  const first = conversation.messages[0]?.content;
  return first ? first.trim() : "New conversation";
}

export function useAssistantConversations(
  modelCode: string | undefined,
  scopeKey: string | undefined,
  onAccessFailure: (error: unknown, scopeKey: string) => boolean,
) {
  const nextId = useRef(2);
  const sending = useRef(new Set<number>());
  const [activeId, setActiveId] = useState(1);
  const [conversations, setConversations] = useState(() => [emptyConversation(1)]);
  const active = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];

  function update(id: number, patch: Partial<Conversation>) {
    setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, ...patch } : conversation));
  }

  function start() {
    const id = nextId.current++;
    setConversations((current) => [emptyConversation(id), ...current]);
    setActiveId(id);
  }

  function clear() {
    if (sending.current.has(active.id)) return;
    update(active.id, { ...emptyConversation(active.id), busy: false, error: undefined });
  }

  async function send() {
    const { id, draft, messages } = active;
    const text = draft.trim();
    if (!text || !modelCode || !scopeKey || sending.current.has(id)) return;
    sending.current.add(id);
    update(id, { busy: true, error: undefined });
    const history = [...messages, { role: "user" as const, content: text }];
    try {
      const reply = await requestChatTurn(history, scopeKey, { modelCode });
      update(id, { messages: [...history, reply.message], draft: "", busy: false });
    } catch (error) {
      const blocked = onAccessFailure(error, scopeKey);
      update(id, { error: blocked ? undefined : error instanceof Error ? error.message : "Chat request failed", busy: false });
    } finally {
      sending.current.delete(id);
    }
  }

  return { active, conversations, setActiveId, start, clear, send, setDraft: (draft: string) => update(active.id, { draft }) };
}
