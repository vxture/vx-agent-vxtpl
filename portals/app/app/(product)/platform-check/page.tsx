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
import { Button, StatusBadge } from "../../ds";
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
  { id: "atlas", name: "Atlas 模型授权", group: "Atlas" },
  { id: "runos", name: "Runos 能力目录", group: "Runos" },
];

const actions: { probe: Probe; name: string; detail: string }[] = [
  { probe: "c3-replay", name: "计量入账与回放", detail: "同一 UTC 日最多计入 1 个单位，重复请求返回原回执。" },
  { probe: "atlas-inference", name: "Atlas 实际推理", detail: "用固定示例发起一次标准模型调用。" },
  { probe: "runos-invoke", name: "Runos 实际调用", detail: "对已登记的只读能力提交固定示例。" },
];

const stages = { dev: "开发", beta: "验收", production: "生产" };
const states = {
  verified: { tone: "success", label: "已核验" },
  waiting: { tone: "neutral", label: "待验证" },
  blocked: { tone: "warning", label: "未准入" },
  unavailable: { tone: "danger", label: "暂不可用" },
} as const;

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
  const [receipts, setReceipts] = useState<Partial<Record<Probe, ProbeReceipt>>>({});
  const pending = useRef(false);
  const count = rows.filter(({ id }) => report?.checks[id].state === "verified").length;

  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setBusy("report");
    setReport(null);
    setReceipts({});
    setError(null);
    try {
      const response = await fetch("/api/platform-check", { cache: "no-store", signal: AbortSignal.timeout(40_000) });
      setReport(await readResponse<PlatformReport>(response));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "当前无法完成核验");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function run(probe: Probe) {
    if (pending.current || !report?.actions[probe] || !report.scopeKey) return;
    pending.current = true;
    setBusy(probe);
    try {
      const response = await fetch("/api/platform-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ probe, scopeKey: report.scopeKey }),
      });
      const body = await response.json() as ProbeReceipt;
      setReceipts((previous) => ({ ...previous, [probe]: { ...body, ok: response.ok && body.ok === true } }));
      if (response.status === 401 || response.status === 409) setReport(null);
    } catch {
      setReceipts((previous) => ({ ...previous, [probe]: { ok: false, detail: "未收到可确认的回执" } }));
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
            <h2 id="platform-checks">接入状态</h2>
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
                <span className="platform-demo__detail">{report?.checks[id].detail ?? "等待核验"}</span>
                <CheckBadge state={report?.checks[id].state ?? "waiting"} />
              </li>
            ))}
          </ul>
        </section>

        <section className="platform-demo__section" aria-labelledby="platform-actions">
          <div className="platform-demo__section-title">
            <h2 id="platform-actions">真实调用</h2>
            <span className="platform-demo__meta">使用登记的验收工作空间，调用可能产生用量。</span>
          </div>
          <ul className="platform-demo__rows">
            {actions.map(({ probe, name, detail }) => {
              const receipt = receipts[probe];
              return (
                <li className="platform-demo__row platform-demo__row--action" key={probe}>
                  <div>
                    <strong>{name}</strong>
                    <p className="platform-demo__detail">{detail}</p>
                    {receipt && <p role="status">{receipt.detail}{receipt.receipt && <> · <code>{receipt.receipt}</code></>}</p>}
                  </div>
                  <Button variant="outline" onClick={() => run(probe)} disabled={busy !== null || !report?.actions[probe]}>
                    {busy === probe ? "正在调用…" : "执行验证"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="platform-demo__section" aria-labelledby="platform-logout">
          <h2 id="platform-logout">跨产品退出</h2>
          <p className="platform-demo__detail">保持本页打开，在同一 Accounts 会话的另一产品退出。收到退出事件后，本页应返回门禁。</p>
        </section>
      </div>
    </ProductContent>
  );
}
