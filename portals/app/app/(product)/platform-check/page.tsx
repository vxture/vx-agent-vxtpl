/**
 * Product workspace display for live platform acceptance evidence.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-26
 */

"use client";

import { useRef, useState } from "react";
import { Button, NativeSelect, StatusBadge } from "../../ds";
import { ProductContent } from "../../framework/product-content";
import { productGateHref } from "../../framework/product-experience";
import type { Check, PlatformReport, Probe, ProbeReceipt } from "../../platform-demo/types";
import "./platform-check.css";

const rows: { id: keyof PlatformReport["checks"]; name: string; group: string }[] = [
  { id: "issuer", name: "Accounts 签发服务", group: "C1" },
  { id: "session", name: "当前会话与工作空间", group: "C1" },
  { id: "exchange", name: "用户身份换票", group: "C1" },
  { id: "access", name: "当前主体准入", group: "C2" },
  { id: "roster", name: "授权成员名单", group: "C2" },
  { id: "entitlements", name: "订阅权益", group: "C2" },
  { id: "provisioning", name: "开通事件落库", group: "C3" },
  { id: "atlas", name: "Atlas 模型端点授权", group: "Atlas" },
  { id: "atlasModels", name: "Atlas 模型目录", group: "Atlas" },
  { id: "runos", name: "Runos 只读能力可见性", group: "Runos" },
];

const actions: { probe: Probe; name: string; detail: string }[] = [
  { probe: "c3-replay", name: "计量入账与回放", detail: "同一 UTC 日最多计入 1 个单位，重复请求返回原回执。" },
  { probe: "atlas-inference", name: "Atlas · 按路由调用", detail: "从产品授权目录选取对话路由，按 endpointCode 提交样本。" },
  { probe: "atlas-model-inference", name: "Atlas · 按模型调用", detail: "从 Atlas 目录选择模型，按 modelCode 提交同一份样本。Atlas 在调用时核验授权。" },
  { probe: "runos-invoke", name: "Runos 实际调用", detail: "将固定 HTML 样本转换为 Markdown，校验转换内容和结果回报后显示调用回执。" },
];

const stages = { dev: "开发", beta: "验收", production: "生产" };
const states = {
  verified: { tone: "success", label: "已核验" },
  waiting: { tone: "neutral", label: "待验证" },
  blocked: { tone: "warning", label: "未准入" },
  unavailable: { tone: "danger", label: "暂不可用" },
} as const;

type ProbeOutcome = { receipt?: ProbeReceipt; error?: string };

function CheckBadge({ state }: { state: Check["state"] }) {
  return <StatusBadge tone={states[state].tone} dot>{states[state].label}</StatusBadge>;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body?.detail ?? "当前无法完成核验");
  return body as T;
}

export default function PlatformCheckPage() {
  const [report, setReport] = useState<PlatformReport | null>(null);
  const [busy, setBusy] = useState<"report" | Probe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Partial<Record<Probe, ProbeOutcome>>>({});
  const [modelCode, setModelCode] = useState("");
  const pending = useRef(false);
  const count = rows.filter(({ id }) => report?.checks[id]?.state === "verified").length;

  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setBusy("report");
    setReport(null);
    const previousScope = report?.scopeKey;
    setError(null);
    try {
      const response = await fetch("/api/platform-check", { cache: "no-store", signal: AbortSignal.timeout(40_000) });
      const current = await readResponse<PlatformReport>(response);
      if (!current.scopeKey || current.scopeKey !== previousScope) {
        setOutcomes({});
        setModelCode("");
      } else {
        setModelCode((selected) => current.atlasModelChoices?.some(({ code }) => code === selected) ? selected : "");
      }
      setReport(current);
    } catch (failure) {
      setOutcomes({});
      setModelCode("");
      setError(failure instanceof Error ? failure.message : "当前无法完成核验");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  function recordOutcome(probe: Probe, result: ProbeReceipt) {
    setOutcomes((previous) => ({
      ...previous,
      [probe]: result.ok
        ? { receipt: result }
        : { receipt: previous[probe]?.receipt, error: result.detail },
    }));
  }

  async function run(probe: Probe) {
    if (pending.current || !report?.actions[probe] || !report.scopeKey) return;
    if (probe === "atlas-model-inference" && !modelCode) return;
    pending.current = true;
    setBusy(probe);
    try {
      const response = await fetch("/api/platform-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          probe, scopeKey: report.scopeKey,
          ...(probe === "atlas-model-inference" ? { modelCode } : {}),
        }),
      });
      const body = await response.json() as ProbeReceipt;
      if (response.status === 401 || body.code === "WORKSPACE_CHANGED") {
        setReport(null);
        setOutcomes({});
        setModelCode("");
        setError(body.detail);
        return;
      }
      if (body.code === "ATLAS_MODEL_UNAVAILABLE") setModelCode("");
      recordOutcome(probe, { ...body, ok: response.ok && body.ok === true });
    } catch {
      recordOutcome(probe, { ok: false, detail: "未收到可确认的回执" });
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  return (
    <ProductContent>
      <div className="platform-demo">
        <header className="platform-demo__heading">
          <div>
            <h1>平台接入演示</h1>
            <p>用当前工作空间验证身份、准入、开通、计量和能力调用。</p>
          </div>
          <Button onClick={refresh} disabled={busy !== null}>{busy === "report" ? "正在核验…" : "核验接入状态"}</Button>
        </header>

        <section className="platform-demo__section" aria-labelledby="platform-checks">
          <div className="platform-demo__section-title">
            <h2 id="platform-checks">接入预检</h2>
            <div aria-live="polite" className="platform-demo__meta">
              {report ? `${stages[report.stage]}环境 · ${count}/${rows.length} 项已核验 · ${new Date(report.checkedAt).toLocaleTimeString()}`
                : "运行后显示当前会话对应的实测结果"}
            </div>
          </div>
          {error && <p role="alert">{error}</p>}
          {report && !report.scopeKey && <p><a href={productGateHref("/platform-check")}>登录以核验工作空间</a></p>}
          <ul className="platform-demo__rows">
            {rows.map(({ id, name, group }) => (
              <li className="platform-demo__row" key={id}>
                <div className="platform-demo__item">
                  <span className="platform-demo__group">{group}</span>
                  <strong>{name}</strong>
                </div>
                <span className="platform-demo__detail">{report?.checks[id]?.detail ?? "等待核验"}</span>
                <CheckBadge state={report?.checks[id]?.state ?? "waiting"} />
              </li>
            ))}
          </ul>
        </section>

        <section className="platform-demo__section" aria-labelledby="platform-actions">
          <div className="platform-demo__section-title">
            <h2 id="platform-actions">真实调用</h2>
            <span className="platform-demo__meta">使用登记的验收账号与工作空间。两种 Atlas 调用各可在同一 UTC 日发起一次。</span>
          </div>
          <ul className="platform-demo__rows">
            {actions.map(({ probe, name, detail }) => {
              const outcome = outcomes[probe];
              const receipt = outcome?.receipt;
              const directModel = probe === "atlas-model-inference";
              return (
                <li className="platform-demo__row platform-demo__row--action" key={probe}>
                  <div>
                    <strong>{name}</strong>
                    <p className="platform-demo__detail">{detail}</p>
                    <p className="platform-demo__detail">
                      {report?.actionDetails?.[probe] ?? "先运行接入预检"}
                    </p>
                    {directModel && !!report?.atlasModelChoices?.length && (
                      <NativeSelect
                        aria-label="Atlas 直调模型"
                        value={modelCode}
                        onChange={(event) => setModelCode(event.target.value)}
                        disabled={busy !== null}
                        className="platform-demo__model-select"
                      >
                        <option value="">选择模型</option>
                        {report.atlasModelChoices.map(({ code, name, provider }) => (
                          <option key={code} value={code}>{name || code} · {provider} · {code}</option>
                        ))}
                      </NativeSelect>
                    )}
                    <div role="status">
                      <CheckBadge state={receipt ? "verified" : outcome?.error ? "unavailable" : "waiting"} />
                      {receipt && (
                        <>
                          <p>{receipt.detail}{receipt.receipt && <> · 回执 <code>{receipt.receipt}</code></>}</p>
                          {receipt.evidence?.provider === "atlas" && (
                            <p>
                              {receipt.evidence.endpointCode
                                ? <>路由 <code>{receipt.evidence.endpointCode}</code></>
                                : <>请求模型 <code>{receipt.evidence.requestedModelCode}</code></>}
                              {" · 实际模型 "}<code>{receipt.evidence.modelCode}</code>
                              {" · 任务 "}<code>{receipt.evidence.taskId}</code>
                            </p>
                          )}
                          {receipt.responseText && <p>{receipt.responseText}</p>}
                          {receipt.evidence?.provider === "runos" && (
                            <p>能力 {receipt.evidence.capabilityId} · 结果回报已确认 · 任务 <code>{receipt.evidence.taskId}</code></p>
                          )}
                        </>
                      )}
                    </div>
                    {outcome?.error && <p role="alert">{outcome.error}</p>}
                  </div>
                  <Button variant="outline" onClick={() => run(probe)} disabled={busy !== null || !report?.actions[probe] || (directModel && !modelCode)}>
                    {busy === probe ? "正在调用…" : "执行验证"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="platform-demo__section" aria-labelledby="platform-logout">
          <h2 id="platform-logout">人工联调</h2>
          <ul>
            <li>C1 跨产品退出。保持本页打开，从同一 Accounts 会话的另一产品退出，确认本页收到事件并返回门禁。</li>
            <li>C2 准入与权益。用有席位和无席位的账号检查允许与拒绝；用相应订阅状态核对开通、续订和权益读取失败。</li>
            <li>C3 开通与对账。核对平台投递及 ACK，验证一次重复投递和一次漏投后的对账补齐。</li>
            <li>C3 计量与权益。核对真实入账、回放与额度更新，并保留平台事件 ID。</li>
          </ul>
        </section>
      </div>
    </ProductContent>
  );
}
