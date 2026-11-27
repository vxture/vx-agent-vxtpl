/**
 * Workspace conversation and platform call controls.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-27
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Icon, NativeSelect, SectionHeader, SegmentedControl, ShellIconButton, StatusBadge, Textarea, ViewHeader } from "../ds";
import { ProductHeader } from "../framework/product-chrome";
import { WorkspaceRegions } from "../framework/workspace-regions";
import { AssistantPanel } from "./assistant-panel";
import { useAssistantConversations } from "./assistant-conversations";
import { ChatVerification } from "./chat-verification";
import { readChatHistory, saveChatTurn, type SavedTurn } from "./chat-history";
import { handleChatComposerKey, isChatEscapeKey, useChatInputHistory } from "./chat-keyboard";
import { ChatRequestError, requestChatTurn, type ChatContext } from "./client";
import { DOCUMENT_CONVERSION_SKILL, MAX_HISTORY_MESSAGES, MAX_MESSAGE_LENGTH, WEB_SEARCH_SKILL, type ChatMessage, type ChatTarget, type TurnVerification } from "./types";
import { ChatWorkspaceAccess } from "./workspace-access";
import "./chat-workspace.css";

// Conversation presets

const CHAT_EXAMPLE = "\u8bf7\u7528\u4e00\u53e5\u8bdd\u8bf4\u51fa\u5de5\u4f5c\u8fdb\u5c55\u5468\u62a5\u5e94\u8be5\u5305\u542b\u7684\u4e09\u9879\u4fe1\u606f\u3002";
const HTML_EXAMPLE = "<article>\n  <h1>\u9879\u76ee\u5468\u62a5</h1>\n  <p>\u672c\u5468\u5b8c\u6210\u9700\u6c42\u8bc4\u5ba1\uff0c\u4e0b\u5468\u5f00\u59cb\u8054\u8c03\u3002</p>\n</article>";
const SKILL_LABELS: Record<string, string> = {
  [DOCUMENT_CONVERSION_SKILL]: "HTML \u8f6c Markdown",
  summarize: "\u6458\u8981",
  [WEB_SEARCH_SKILL]: "\u7f51\u7edc\u641c\u7d22",
  "code-exec": "\u4ee3\u7801\u6267\u884c",
  "data-analysis": "\u6570\u636e\u5206\u6790",
};

const EMPTY_HISTORY: SavedTurn[] = [];

interface WorkspaceHistory {
  scopeKey: string;
  turns: SavedTurn[];
  storageFailed: boolean;
}
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
  const [history, setHistory] = useState<WorkspaceHistory | null>(null);
  const [draft, setDraft] = useState("");
  const [submission, setSubmission] = useState<Extract<TurnVerification, { state: "pending" }> | null>(null);
  const [sendError, setSendError] = useState<string>();
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantWide, setAssistantWide] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const receiptRef = useRef<HTMLElement>(null);
  const receiptTriggerRef = useRef<HTMLButtonElement>(null);
  const receiptLauncherRef = useRef<HTMLButtonElement>(null);
  const receiptFocusTarget = useRef<"panel" | "launcher" | null>(null);
  const sending = useRef(false);

  const scopeKey = ctx?.productAccess ? ctx.scopeKey : undefined;
  const scopedHistory = history && history.scopeKey === scopeKey ? history : null;
  const turns = blocked ? EMPTY_HISTORY : scopedHistory?.turns ?? EMPTY_HISTORY;
  const prompts = useMemo(() => turns.map(({ prompt }) => prompt), [turns]);
  const { value: input, handleHistoryKey, resetHistory } = useChatInputHistory(prompts, draft);
  const direct = mode === "model";
  const busy = submission !== null;
  const currentReceipt = blocked ? null : submission ?? turns.at(-1) ?? null;
  const selectedIndex = turns.findIndex((turn) => turn.id === selectedReceiptId);
  const visibleReceipt = turns[selectedIndex] ?? currentReceipt;
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
  const canSend = !blocked && Boolean(scopedHistory && atlasTarget) && (!useRunos || Boolean(skill));
  const canSubmit = canSend && !busy && Boolean(input.trim());
  const assistant = useAssistantConversations(blocked ? undefined : defaultRoute?.code, ctx?.scopeKey, onAccessFailure);

  useEffect(() => {
    if (!scopeKey) return;
    let active = true;
    void readChatHistory(scopeKey).then((turns) => {
      if (active) setHistory({ scopeKey, turns, storageFailed: false });
    }).catch(() => {
      if (active) setHistory({ scopeKey, turns: [], storageFailed: true });
    });
    return () => { active = false; };
  }, [scopeKey]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, busy]);

  useEffect(() => {
    const target = receiptFocusTarget.current;
    receiptFocusTarget.current = null;
    if (target === "panel") {
      const panel = receiptRef.current;
      panel?.scrollIntoView({ block: "start" });
      panel?.focus({ preventScroll: true });
    } else if (target === "launcher") {
      (receiptLauncherRef.current ?? composerRef.current)?.focus({ preventScroll: true });
    }
  }, [receiptOpen]);

  function inspectReceipt(id: string, trigger: HTMLButtonElement) {
    receiptTriggerRef.current = trigger;
    setSelectedReceiptId(id);
    if (receiptOpen) {
      receiptRef.current?.scrollIntoView({ block: "nearest" });
      receiptRef.current?.focus({ preventScroll: true });
    } else {
      receiptFocusTarget.current = "panel";
      setReceiptOpen(true);
    }
  }

  function closeReceipt(restoreFocus: boolean) {
    receiptFocusTarget.current = restoreFocus ? "launcher" : null;
    setReceiptOpen(false);
  }

  function openReceipt() {
    receiptTriggerRef.current = null;
    receiptFocusTarget.current = "panel";
    setReceiptOpen(true);
  }

  function returnFromReceipt() {
    const trigger = receiptTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
    else composerRef.current?.focus();
  }

  async function rememberTurn(scopeKey: string, turn: SavedTurn) {
    const saved = await saveChatTurn(scopeKey, turn).then(() => true, () => false);
    setHistory((current) => current?.scopeKey === scopeKey
      ? { ...current, turns: [...current.turns, turn], storageFailed: current.storageFailed || !saved }
      : current);
  }

  // Submission and evidence share the same immutable selection for this turn.

  async function send() {
    const text = input.trim();
    if (!text || sending.current || !canSend || !ctx || !atlasTarget) return;

    const target = { atlasTarget, skillCode: skill?.code };
    const next: ChatMessage[] = turns.filter((turn) => turn.state === "received")
      .slice(-Math.floor((MAX_HISTORY_MESSAGES - 1) / 2)).flatMap(({ prompt, reply }) => [
        { role: "user", content: prompt },
        { role: "assistant", content: reply.message.content.slice(0, MAX_MESSAGE_LENGTH) },
      ]);
    next.push({ role: "user", content: text });
    sending.current = true;
    setDraft(input);
    resetHistory();
    setSelectedReceiptId(null);
    setSendError(undefined);
    setSubmission({ ...target, state: "pending" });
    try {
      const reply = await requestChatTurn(next, ctx.scopeKey, {
        target: target.atlasTarget,
        skillCode: target.skillCode,
      });
      await rememberTurn(ctx.scopeKey, { ...target, state: "received", reply, prompt: text, id: crypto.randomUUID(), createdAt: Date.now() });
      setDraft("");
    } catch (failure) {
      const accessHandled = onAccessFailure(failure, ctx.scopeKey);
      const requestError = failure instanceof ChatRequestError ? failure : undefined;
      if (!accessHandled) {
        const conversionFailed = requestError?.code === "DOCUMENT_CONVERSION_UNAVAILABLE";
        const searchFailed = requestError?.code === "WEB_SEARCH_UNAVAILABLE";
        const message = conversionFailed
          ? "Runos \u672a\u5b8c\u6210\u6587\u6863\u8f6c\u6362\u3002"
          : searchFailed ? "\u8054\u7f51\u641c\u7d22\u672a\u83b7\u5f97\u53ef\u7528\u6765\u6e90\u3002"
          : failure instanceof Error ? failure.message : "\u53d1\u9001\u5931\u8d25\u3002";
        await rememberTurn(ctx.scopeKey, {
          ...target, state: "failed", runosBlockedAtlas: conversionFailed || searchFailed,
          runosCallId: requestError?.callId, evidence: requestError?.evidence, message,
          prompt: text, id: crypto.randomUUID(), createdAt: Date.now(),
        });
        setSendError("\u8349\u7a3f\u5df2\u4fdd\u7559\uff0c\u53ef\u4fee\u6539\u540e\u91cd\u8bd5\u3002");
      }
    } finally {
      setSubmission(null);
      sending.current = false;
    }
  }

  // Conversation and controls

  return (
    <WorkspaceRegions
      className="chat-shell"
      width="1920"
      renderHeader={(actions, control) => (
        <>
          <ProductHeader workspace actions={actions} assistant={control} sessionRevision={revision} />
          {!receiptOpen && !assistantOpen && (
            <div className="chat-receipt-edge">
              <ShellIconButton ref={receiptLauncherRef} className="chat-receipt-edge-button"
                icon="sidebar" label={"\u5c55\u5f00\u8c03\u7528\u56de\u6267"} aria-controls="chat-call-receipts"
                aria-expanded={false} onClick={openReceipt} />
            </div>
          )}
        </>
      )}
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
        <div className="chat-workspace-grid" data-assistant-open={assistantOpen || undefined}
          data-receipt-closed={!receiptOpen || undefined}>
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

              <div ref={logRef} className="chat-log" role="log" aria-label={"\u5bf9\u8bdd\u6d88\u606f"}
                aria-keyshortcuts="Escape" tabIndex={0} onKeyDown={(event) => {
                  if (!isChatEscapeKey(event) || blocked) return;
                  event.preventDefault();
                  composerRef.current?.focus();
                }}>
                {turns.length === 0 && !busy && (
                  <div className="chat-empty">
                    <span className="chat-empty-icon"><Icon name={converting ? "file-text" : "chat-circle"} size="lg" aria-hidden="true" /></span>
                    <h2>{converting ? "\u4ece\u4e00\u6bb5 HTML \u5f00\u59cb" : "\u5f00\u59cb\u4e00\u8f6e\u5bf9\u8bdd"}</h2>
                    <p>{converting ? "\u7c98\u8d34\u77ed\u6587\u6863\uff0c\u6216\u586b\u5165\u6837\u4f8b\u67e5\u770b\u8f6c\u6362\u548c\u6458\u8981\u3002" : "\u8f93\u5165\u4e00\u6761\u6d88\u606f\uff0c\u6216\u586b\u5165\u6837\u4f8b\u67e5\u770b\u5b9e\u9645\u8c03\u7528\u7ed3\u679c\u3002"}</p>
                  </div>
                )}
                {turns.map((turn, index) => (
                  <div key={turn.id} className="chat-message-pair">
                    <p className="chat-message" data-role="user">{turn.prompt}</p>
                    <div className="chat-reply">
                      {turn.state === "received"
                        ? <p className="chat-message" data-role="assistant">{turn.reply.message.content}</p>
                        : <p className="chat-entry-error">{turn.message}</p>}
                      <Button type="button" variant="ghost" size="sm" onClick={(event) => inspectReceipt(turn.id, event.currentTarget)}
                        aria-controls="chat-call-receipts"
                        aria-label={`\u67e5\u770b\u7b2c ${index + 1} \u8f6e\u8c03\u7528\u56de\u6267`}>
                        {turn.state === "received" && turn.reply.skill?.sources?.length
                          ? "\u67e5\u770b\u6765\u6e90\u4e0e\u56de\u6267" : "\u67e5\u770b\u56de\u6267"}
                      </Button>
                    </div>
                  </div>
                ))}
                {busy && !blocked && <p className="chat-message" data-role="user">{input.trim()}</p>}
                {busy && !blocked && <p role="status" className="chat-log-status">{"\u6b63\u5728\u7b49\u5f85\u56de\u590d\u2026"}</p>}
              </div>

              <form className="chat-entry" onSubmit={(event) => {
                event.preventDefault();
                if (!canSubmit) return;
                composerRef.current?.focus({ preventScroll: true });
                void send();
              }}>
                {!blocked && sendError && <p className="chat-entry-error" role="alert">{sendError}</p>}
                <Textarea
                  ref={composerRef}
                  aria-label={converting ? "HTML \u6587\u6863" : "\u6d88\u606f"}
                  aria-describedby="chat-composer-shortcuts"
                  value={input}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  onChange={(event) => { resetHistory(); setDraft(event.target.value); }}
                  onKeyDown={(event) => { if (!handleHistoryKey(event)) handleChatComposerKey(event, canSubmit); }}
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
                      onClick={() => { resetHistory(); setDraft(sample); composerRef.current?.focus(); }}>
                      {"\u586b\u5165\u6837\u4f8b"}
                    </Button>
                  )}
                  <span id="chat-composer-shortcuts" className="chat-composer-hint">
                    <kbd>Enter</kbd>{" \u53d1\u9001 \u00b7 "}<kbd>Shift+Enter</kbd>{" \u6362\u884c \u00b7 "}<kbd>{"\u2191/\u2193"}</kbd>{" \u5386\u53f2"}
                  </span>
                  <span className="chat-entry-count">{input.length}/{MAX_MESSAGE_LENGTH}</span>
                  <Button type="submit" size="sm" disabled={!canSubmit} aria-keyshortcuts="Enter Control+Enter Meta+Enter">
                    {busy ? "\u53d1\u9001\u4e2d" : "\u53d1\u9001"}
                    <Icon name="arrow-up" size="sm" aria-hidden="true" />
                  </Button>
                </div>
              </form>
            </section>
          </div>
          <ChatVerification
            open={receiptOpen}
            onClose={closeReceipt}
            panelRef={receiptRef}
            turn={visibleReceipt}
            turnNumber={selectedIndex >= 0 ? selectedIndex + 1 : turns.length + (submission ? 1 : 0)}
            history={turns}
            storageFailed={!blocked && scopedHistory?.storageFailed}
            selectedReceiptId={selectedIndex >= 0 ? selectedReceiptId : null}
            onSelectReceipt={setSelectedReceiptId}
            onReturnFocus={blocked ? undefined : returnFromReceipt}
          />
        </div>
      </div>
    </WorkspaceRegions>
  );
}
