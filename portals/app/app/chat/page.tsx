/**
 * Workspace conversation and platform call controls.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-27
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Icon, NativeSelect, SectionHeader, SegmentedControl, StatusBadge, Textarea, ViewHeader } from "../ds";
import { ProductHeader } from "../framework/product-chrome";
import { WorkspaceRegions } from "../framework/workspace-regions";
import { AssistantPanel } from "./assistant-panel";
import { useAssistantConversations } from "./assistant-conversations";
import { ChatVerification, type TurnVerification } from "./chat-verification";
import { ChatRequestError, requestChatTurn, type ChatContext } from "./client";
import { DOCUMENT_CONVERSION_SKILL, MAX_MESSAGE_LENGTH, type ChatMessage, type ChatTarget } from "./types";
import { ChatWorkspaceAccess } from "./workspace-access";
import "./chat-workspace.css";

// Conversation presets

const CHAT_EXAMPLE = "\u8bf7\u7528\u4e00\u53e5\u8bdd\u8bf4\u51fa\u5de5\u4f5c\u8fdb\u5c55\u5468\u62a5\u5e94\u8be5\u5305\u542b\u7684\u4e09\u9879\u4fe1\u606f\u3002";
const HTML_EXAMPLE = "<article>\n  <h1>\u9879\u76ee\u5468\u62a5</h1>\n  <p>\u672c\u5468\u5b8c\u6210\u9700\u6c42\u8bc4\u5ba1\uff0c\u4e0b\u5468\u5f00\u59cb\u8054\u8c03\u3002</p>\n</article>";
const SKILL_LABELS: Record<string, string> = {
  [DOCUMENT_CONVERSION_SKILL]: "HTML \u8f6c Markdown",
  summarize: "\u6458\u8981",
  "web-search": "\u7f51\u7edc\u641c\u7d22",
  "code-exec": "\u4ee3\u7801\u6267\u884c",
  "data-analysis": "\u6570\u636e\u5206\u6790",
};

type CompletedTurn = Extract<TurnVerification, { state: "received" }> & { prompt: string };
type AtlasMode = "route" | "model";

interface WorkspaceProps {
  ctx: ChatContext | null;
  blocked: boolean;
  revision: number;
  onAccessFailure: (error: unknown, scopeKey: string) => boolean;
}

export default function ChatPage() {
  return (
    <ChatWorkspaceAccess>
      {({ context, blocked, revision, scopeVersion, onAccessFailure }) => (
        <ChatWorkspace key={scopeVersion} ctx={context} blocked={blocked} revision={revision} onAccessFailure={onAccessFailure} />
      )}
    </ChatWorkspaceAccess>
  );
}

function ChatWorkspace({ ctx, blocked, revision, onAccessFailure }: WorkspaceProps) {
  const [preferredRoute, setPreferredRoute] = useState("");
  const [preferredModel, setPreferredModel] = useState("");
  const [mode, setMode] = useState<AtlasMode>("route");
  const [useRunos, setUseRunos] = useState(false);
  const [preferredSkill, setPreferredSkill] = useState(DOCUMENT_CONVERSION_SKILL);
  const [turns, setTurns] = useState<CompletedTurn[]>([]);
  const [input, setInput] = useState("");
  const [submission, setSubmission] = useState<Exclude<TurnVerification, { state: "received" }> | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<number | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantWide, setAssistantWide] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const receiptRef = useRef<HTMLElement>(null);
  const sending = useRef(false);

  const direct = mode === "model";
  const busy = submission?.state === "pending";
  const currentReceipt = submission ?? turns.at(-1) ?? null;
  const visibleReceipt = selectedReceipt === null ? currentReceipt : turns[selectedReceipt] ?? currentReceipt;
  const availableRoutes = ctx?.models.filter((route) => route.allowed) ?? [];
  const defaultRoute = availableRoutes.find((route) => route.code === ctx?.defaultModelCode) ?? availableRoutes[0];
  const selectedRoute = preferredRoute ? availableRoutes.find((route) => route.code === preferredRoute) : defaultRoute;
  const directModels = ctx?.atlasDirectModels ?? null;
  const selectedModel = directModels?.find((model) => model.code === preferredModel);
  const atlasTarget: ChatTarget | null = direct
    ? selectedModel ? { modelCode: selectedModel.code } : null
    : selectedRoute ? { endpointCode: selectedRoute.code } : null;
  const availableSkills = ctx?.skills.filter((skill) => skill.allowed) ?? [];
  const selectedSkill = availableSkills.find((skill) => skill.code === preferredSkill);
  const skill = useRunos ? selectedSkill : undefined;
  const converting = skill?.code === DOCUMENT_CONVERSION_SKILL;
  const sample = converting ? HTML_EXAMPLE : useRunos ? null : CHAT_EXAMPLE;
  const canSend = !blocked && Boolean(atlasTarget) && (!useRunos || Boolean(skill));
  const assistant = useAssistantConversations(blocked ? undefined : defaultRoute?.code, ctx?.scopeKey, onAccessFailure);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, busy]);

  function inspectReceipt(index: number | null) {
    setSelectedReceipt(index);
    receiptRef.current?.focus({ preventScroll: true });
    receiptRef.current?.scrollIntoView({ block: "nearest" });
  }

  // Submission and evidence share the same immutable selection for this turn.

  async function send() {
    const text = input.trim();
    if (!text || sending.current || !canSend || !ctx || !atlasTarget) return;

    const target = { atlasTarget, skillCode: skill?.code };
    const next: ChatMessage[] = turns.flatMap(({ prompt, reply }) => [
      { role: "user", content: prompt },
      reply.message,
    ]);
    next.push({ role: "user", content: text });
    sending.current = true;
    setSelectedReceipt(null);
    setSubmission({ ...target, state: "pending" });
    try {
      const reply = await requestChatTurn(next, ctx.scopeKey, {
        target: target.atlasTarget,
        skillCode: target.skillCode,
      });
      setTurns((history) => [...history, { ...target, state: "received", reply, prompt: text }]);
      setInput("");
      setSubmission(null);
    } catch (failure) {
      const accessHandled = onAccessFailure(failure, ctx.scopeKey);
      const requestError = failure instanceof ChatRequestError ? failure : undefined;
      const conversionFailed = requestError?.code === "DOCUMENT_CONVERSION_UNAVAILABLE";
      setSubmission({
        ...target,
        state: "failed",
        conversionFailed,
        runosCallId: conversionFailed ? requestError?.callId : undefined,
        evidence: requestError?.evidence,
        message: accessHandled ? undefined : conversionFailed
          ? "Runos \u672a\u5b8c\u6210\u6587\u6863\u8f6c\u6362\uff0c\u8349\u7a3f\u5df2\u4fdd\u7559\u3002"
          : failure instanceof Error ? failure.message : "\u53d1\u9001\u5931\u8d25\uff0c\u8349\u7a3f\u5df2\u4fdd\u7559\u3002",
      });
    } finally {
      sending.current = false;
    }
  }

  // Conversation and controls

  return (
    <WorkspaceRegions
      className="chat-shell"
      width="1920"
      renderHeader={(actions, control) => <ProductHeader workspace actions={actions} assistant={control} sessionRevision={revision} />}
      right={defaultRoute || assistantOpen ? {
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
      <div className="chat-workspace">
        <div className="chat-workspace-grid" data-assistant-open={assistantOpen || undefined}>
          <div className="chat-main max-w-content-ultra-3xl">
            <ViewHeader
              icon="chat-circle"
              title={"\u5bf9\u8bdd\u5de5\u4f5c\u53f0"}
              description={"\u901a\u8fc7 Atlas \u8def\u7531\u6216\u6307\u5b9a\u6a21\u578b\u53d1\u8d77\u5bf9\u8bdd\u3002"}
              secondary={ctx?.atlasSource === "mock" ? <StatusBadge tone="warning">{"\u79bb\u7ebf\u6837\u4f8b"}</StatusBadge> : undefined}
              action={(
                <Button asChild size="sm" variant="ghost">
                  <a href="/platform-check#platform-actions">
                    {"\u63a5\u53e3\u9a8c\u6536"} <Icon name="arrow-right" size="sm" aria-hidden="true" />
                  </a>
                </Button>
              )}
            />
            <section className="chat-conversation" aria-label={"\u5bf9\u8bdd"}>
              <div className="chat-configuration">
                <SectionHeader title={"Atlas \u8c03\u7528"} level={2} divider={false} className="chat-configuration-heading" />
                <div className="chat-mode" onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                  if (!(event.target instanceof HTMLButtonElement) || event.target.getAttribute("role") !== "radio") return;
                  const nextOption = event.currentTarget.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="false"]:enabled');
                  if (!nextOption || event.target === nextOption) return;
                  event.preventDefault();
                  nextOption.click();
                  nextOption.focus();
                }}>
                  <span className="chat-field-label">{"\u8c03\u7528\u65b9\u5f0f"}</span>
                  <SegmentedControl<AtlasMode>
                    ariaLabel={"Atlas \u8c03\u7528\u65b9\u5f0f"}
                    value={mode}
                    onChange={setMode}
                    items={[
                      { value: "route", label: "\u8def\u7531\u8c03\u7528", disabled: busy || blocked },
                      { value: "model", label: "\u6a21\u578b\u76f4\u8c03", disabled: busy || blocked },
                    ]}
                  />
                </div>
                <div className="chat-configuration-fields">
                  {direct ? (
                    <label>
                      <span>{"Atlas \u6a21\u578b"}</span>
                      <NativeSelect value={selectedModel?.code ?? ""} onChange={(event) => setPreferredModel(event.target.value)}
                        disabled={busy || blocked || !directModels?.length}>
                        <option value="">{!ctx ? "\u6b63\u5728\u8bfb\u53d6\u6388\u6743\u6a21\u578b"
                          : ctx.atlasSource === "mock" ? "\u79bb\u7ebf\u9884\u89c8\u672a\u8fde\u63a5 Atlas"
                          : ctx.atlasDirectRequiredTier ? "\u9700 " + ctx.atlasDirectRequiredTier.toUpperCase() + " \u5957\u9910"
                          : directModels === null ? "\u6388\u6743\u76ee\u5f55\u6682\u4e0d\u53ef\u7528"
                          : directModels.length ? "\u9009\u62e9\u5df2\u6388\u6743\u6a21\u578b" : "\u6ca1\u6709\u5df2\u6388\u6743\u7684\u5bf9\u8bdd\u6a21\u578b"}</option>
                        {directModels?.map(({ code, name, provider }) => (
                          <option key={code} value={code}>
                            {name === code ? code : name + " \u00b7 " + code}{" \u00b7 "}{provider}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  ) : (
                    <label>
                      <span>{"Atlas \u8def\u7531"}</span>
                      <NativeSelect value={selectedRoute?.code ?? ""} onChange={(event) => setPreferredRoute(event.target.value)}
                        disabled={busy || blocked || !availableRoutes.length}>
                        {!selectedRoute && <option value="">{!ctx ? "\u6b63\u5728\u8bfb\u53d6\u8def\u7531"
                          : ctx.atlasRouteCatalogAvailable === false ? "\u6388\u6743\u76ee\u5f55\u6682\u4e0d\u53ef\u7528"
                          : availableRoutes.length ? "\u91cd\u65b0\u9009\u62e9\u8def\u7531" : "\u6ca1\u6709\u5df2\u6388\u6743\u7684\u5bf9\u8bdd\u8def\u7531"}</option>}
                        {availableRoutes.map(({ code }) => <option key={code} value={code}>{code}</option>)}
                      </NativeSelect>
                    </label>
                  )}
                  {useRunos && (
                    <label>
                      <span>{"Runos \u80fd\u529b"}</span>
                      <NativeSelect value={skill?.code ?? ""} onChange={(event) => setPreferredSkill(event.target.value)}
                        disabled={busy || blocked || !availableSkills.length}>
                        {!skill && <option value="">{availableSkills.length ? "\u9009\u62e9\u4e00\u4e2a\u80fd\u529b" : "\u6682\u65e0\u53ef\u7528\u80fd\u529b"}</option>}
                        {ctx?.skills.map(({ code, label, allowed, requiredTier }) => (
                          <option key={code} value={code} disabled={!allowed}>
                            {SKILL_LABELS[code] ?? label}{!allowed && requiredTier ? " \u00b7 \u9700\u8981 " + requiredTier.toUpperCase() : ""}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  )}
                </div>
                <div className="chat-flow-hint">
                  <p>{converting ? "Runos \u8f6c\u6362 HTML \u4e3a Markdown\uff0cAtlas \u751f\u6210\u6458\u8981"
                    : useRunos ? "Atlas \u57fa\u4e8e Runos \u8fd4\u56de\u7684\u5185\u5bb9\u751f\u6210\u56de\u590d"
                    : direct ? "\u901a\u8fc7 Atlas \u8bf7\u6c42\u6240\u9009\u6a21\u578b"
                    : ctx?.atlasSource === "mock" ? `${availableRoutes.length} \u6761\u79bb\u7ebf\u8def\u7531\u6837\u4f8b`
                    : ctx && ctx.atlasRouteCatalogAvailable !== false
                      ? `${availableRoutes.length} \u6761\u53ef\u9009\u5bf9\u8bdd\u8def\u7531\uff0c\u8def\u7531\u7f16\u7801\u6765\u81ea Atlas`
                      : null}</p>
                  {availableSkills.length > 0 && (
                    <div className="chat-runos-toggle">
                      <Checkbox id="chat-runos" checked={useRunos} disabled={busy || blocked}
                        onCheckedChange={(checked) => setUseRunos(checked === true)} />
                      <label htmlFor="chat-runos">{"Runos \u9884\u5904\u7406"}</label>
                    </div>
                  )}
                </div>
              </div>

              <div ref={logRef} className="chat-log" role="log" aria-label={"\u5bf9\u8bdd\u6d88\u606f"} tabIndex={0}>
                {turns.length === 0 && !busy && (
                  <div className="chat-empty">
                    <span className="chat-empty-icon"><Icon name={converting ? "file-text" : "chat-circle"} size="lg" aria-hidden="true" /></span>
                    <h2>{converting ? "\u4ece\u4e00\u6bb5 HTML \u5f00\u59cb" : "\u5f00\u59cb\u4e00\u8f6e\u5bf9\u8bdd"}</h2>
                    <p>{converting ? "\u7c98\u8d34\u77ed\u6587\u6863\uff0c\u6216\u586b\u5165\u6837\u4f8b\u67e5\u770b\u8f6c\u6362\u548c\u6458\u8981\u3002" : "\u8f93\u5165\u4e00\u6761\u6d88\u606f\uff0c\u6216\u586b\u5165\u6837\u4f8b\u67e5\u770b\u5b9e\u9645\u8c03\u7528\u7ed3\u679c\u3002"}</p>
                  </div>
                )}
                {turns.map(({ prompt, reply }, index) => (
                  <div key={index} className="chat-message-pair">
                    <p className="chat-message" data-role="user">{prompt}</p>
                    <div className="chat-reply">
                      <p className="chat-message" data-role="assistant">{reply.message.content}</p>
                      <Button type="button" variant="ghost" size="sm" onClick={() => inspectReceipt(index)}
                        aria-controls="chat-call-receipts"
                        aria-label={`\u67e5\u770b\u7b2c ${index + 1} \u8f6e\u8c03\u7528\u56de\u6267`}>
                        {"\u67e5\u770b\u56de\u6267"}
                      </Button>
                    </div>
                  </div>
                ))}
                {busy && <p className="chat-message" data-role="user">{input.trim()}</p>}
                {busy && <p role="status" className="chat-log-status">{"\u6b63\u5728\u7b49\u5f85\u56de\u590d\u2026"}</p>}
              </div>

              <form className="chat-entry" onSubmit={(event) => { event.preventDefault(); void send(); }}>
                {submission?.state === "failed" && submission.message && <p className="chat-entry-error" role="alert">{submission.message}</p>}
                <Textarea
                  ref={composerRef}
                  aria-label={converting ? "HTML \u6587\u6863" : "\u6d88\u606f"}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={converting ? "\u7c98\u8d34\u4e00\u6bb5 HTML\u2026" : "\u8f93\u5165\u6d88\u606f\u2026"}
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={2}
                  className="chat-input"
                  disabled={blocked}
                  readOnly={busy}
                />
                <div className="chat-entry-actions">
                  {sample && (
                    <Button type="button" variant="ghost" size="sm" disabled={busy || !canSend || Boolean(input.trim())}
                      onClick={() => { setInput(sample); composerRef.current?.focus(); }}>
                      {"\u586b\u5165\u6837\u4f8b"}
                    </Button>
                  )}
                  <span className="chat-entry-count">{input.length}/{MAX_MESSAGE_LENGTH}</span>
                  <Button type="submit" size="sm" disabled={busy || !canSend || !input.trim()}>
                    {busy ? "\u53d1\u9001\u4e2d" : "\u53d1\u9001"}
                    <Icon name="arrow-up" size="sm" aria-hidden="true" />
                  </Button>
                </div>
              </form>
            </section>
          </div>
          <ChatVerification
            panelRef={receiptRef}
            turn={visibleReceipt}
            turnNumber={selectedReceipt !== null ? selectedReceipt + 1 : turns.length + (submission ? 1 : 0)}
            onLatest={selectedReceipt !== null && visibleReceipt !== currentReceipt ? () => inspectReceipt(null) : undefined}
          />
        </div>
      </div>
    </WorkspaceRegions>
  );
}
