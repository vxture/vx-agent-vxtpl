import {
  getRunosClientConfig,
  runosDiscover,
  runosInvoke,
  runosReportOutcome,
  runosResolve,
  RunosError,
  type CallToolOptions,
  type RunosCapability,
  type RunosFailure,
} from "../runos/client";
import { isEntitlementRejection } from "../lib/platform-error";
import { findSkill } from "./catalog";
import type { ChatMessage, SkillOutcome } from "./types";

// Skill execution: turn a selected skill into a real Runos capability call.
//
// The loop is discover -> resolve -> invoke -> report_outcome, and each step is
// there for a reason:
//
//   discover  vxtpl does not hard-code capability ids. The catalog is per-caller
//             (a capability outside your entitled set is invisible, not
//             forbidden) and it changes without vxtpl redeploying, so the only
//             correct way to find one is to ask.
//   resolve   the operation name and its input schema come from the capability's
//             own contract, not from an assumption here.
//   invoke    the actual call. This never retries, and that is a decision, not
//             an omission: every attempt is separately billed and audited, the
//             gateway never retries on your behalf, and the operations most
//             worth retrying are exactly the ones that are not idempotent
//             (`runos.code-sandbox/run_code` runs code - twice is not once).
//             A retryable failure is reported to the user, who can ask again.
//   report    closes the task so Runos can attribute the outcome.
//
// A skill that cannot run is NOT an error for the chat turn. The production
// catalog is empty today (no third-party connector has been registered), so
// `unavailable` is the expected answer in production right now - and reporting
// that honestly is more useful than pretending the skill ran.

/**
 * Search terms per skill. These are queries, not ids - the entitled catalog is
 * per-caller and changes without vxtpl redeploying, so it has to be asked.
 *
 * Ranking is keyword overlap, not embeddings (Runos's vector provider is still a
 * stub), so these must SHARE WORDS with how a capability describes itself.
 * Semantically-close-but-lexically-different phrasing scores zero.
 */
const SKILL_QUERIES: Record<string, { query: string; category?: string }> = {
  summarize: { query: "summarize document text" },
  "web-search": { query: "web search retrieve pages" },
  "code-exec": { query: "run python code sandbox", category: "development" },
  "data-analysis": { query: "analyze spreadsheet tabular data" },
};

/** Fields a capability's operation is most likely to accept the user's text under. */
const TEXT_ARG_CANDIDATES = ["query", "text", "input", "content", "prompt", "code"];

export interface RunSkillOptions {
  taskId: string;
  identity: CallToolOptions["identity"];
  sessionId?: string;
}

export async function runSkill(
  skillCode: string,
  history: ChatMessage[],
  opts: RunSkillOptions,
): Promise<SkillOutcome> {
  const skill = findSkill(skillCode);
  const base: SkillOutcome = { code: skillCode, capabilityId: null, status: "not-invoked", detail: "" };
  if (!skill) return { ...base, detail: `unknown skill '${skillCode}'` };

  const cfg = getRunosClientConfig();
  if (!cfg) return { ...base, status: "unavailable", detail: "RUNOS_API_URL is not configured" };

  const spec = SKILL_QUERIES[skillCode] ?? { query: skill.label };
  const userText = history[history.length - 1]?.content ?? "";
  const call: CallToolOptions = {
    taskId: opts.taskId,
    identity: opts.identity,
    // The capability acts as the signed-in user, not as vxtpl. The client
    // forwards the minted token, not the session token - see CallToolOptions.
    delegate: true,
    sessionId: opts.sessionId,
  };

  try {
    const found = await runosDiscover(cfg, spec.query, { ...call, limit: 10, category: spec.category });
    if (!found.ok) {
      return { ...base, status: "unavailable", detail: describeFailure(found.failure) };
    }
    const capability = pickCapability(found.data.capabilities);
    if (!capability) {
      return {
        ...base,
        status: "unavailable",
        detail: `no capability in the entitled catalog matches '${spec.query}'`,
      };
    }

    const resolved = await runosResolve(cfg, capability.capability_id, call);
    if (!resolved.ok) {
      return {
        ...base,
        capabilityId: capability.capability_id,
        status: "unavailable",
        detail: describeFailure(resolved.failure),
      };
    }
    const operation = resolved.data.contract?.operations?.[0];
    if (!operation) {
      return {
        ...base,
        capabilityId: capability.capability_id,
        status: "unavailable",
        detail: `${capability.capability_id} exposes no operation`,
      };
    }

    const args = buildArguments(operation.inputSchema, userText);
    const invoked = await runosInvoke(cfg, capability.capability_id, operation.operation, args, call);

    const outcome: SkillOutcome = invoked.ok
      ? {
          code: skillCode,
          capabilityId: capability.capability_id,
          status: "ran",
          // A Skill primitive answers with its CONTENT, not a result: Runos
          // distributes skills and never executes them (ADR-006), so what comes
          // back is instructions for the caller's own runtime. Feeding that to
          // the model as prose is the correct handling - JSON-stringifying it
          // like a connector payload would bury the instructions in escaping.
          detail:
            invoked.meta?.result_kind === "distributed"
              ? (invoked.text ?? "").slice(0, 4000)
              : summarize(invoked.data),
          callId: invoked.callId,
        }
      : {
          code: skillCode,
          capabilityId: capability.capability_id,
          status: "failed",
          detail: describeFailure(invoked.failure),
          callId: invoked.failure.call_id,
        };

    // Fire-and-forget: a failed outcome report must not fail the user's turn.
    void runosReportOutcome(cfg, invoked.ok ? "success" : "failure", {
      ...call,
      capabilitiesUsed: [capability.capability_id],
    }).catch(() => undefined);

    return outcome;
  } catch (err) {
    // A transport/auth failure (401, 406, timeout) - the capability plane is
    // unreachable, which degrades the turn rather than ending it.
    const detail = err instanceof RunosError ? err.message : err instanceof Error ? err.message : "runos call failed";
    return { ...base, status: "unavailable", detail };
  }
}

/** Prefer something that can actually execute over a document-style skill entry. */
function pickCapability(capabilities: RunosCapability[]): RunosCapability | undefined {
  if (!capabilities?.length) return undefined;
  return (
    capabilities.find((c) => c.primitive_type === "executor" && c.operations?.length) ??
    capabilities.find((c) => c.operations?.length) ??
    capabilities[0]
  );
}

/**
 * Fit the user's text to the operation's declared input.
 *
 * The contract's inputSchema is authoritative, so this reads the required string
 * properties rather than guessing a field name - guessing produces
 * caller_error/invalid_arguments, which looks like a Runos fault but is ours.
 */
function buildArguments(inputSchema: unknown, text: string): Record<string, unknown> {
  const schema = inputSchema as
    | { properties?: Record<string, { type?: string }>; required?: string[] }
    | undefined;
  const properties = schema?.properties;
  if (!properties) return { input: text };

  const required = (schema?.required ?? []).filter((k) => properties[k]?.type === "string");
  const target =
    required[0] ??
    TEXT_ARG_CANDIDATES.find((k) => properties[k]?.type === "string") ??
    Object.keys(properties).find((k) => properties[k]?.type === "string");

  return target ? { [target]: text } : { input: text };
}

/** Reduce a capability payload to something a model can read inside a prompt. */
function summarize(payload: Record<string, unknown> | undefined): string {
  if (!payload) return "";
  const { _meta_vxture: _ignored, ...rest } = payload as Record<string, unknown>;
  const text = JSON.stringify(rest);
  return text.length > 4000 ? `${text.slice(0, 4000)}...(truncated)` : text;
}

/**
 * Turn a rejection into something worth showing a person.
 *
 * The entitlement rejections are the only ones a user can act on, so they get
 * the callee's own message; everything else is a fault on our side or the
 * capability's, and the code is what an operator needs. `CALLER_UNKNOWN_CAPABILITY`
 * covers both "no such id" and "outside your entitled set" on purpose - the two
 * are deliberately indistinguishable, so it reads as "does not exist" and is
 * never probed further.
 */
function describeFailure(failure: RunosFailure): string {
  if (isEntitlementRejection(failure.code)) return failure.message || failure.code;
  return `${failure.code}${failure.retryable ? " (retryable)" : ""}`;
}
