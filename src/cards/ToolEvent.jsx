import React from "react";
import { ActivityIcon } from "./ActivityIcon.jsx";

// One tool call of an agent run: what it did, to what, how it went, and the output behind a fold.
export function ToolEvent({ event, tr }) {
  const { tool, target, state, result } = event.meta;
  const verbs = { read: tr("读取", "Read"), grep: tr("搜索", "Search"), find: tr("查找", "Find"), ls: tr("列出", "List"), edit: tr("修改", "Edit"), write: tr("写入", "Write"), bash: tr("运行", "Run") };
  const shown = tool === "bash" ? `$ ${target}` : target;
  const lines = result ? result.split("\n").length : 0;
  const diff = event.meta.diff;
  return (
    <article className={`tool ${state} ${tool === "bash" ? "command" : "file"}`}>
      <ActivityIcon kind={tool} />
      <span>
        <strong>
          {tool !== "bash" && <>{verbs[tool] || tool} </>}
          <code title={target}>{shown}</code>
          {state === "running" && <em className="tool-state running">…</em>}
          {state === "error" && <em className="tool-state error">{tr("失败", "Failed")}</em>}
          {diff && (diff.added || diff.removed) ? <em className="tool-diff"><ins>+{diff.added}</ins> <del>−{diff.removed}</del></em> : null}
        </strong>
        {result && (
          <details onPointerDown={(event) => event.stopPropagation()}>
            <summary>{tr("输出", "Output")} · {tr("{0} 行", "{0} lines").replace("{0}", lines)}</summary>
            <pre>{result}</pre>
          </details>
        )}
      </span>
    </article>
  );
}
