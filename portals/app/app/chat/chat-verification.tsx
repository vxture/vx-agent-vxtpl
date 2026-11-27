/**
 * Renders per-service evidence for the selected conversation turn.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-27
 */

import { useRef, type ReactNode, type Ref } from "react";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon, NativeSelect, SectionHeader, StatusBadge } from "../ds";
import type { SavedTurn } from "./chat-history";
import { isChatEscapeKey } from "./chat-keyboard";
import { DOCUMENT_CONVERSION_SKILL, WEB_SEARCH_SKILL, type SkillOutcome, type TurnVerification } from "./types";

// Evidence model

interface ServiceStatus {
  label: string;
  tone: "neutral" | "brand" | "success" | "warning";
}

function atlasStatus(turn: TurnVerification): ServiceStatus {
  if (turn.state === "pending") return { label: "\u7b49\u5f85\u56de\u6267", tone: "brand" };
  if (turn.state === "failed") return turn.runosBlockedAtlas
    ? { label: "\u672a\u53d1\u8d77", tone: "neutral" }
    : { label: "\u672a\u53d6\u5f97\u56de\u6267", tone: "warning" };
  return turn.reply.mode === "atlas"
    ? { label: "\u5df2\u56de\u590d", tone: "success" }
    : { label: "\u79bb\u7ebf\u6a21\u62df", tone: "neutral" };
}

function runosStatus(turn: TurnVerification, skill: SkillOutcome | undefined): ServiceStatus {
  if (turn.state === "pending") return { label: "\u7b49\u5f85\u56de\u6267", tone: "brand" };
  if (turn.state === "received" && turn.reply.mode === "mock") return { label: "\u79bb\u7ebf\u6a21\u62df", tone: "neutral" };
  switch (skill?.status) {
    case "ran":
      if (skill.outcomeAcknowledged === false) return { label: "\u56de\u62a5\u672a\u786e\u8ba4", tone: "warning" };
      if (skill.resultKind === "distributed") return { label: "\u6280\u80fd\u5df2\u8fd4\u56de", tone: "success" };
      return { label: skill.outcomeAcknowledged ? "\u56de\u62a5\u5df2\u786e\u8ba4" : "\u5df2\u8fd4\u56de\u7ed3\u679c", tone: "success" };
    case "unavailable":
      return { label: "\u80fd\u529b\u4e0d\u53ef\u7528", tone: "warning" };
    case "failed":
      return { label: "\u8c03\u7528\u5931\u8d25", tone: "warning" };
    case "not-invoked":
      return { label: "\u672a\u8c03\u7528", tone: "neutral" };
    default:
      return { label: "\u672a\u53d6\u5f97\u56de\u6267", tone: "warning" };
  }
}

function overallStatus(turn: TurnVerification, runos?: ServiceStatus): ServiceStatus {
  if (turn.state === "pending") return { label: "\u6267\u884c\u4e2d", tone: "brand" };
  if (turn.state === "failed") {
    return { label: turn.evidence?.skill?.status === "ran" ? "\u90e8\u5206\u5b8c\u6210" : "\u672a\u5b8c\u6210", tone: "warning" };
  }
  if (turn.reply.mode === "mock") return { label: "\u79bb\u7ebf\u6a21\u62df", tone: "neutral" };
  if (runos && runos.tone !== "success") return { label: "\u90e8\u5206\u5b8c\u6210", tone: "warning" };
  return { label: "\u5df2\u5b8c\u6210", tone: "success" };
}

// Evidence presentation

function EvidenceField({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

function ReceiptDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible className="chat-receipt-disclosure">
      <CollapsibleTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="chat-result-toggle">
          <Icon name="chevron-down" size="sm" aria-hidden="true" />
          {label}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

interface ChatVerificationProps {
  turn: TurnVerification | null;
  turnNumber: number;
  panelRef: Ref<HTMLElement>;
  history: SavedTurn[];
  storageFailed?: boolean;
  selectedReceiptId: string | null;
  onSelectReceipt: (id: string | null) => void;
  onReturnFocus?: () => void;
}

export function ChatVerification({
  turn, turnNumber, panelRef, history, storageFailed, selectedReceiptId, onSelectReceipt, onReturnFocus,
}: ChatVerificationProps) {
  const historySelect = useRef<HTMLSelectElement>(null);
  return (
    <aside id="chat-call-receipts" className="chat-verification" aria-labelledby="chat-verification-title"
      aria-keyshortcuts={onReturnFocus ? "Escape" : undefined} tabIndex={-1} ref={panelRef}
      onKeyDown={(event) => {
        if (!onReturnFocus || !isChatEscapeKey(event) || event.target instanceof HTMLSelectElement) return;
        event.preventDefault();
        onReturnFocus();
      }}>
      <header>
        <SectionHeader
          title={<span id="chat-verification-title">{"\u8c03\u7528\u56de\u6267"}</span>}
          divider={false}
          action={selectedReceiptId && (
            <Button type="button" size="sm" variant="ghost" onClick={() => { onSelectReceipt(null); historySelect.current?.focus(); }}>{"\u56de\u5230\u6700\u65b0"}</Button>
          )}
        />
      </header>
      {history.length > 0 && (
        <label className="chat-receipt-history">
          <span>{"\u5386\u53f2\u56de\u6267"}</span>
          <NativeSelect ref={historySelect} value={selectedReceiptId ?? ""} onChange={(event) => onSelectReceipt(event.target.value || null)}>
            <option value="">{"\u6700\u65b0\u4e00\u8f6e"}</option>
            {history.map((saved, index) => (
              <option key={saved.id} value={saved.id}>
                {`\u7b2c ${index + 1} \u8f6e \u00b7 ${saved.prompt.replace(/\s+/g, " ").slice(0, 44)}`}
              </option>
            )).reverse()}
          </NativeSelect>
        </label>
      )}
      {storageFailed && <p className="chat-receipt-empty" role="status">{"\u6d4f\u89c8\u5668\u65e0\u6cd5\u4fdd\u5b58\u90e8\u5206\u56de\u6267\uff0c\u5237\u65b0\u540e\u53ef\u80fd\u4e22\u5931\u3002"}</p>}
      {turn ? <TurnReceipt key={turnNumber} turn={turn} turnNumber={turnNumber} /> : (
        <p className="chat-receipt-empty">{"\u53d1\u9001\u540e\u53ef\u67e5\u770b\u672c\u8f6e\u56de\u6267"}</p>
      )}
    </aside>
  );
}

function TurnReceipt({ turn, turnNumber }: { turn: TurnVerification; turnNumber: number }) {
  const reply = turn.state === "received" ? turn.reply : undefined;
  const atlasReply = reply?.mode === "atlas" ? reply : undefined;
  const offline = reply?.mode === "mock";
  const failure = turn.state === "failed" ? turn.evidence : undefined;
  const skill = atlasReply?.skill ?? failure?.skill;
  const taskId = atlasReply?.taskId ?? failure?.taskId;
  const atlasRequestId = atlasReply?.requestId ?? failure?.atlasRequestId;
  const atlasDetails = atlasReply?.usage || atlasReply?.finishReason || failure?.atlasErrorCode;
  const runosDetails = skill?.version || skill?.resultKind || skill?.contentDigest || skill?.errorCode ||
    (skill?.outcomeAcknowledged !== undefined && skill.status !== "ran");
  const usesRunos = Boolean(turn.skillCode);
  const convertsDocument = turn.skillCode === DOCUMENT_CONVERSION_SKILL;
  const searchesWeb = turn.skillCode === WEB_SEARCH_SKILL;
  const direct = turn.atlasTarget.modelCode !== undefined;
  const atlasMode = direct ? "\u6a21\u578b\u76f4\u8c03" : "\u8def\u7531\u8c03\u7528";
  const atlas = atlasStatus(turn);
  const runos = usesRunos ? runosStatus(turn, skill) : undefined;
  const status = overallStatus(turn, runos);
  const flow = usesRunos
    ? convertsDocument ? ["Runos \u6587\u6863\u8f6c\u6362", "Atlas \u6458\u8981"]
      : searchesWeb ? ["Runos \u8054\u7f51\u641c\u7d22", "Atlas \u56de\u7b54"] : ["Runos \u80fd\u529b\u8c03\u7528", "Atlas \u56de\u590d"]
    : [`Atlas ${atlasMode}`];
  const runosCallId = skill?.callId ?? (turn.state === "failed" ? turn.runosCallId : undefined);
  const resultLabel = skill?.status === "ran"
    ? convertsDocument ? "\u67e5\u770b\u8f6c\u6362\u540e\u7684 Markdown" : "\u67e5\u770b\u8fd4\u56de\u5185\u5bb9"
    : "\u67e5\u770b\u670d\u52a1\u4fe1\u606f";

  return (
    <>
      <div className="chat-receipt-summary" role="status">
        <div className="chat-receipt-summary-heading">
          <span>{`\u7b2c ${turnNumber} \u8f6e`}</span>
          <StatusBadge tone={status.tone} dot>{status.label}</StatusBadge>
        </div>
        <p className="chat-receipt-flow">
          <span>{flow[0]}</span>
          {flow[1] && (
            <>
              <Icon name="arrow-right" size="sm" aria-hidden="true" />
              <span>{flow[1]}</span>
            </>
          )}
        </p>
      </div>

      {runos && (
        <section className="chat-verification-stage" aria-labelledby="chat-runos-title">
          <SectionHeader
            title={<span id="chat-runos-title">Runos</span>}
            level={3}
            icon="plugs-connected"
            description={convertsDocument ? "\u6587\u6863\u8f6c Markdown" : searchesWeb ? "\u8054\u7f51\u641c\u7d22" : "\u80fd\u529b\u8c03\u7528"}
            action={!offline && <StatusBadge tone={runos.tone} dot>{runos.label}</StatusBadge>}
          />
          {(skill?.capabilityId || runosCallId) && (
            <dl className="chat-evidence">
              {skill?.capabilityId && <EvidenceField label={"\u80fd\u529b ID"}><code>{skill.capabilityId}</code></EvidenceField>}
              {skill?.operation && <EvidenceField label={"\u64cd\u4f5c"}><code>{skill.operation}</code></EvidenceField>}
              {runosCallId && <EvidenceField label={"\u8c03\u7528 ID"}><code>{runosCallId}</code></EvidenceField>}
            </dl>
          )}
          {Boolean(skill?.sources?.length) && (
            <ReceiptDisclosure label={"\u67e5\u770b\u641c\u7d22\u6765\u6e90"}>
              <ol className="chat-search-sources">
                {skill?.sources?.map((url) => (
                  <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>
                ))}
              </ol>
            </ReceiptDisclosure>
          )}
          {skill?.detail && (
            <ReceiptDisclosure label={skill.resultKind === "distributed" ? "\u67e5\u770b\u6280\u80fd\u5185\u5bb9" : resultLabel}>
              <pre className="chat-runos-result">{skill.detail}</pre>
            </ReceiptDisclosure>
          )}
          {runosDetails && skill && (
            <ReceiptDisclosure label={"Runos \u6280\u672f\u8be6\u60c5"}>
              <dl className="chat-evidence">
                {skill.version && <EvidenceField label={"\u7248\u672c"}><code>{skill.version}</code></EvidenceField>}
                {skill.resultKind && <EvidenceField label={"\u7ed3\u679c\u7c7b\u578b"}>{skill.resultKind === "distributed" ? "\u6280\u80fd\u5185\u5bb9" : "\u6267\u884c\u7ed3\u679c"}</EvidenceField>}
                {skill.contentDigest && <EvidenceField label={"\u5185\u5bb9\u6307\u7eb9"}><code>{skill.contentDigest}</code></EvidenceField>}
                {skill.errorCode && <EvidenceField label={"\u9519\u8bef\u7801"}><code>{skill.errorCode}</code></EvidenceField>}
                {skill.outcomeAcknowledged !== undefined && (
                  <EvidenceField label={"\u7ed3\u679c\u56de\u62a5"}>{skill.outcomeAcknowledged ? "\u5df2\u786e\u8ba4" : "\u672a\u786e\u8ba4"}</EvidenceField>
                )}
              </dl>
            </ReceiptDisclosure>
          )}
        </section>
      )}

      <section className="chat-verification-stage" aria-labelledby="chat-atlas-title">
        <SectionHeader
          title={<span id="chat-atlas-title">Atlas</span>}
          level={3}
          icon="cpu"
          description={atlasMode}
          action={!offline && <StatusBadge tone={atlas.tone} dot>{atlas.label}</StatusBadge>}
        />
        <dl className="chat-evidence">
          <EvidenceField label={direct ? "\u8bf7\u6c42\u6a21\u578b" : "\u6240\u9009\u8def\u7531"}>
            <code>{turn.atlasTarget.modelCode ?? turn.atlasTarget.endpointCode}</code>
          </EvidenceField>
          {atlasReply?.modelCode && <EvidenceField label={"\u5b9e\u9645\u6a21\u578b"}><code>{atlasReply.modelCode}</code></EvidenceField>}
          {atlasRequestId && <EvidenceField label={"\u8bf7\u6c42 ID"}><code>{atlasRequestId}</code></EvidenceField>}
          {atlasReply?.latencyMs != null && <EvidenceField label={"\u63a8\u7406\u8017\u65f6"}>{atlasReply.latencyMs} ms</EvidenceField>}
          {atlasReply?.usage && <EvidenceField label={"\u603b\u7528\u91cf"}>{atlasReply.usage.totalTokens} tokens</EvidenceField>}
        </dl>
        {atlasDetails && (
          <ReceiptDisclosure label={"Atlas \u6280\u672f\u8be6\u60c5"}>
            <dl className="chat-evidence">
              {atlasReply?.finishReason && <EvidenceField label={"\u7ed3\u675f\u539f\u56e0"}><code>{atlasReply.finishReason}</code></EvidenceField>}
              {atlasReply?.usage && (
                <>
                  <EvidenceField label={"\u8f93\u5165\u7528\u91cf"}>{atlasReply.usage.promptTokens} tokens</EvidenceField>
                  <EvidenceField label={"\u8f93\u51fa\u7528\u91cf"}>{atlasReply.usage.completionTokens} tokens</EvidenceField>
                </>
              )}
              {failure?.atlasErrorCode && <EvidenceField label={"\u9519\u8bef\u7801"}><code>{failure.atlasErrorCode}</code></EvidenceField>}
            </dl>
          </ReceiptDisclosure>
        )}
      </section>

      {taskId && (
        <dl className="chat-receipt-task">
          <EvidenceField label={"\u5173\u8054\u4efb\u52a1"}><code>{taskId}</code></EvidenceField>
        </dl>
      )}
    </>
  );
}
