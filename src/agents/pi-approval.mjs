// Pi extension loaded by Wendaflow when a Pi card runs with "ask before acting".
// Pi itself never asks before calling a tool; this gate does. Every tool except the
// read-only ones must be approved in the Wendaflow card, and anything that is not
// answered in time, or has no UI to ask through, is blocked (fail closed).
const READ_ONLY = new Set(["read", "grep", "find", "ls"]);
const WAIT_MS = 10 * 60_000;

const short = (value) => (typeof value === "string" && value.length > 1500 ? `${value.slice(0, 1500)}…` : value);
const summarize = (input) => {
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, short(value)]));
};

export default function wendaflowApproval(pi) {
  pi.on("tool_call", async (event, ctx) => {
    if (READ_ONLY.has(event.toolName)) return undefined;
    if (!ctx.hasUI) return { block: true, reason: "No way to ask for approval" };
    const approved = await ctx.ui.confirm(
      `Allow ${event.toolName}?`,
      JSON.stringify({ tool: event.toolName, input: summarize(event.input) }),
      { timeout: WAIT_MS },
    );
    return approved ? undefined : { block: true, reason: `${event.toolName} was not approved by the user` };
  });
}
