/**
 * Full workspace chat and its optional assistant panel.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Stack,
  StatusBadge,
} from "../ds";
import { DOCUMENT_CONVERSION_SKILL, MAX_MESSAGE_LENGTH, type ChatMessage, type ChatReply, type SkillOutcome } from "./types";
import type { GatedOption } from "./catalog";
import { requestChatTurn, type ChatContext } from "./client";
import { AssistantPanel } from "./assistant-panel";
import { useAssistantConversations } from "./assistant-conversations";
import { ChatWorkspaceAccess } from "./workspace-access";
import { ProductHeader } from "../framework/product-chrome";
import { WorkspaceRegions } from "../framework/workspace-regions";

// Chat surface. Talks to /api/chat, which requires a signed-in session: the
// workspace it resolves entitlement for is also what the S2S token is minted
// against and what Atlas attributes the call to. Model and skill selection are
// entitlement-gated (tier -> CAPABILITY_MATRIX, entitlement/capability.ts), and
// a selected skill is executed as a real Runos capability.

const NO_SKILL = "";

type TurnMeta = Omit<ChatReply, "message">;

function tierLabel(tier: string | null): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "No subscription";
}

function tierTone(tier: string | null): "neutral" | "warning" | "brand" {
  if (!tier) return "neutral";
  if (tier === "free" || tier === "starter") return "warning";
  return "brand";
}

/**
 * Model and skill, as toolbar pills rather than sidebar cards.
 *
 * A picker parked in a sidebar reads as configuration you set once. These are a
 * per-turn choice, so they sit next to the thing they change. The `label` is
 * part of the control rather than a heading above it, which is what lets two of
 * them share one row without either looking like a section.
 *
 * An option the tier does not cover stays VISIBLE and disabled, carrying the
 * tier it needs. Hiding it would answer "why can I not pick that" with silence.
 */
function PillSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: GatedOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span className="pill-select">
      <span className="pill-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.code} value={o.code} disabled={!o.allowed}>
            {o.label}
            {!o.allowed ? ` \u{1F512} ${o.requiredTier ?? "?"}` : ""}
          </option>
        ))}
      </select>
    </span>
  );
}

/** What the selected skill actually did. Silence here would read as "it worked". */
function SkillReport({ skill }: { skill: SkillOutcome }) {
  const tone = skill.status === "ran" ? "success" : skill.status === "failed" ? "warning" : "neutral";
  return (
    <div style={{ marginTop: "0.6rem", fontSize: "0.8rem", color: "var(--vxtpl-slate)" }}>
      <StatusBadge tone={tone} dot>
        {skill.code}: {skill.status}
      </StatusBadge>
      {skill.capabilityId && (
        <div style={{ marginTop: 4 }}>
          via <code>{skill.capabilityId}</code>
        </div>
      )}
      {skill.callId && <div>Runos call <code>{skill.callId}</code></div>}
      {typeof skill.outcomeAcknowledged === "boolean" && (
        <div>{skill.outcomeAcknowledged ? "Outcome acknowledged" : "Outcome unconfirmed"}</div>
      )}
      {skill.detail && (
        <div style={{ marginTop: 4, wordBreak: "break-word" }}>{skill.detail.slice(0, 240)}</div>
      )}
    </div>
  );
}

/* Context and submission */

export default function ChatPage() {
  return (
    <ChatWorkspaceAccess>
      {({ context, blocked, revision, scopeVersion, onAccessFailure }) => (
        <ChatWorkspace key={scopeVersion} ctx={context} blocked={blocked} revision={revision} onAccessFailure={onAccessFailure} />
      )}
    </ChatWorkspaceAccess>
  );
}

function ChatWorkspace({ ctx, blocked, revision, onAccessFailure }: {
  ctx: ChatContext | null;
  blocked: boolean;
  revision: number;
  onAccessFailure: (error: unknown, scopeKey: string) => boolean;
}) {
  const [preferredModel, setModelCode] = useState("");
  const [preferredSkill, setSkillCode] = useState(NO_SKILL);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [turn, setTurn] = useState<TurnMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantWide, setAssistantWide] = useState(false);
  const assistantModel = ctx?.productAccess ? ctx.models.find((model) => model.allowed)?.code : undefined;
  const modelCode = ctx?.models.find((model) => model.code === preferredModel && model.allowed)?.code ?? assistantModel ?? ctx?.models[0]?.code ?? "";
  const skillCode = ctx?.skills.find((skill) => skill.code === preferredSkill && skill.allowed)?.code ?? NO_SKILL;
  const assistant = useAssistantConversations(blocked ? undefined : assistantModel, ctx?.scopeKey, onAccessFailure);
  const logRef = useRef<HTMLDivElement>(null);
  const sending = useRef(false);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending.current || blocked || !ctx) return;
    sending.current = true;
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setBusy(true);
    try {
      const body = await requestChatTurn(next, ctx.scopeKey, {
        modelCode: modelCode || undefined,
        skillCode: skillCode || undefined,
      });
      setMessages([...next, body.message]);
      setInput("");
      setTurn({
        mode: body.mode,
        modelCode: body.modelCode,
        skill: body.skill,
        skillCode: body.skillCode,
        taskId: body.taskId,
        requestId: body.requestId,
        usage: body.usage,
        latencyMs: body.latencyMs,
      });
    } catch (err) {
      if (!onAccessFailure(err, ctx.scopeKey)) setError(err instanceof Error ? err.message : "chat request failed");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  /* Conversation and diagnostics */

  return (
    <WorkspaceRegions
      width="1920"
      renderHeader={(actions, control) => <ProductHeader workspace actions={actions} assistant={control} sessionRevision={revision} />}
      right={assistantModel ? {
        title: "AI assistant",
        assistant: true,
        open: assistantOpen,
        onOpenChange: setAssistantOpen,
        wide: assistantWide,
        content: (_, close) => (
          <AssistantPanel chat={assistant} wide={assistantWide} onWidthChange={() => setAssistantWide((wide) => !wide)} onClose={close} />
        ),
      } : undefined}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.7rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.7rem" }}>Chat</h1>
        <StatusBadge tone="warning" dot>
          debug surface
        </StatusBadge>
        <StatusBadge tone={tierTone(ctx?.tier ?? null)} dot>
          {ctx ? tierLabel(ctx.tier) : "..."}
        </StatusBadge>
      </div>
      <p className="lede chat-intro">
        A tier-gated turn against the platform&apos;s model gateway; a selected skill runs as a real Runos
        capability. This is a DEBUG surface for verifying the S2S chain, not a product feature - turns are
        capped at 500 characters and 6 per minute.
      </p>

      {/* One conversation column; model and skill sit UNDER the composer, which
          is where every major assistant put them and not by coincidence. They
          are the last thing you touch before sending, so they belong at the end
          of the reading path, next to Send - not above the transcript, where
          they read as settings you configured before the conversation started.
          Keeping them adjacent to the input also means the choice and its effect
          are in one glance when a locked option explains itself.

          The transcript scrolls to the card's own edges and the composer block
          sits flush against its bottom rule, so the card contributes the frame
          only - its padding and inter-child gap are zeroed rather than worked
          around. */}
      <div className="chat-surface">
        <Card style={{ padding: 0, gap: 0, height: 560, overflow: "hidden", width: "100%" }}>
          <div
            ref={logRef}
            style={{ flex: 1, overflowY: "auto", padding: "1.2rem 1.4rem", display: "flex", flexDirection: "column", gap: 10 }}
          >
            {messages.length === 0 && (
              <span style={{ color: "var(--vxtpl-slate-faint)", fontSize: "0.88rem" }}>Say something to verify the round trip.</span>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "var(--vxtpl-accent-soft)" : "var(--vxtpl-paper)",
                  color: m.role === "user" ? "var(--vxtpl-accent-ink)" : "var(--vxtpl-ink-soft)",
                  border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                  borderRadius: 12,
                  padding: "0.55rem 0.85rem",
                  maxWidth: "min(78%, 640px)",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  fontSize: "0.92rem",
                  lineHeight: 1.5,
                }}
              >
                {m.content}
              </div>
            ))}
            {busy && <span style={{ color: "var(--vxtpl-slate-faint)", fontSize: "0.82rem" }}>thinking...</span>}
          </div>
          <div className="chat-composer">
            <div className="chat-composer__row">
              <Input
                style={{ flex: 1, minWidth: 0 }}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={skillCode === DOCUMENT_CONVERSION_SKILL ? "Paste a short HTML document" : "Type a short message"}
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={busy || blocked}
              />
              <Button onClick={send} disabled={busy || blocked || !input.trim()}>
                {busy ? "..." : "Send"}
              </Button>
            </div>

            <div className="chat-toolbar">
              {ctx ? (
                <>
                  <PillSelect label="Model" options={ctx.models} value={modelCode} onChange={setModelCode} />
                  <PillSelect
                    label="Skill"
                    options={[{ code: NO_SKILL, label: "None", allowed: true, requiredTier: null }, ...ctx.skills]}
                    value={skillCode}
                    onChange={setSkillCode}
                  />
                </>
              ) : (
                <span style={{ color: "var(--vxtpl-slate-faint)", fontSize: "0.82rem" }}>loading catalog...</span>
              )}
              {turn && (
                <span style={{ marginLeft: "auto" }}>
                  <StatusBadge tone={turn.mode === "atlas" ? "success" : "neutral"} dot>
                    {turn.mode === "atlas" ? "Atlas" : "Mock"}
                  </StatusBadge>
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* What the last turn actually did, under the conversation rather than
            beside it: it is a result, so it belongs downstream of the thing that
            produced it and it should not occupy width while there is nothing to
            report. */}
        {(turn?.skill || turn?.usage || turn?.taskId) && (
          <Stack gap="md" style={{ marginTop: "1rem" }}>
            {turn.skill && (
              <Card>
                <CardHeader>
                  <CardTitle>Skill</CardTitle>
                </CardHeader>
                <CardContent>
                  <SkillReport skill={turn.skill} />
                </CardContent>
              </Card>
            )}
            {(turn.usage || turn.taskId) && (
              <Card>
                <CardHeader>
                  <CardTitle>Last turn</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ fontSize: "0.8rem", color: "var(--vxtpl-slate)", lineHeight: 1.7 }}>
                    <div>
                      served by <code>{turn.modelCode}</code>
                    </div>
                    {turn.taskId && <div>Task <code>{turn.taskId}</code></div>}
                    {turn.requestId && <div>Atlas request <code>{turn.requestId}</code></div>}
                    {turn.usage && (
                      <div>
                        {turn.usage.promptTokens} prompt + {turn.usage.completionTokens} completion ={" "}
                        {turn.usage.totalTokens} tokens
                      </div>
                    )}
                    {turn.latencyMs != null && <div>{turn.latencyMs} ms</div>}
                  </div>
                </CardContent>
              </Card>
            )}
          </Stack>
        )}
      </div>

      {error && <p style={{ color: "var(--vxtpl-danger)", fontSize: "0.86rem", marginTop: "0.7rem" }}>{error}</p>}

      <nav className="page-links" aria-label="Chat diagnostics">
        <a href="/status">-&gt; integration status</a>
        <a href="/platform-check">-&gt; Atlas/Runos platform check</a>
      </nav>
    </WorkspaceRegions>
  );
}
