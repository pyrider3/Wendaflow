import React, { memo, useMemo, useState } from "react";
import { planSteps } from "../agents/plan-steps.mjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ComicCardBar } from "../plugins/comic/ComicCardBar.jsx";
import { AgentControls } from "./AgentControls.jsx";
import { ChangesPanel } from "./ChangesPanel.jsx";
import { UsageLine } from "./UsageLine.jsx";
import { ToolEvent } from "./ToolEvent.jsx";
import { ActivityIcon } from "./ActivityIcon.jsx";

const REMARK_PLUGINS = [remarkGfm];

// A finished "plan first" card: the plan's steps as a checklist, so only the kept ones are carried out.
function PlanReady({ node, tr, executePlan }) {
  const steps = useMemo(() => planSteps(node.content), [node.content]);
  const [skipped, setSkipped] = useState(() => new Set());
  const kept = steps.filter((_, index) => !skipped.has(index));
  const toggle = (index) => setSkipped((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  return (
    <section className="plan-ready" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <p>{tr("这是计划，还没有动手。", "This is a plan; nothing has been changed yet.")}</p>
      {steps.length > 1 && (
        <ol className="plan-steps">
          {steps.map((step, index) => (
            <li key={index} className={skipped.has(index) ? "skipped" : ""}>
              <label><input type="checkbox" checked={!skipped.has(index)} onChange={() => toggle(index)} /><span>{step}</span></label>
            </li>
          ))}
        </ol>
      )}
      <button disabled={steps.length > 1 && !kept.length} onClick={(event) => { event.stopPropagation(); executePlan(node, steps.length > 1 && kept.length < steps.length ? kept : null); }}>
        {steps.length > 1 && kept.length < steps.length ? tr("执行选中的 {0} 步", "Run the {0} selected steps").replace("{0}", kept.length) : tr("按计划执行", "Run the plan")}
      </button>
      <small>{tr("想改计划？从这张卡片分支，告诉 Pi 怎么改。", "Want changes? Branch from this card and tell the agent what to adjust.")}</small>
    </section>
  );
}
const EMPTY_ARRAY = [];

const MarkdownBody = memo(function MarkdownBody({
  content,
  isAction,
  artifacts,
  openActionArtifact,
}) {
  const components = useMemo(
    () => ({
      a: ({ href, children, ...props }) => (
        <a
          {...props}
          href={href}
          onClick={(event) => {
            if (!isAction) return;
            const label = String(children || "");
            const artifact = artifacts.find(
              (item) => item.href === href || item.name === label,
            );
            if (!artifact) return;
            event.preventDefault();
            event.stopPropagation();
            openActionArtifact(artifact);
          }}
        >
          {children}
        </a>
      ),
    }),
    [isAction, artifacts, openActionArtifact],
  );
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {content}
    </ReactMarkdown>
  );
});

// Content is separate from the canvas gesture and position shell.
export function CardContent({
  node,
  view,
  actions,
  helpers,
  copy,
  tr,
  systemText,
  uiLanguage,
}) {
  const {
    editing,
    editDraft,
    previewContentPhase,
    displayTitle,
    childCount,
    hiddenCount,
    collapsed,
    branching,
  } = view;
  const {
    setEditDraft,
    setEditingNode,
    setInlineEditSize,
    saveNodeEdit,
    handleContentWheel,
    handleCardWheel,
    openActionArtifact,
    downloadActionArtifact,
    openLibraryItem,
    toggleActivity,
    stopAgentJob,
    respondAgentApproval,
    applyAgentChanges,
    openCompare,
    executePlan,
    openPiHistory,
    compactPiSession,
    switchPiModel,
    piModelChoices,
    steerAgent,
    stopGeneration,
    beginResize,
    beginRelationDrag,
    toggleCollapse,
    startBranch,
  } = actions;
  const { statusLabel, outputAssets, actionArtifacts, shouldShowNodeThinking } =
    helpers;
  const ideaIsBody = node.type === "thought" && !!node.content &&
    node.content.trim().replace(/\s+/g, " ") === displayTitle.trim().replace(/\s+/g, " ");
  const assets = useMemo(() => outputAssets(node.content), [outputAssets, node.content]);
  const artifacts = useMemo(
    () => (node.type === "action" ? actionArtifacts(node) : EMPTY_ARRAY),
    [actionArtifacts, node.type, node.content, node.execution?.artifacts, node.execution?.jobId, node.execution?.after?.status],
  );
  const liveEvents =
    node.type === "action" ? (node.execution?.events || []).slice(-18) : [];
  const activityCollapsed = node.execution?.activityCollapsed !== false;
  const showNodeThinking = shouldShowNodeThinking(node);
  // Keep right-click available for card-level quick-thought relation dragging.
  const stopNonRightDown = (event) => {
    if (event.button !== 2) event.stopPropagation();
  };
  return (
    <>
      {node.type !== "thought" && <div className="node-topline">
        <span className="node-kind">
          {node.type === "action"
            ? copy.action
            : node.type === "thought"
              ? copy.idea
              : node.model}
        </span>
        <span className="node-flags">
          {node.favorite && "★"}
          {node.completed && "✓"}
        </span>
        {(node.type === "action" ||
          [
            "running",
            "queued",
            "thinking",
            "streaming",
            "failed",
            "stopped",
          ].includes(node.status)) && (
          <span className={`status ${node.status}`}>
            {statusLabel(node.status, uiLanguage)}
          </span>
        )}
      </div>}
      {!!assets.length && (
        <div className="output-assets">
          {assets.map((asset) => (
            <a
              key={asset.url}
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              onPointerDown={stopNonRightDown}
              onClick={(event) => {
                event.stopPropagation();
                if (node.type !== "action") return;
                const artifact = artifacts.find(
                  (item) => item.href === asset.url || item.name === asset.name,
                );
                if (!artifact) return;
                event.preventDefault();
                openActionArtifact(artifact);
              }}
            >
              <span>{asset.image ? tr("图", "IMG") : tr("档", "FILE")}</span>
              {asset.name}
            </a>
          ))}
        </div>
      )}
      {editing ? (
        <div
          className="inline-node-editor"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onWheel={handleContentWheel}
        >
          <input
            autoFocus
            aria-label={tr("卡片标题", "Card title")}
            value={editDraft.title}
            onChange={(event) =>
              setEditDraft((value) => ({ ...value, title: event.target.value }))
            }
          />
          <textarea
            aria-label={tr("卡片正文", "Card body")}
            placeholder={node.type === "thought" ? tr("正文（可选）", "Body (optional)") : undefined}
            value={editDraft.content}
            onChange={(event) =>
              setEditDraft((value) => ({
                ...value,
                content: event.target.value,
              }))
            }
          />
          <div>
            <button
              onClick={() => {
                setEditingNode(null);
                setInlineEditSize(null);
              }}
            >
              {tr("取消", "Cancel")}
            </button>
            <button className="save" onClick={saveNodeEdit}>
              {tr("完成", "Done")}
            </button>
          </div>
        </div>
      ) : (
        <h2 className="node-drag-title" title={view.dragHint} onWheel={handleCardWheel} hidden={view.captionless}>{ideaIsBody ? node.content : displayTitle}</h2>
      )}
      {node.type === "conversation" &&
        ["queued", "thinking", "streaming"].includes(node.status) && (
          <div className={`generation-progress ${node.status}`}>
            <i />
            {node.generationPhase
              ? systemText(node.generationPhase)
              : node.status === "queued"
                ? tr("请求正在排队…", "Request queued…")
                : node.status === "thinking"
                  ? tr(
                      "正在思考与整理上下文…",
                      "Thinking and preparing context…",
                    )
                  : tr("模型正在逐字输出…", "Streaming response…")}
          </div>
        )}
      {!!node.tags?.length && (
        <div className="node-tags">
          {node.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      {!editing && (node.type === "thought" || previewContentPhase !== "hidden") && (
        <div
          className={`markdown-content preview-content-${node.type === "thought" ? "visible" : previewContentPhase}`}
          onWheel={handleCardWheel}
        >
          {!ideaIsBody && (
            <MarkdownBody
              content={node.content}
              isAction={node.type === "action"}
              artifacts={artifacts}
              openActionArtifact={openActionArtifact}
            />
          )}
          {showNodeThinking && (
            <details className="thinking-output">
              <summary>{tr("模型思考过程", "Model reasoning")}</summary>
              <pre>{node.thinking}</pre>
            </details>
          )}
          {!!node.attachments?.length && (
            <div className="node-attachments">
              {node.attachments.map((item) => {
                if (item.dataUrl?.startsWith("data:image/"))
                  return (
                    <a
                      key={item.id}
                      className="image-attachment"
                      draggable={false}
                      href={item.dataUrl}
                      onPointerDown={stopNonRightDown}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openLibraryItem(item);
                      }}
                    >
                      <img src={item.dataUrl} alt={item.name} draggable={false} />
                      <span hidden={node.type === "thought"}>
                        {item.name} ·{" "}
                        {tr("用系统查看器打开", "Open in system viewer")}
                      </span>
                    </a>
                  );
                if (item.text)
                  return (
                    <div key={item.id} className="code-attachment">
                      <strong>{item.name}</strong>
                      <pre>{item.text.slice(0, 900)}</pre>
                    </div>
                  );
                if (item.dataUrl)
                  return (
                    <a
                      key={item.id}
                      className="file-attachment"
                      href={item.dataUrl}
                      download={item.name}
                      onPointerDown={stopNonRightDown}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <strong>▱ {item.name}</strong>
                      <small>
                        {Math.ceil(item.size / 1024)} KB ·{" "}
                        {tr("点击下载", "Click to download")}
                      </small>
                    </a>
                  );
                return (
                  <div key={item.id} className="file-attachment">
                    <strong>▱ {item.name}</strong>
                    <small>{Math.ceil(item.size / 1024)} KB</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {!editing && view.comicTools && node.comic && (
        <ComicCardBar node={node} actions={actions} tr={tr} stopPointer={stopNonRightDown} />
      )}
      {node.type === "action" && node.status === "running" && node.actionRunner === "pi" && (
        <AgentControls node={node} tr={tr} respondAgentApproval={respondAgentApproval} steerAgent={steerAgent} switchPiModel={switchPiModel} piModelChoices={piModelChoices} />
      )}
      {node.type === "action" && <UsageLine usage={node.execution?.usage} tr={tr} />}
      {node.type === "action" && node.actionRunner === "pi" && node.execution?.sessionId && node.status !== "running" && openPiHistory && (
        <div className="pi-card-links" onPointerDown={(event) => event.stopPropagation()}>
          <button className="pi-history-open" onClick={(event) => { event.stopPropagation(); openPiHistory(node); }}>{tr("会话记录 · 从任意一句分岔", "Session history · branch from any message")}</button>
          {compactPiSession && <button className="pi-history-open" title={tr("把这次会话的历史压缩成摘要，之后从这张卡片继续会更省 token", "Summarize this session's history so continuing from this card uses fewer tokens")} onClick={(event) => { event.stopPropagation(); void compactPiSession(node); }}>{tr("压缩会话", "Compact session")}</button>}
        </div>
      )}
      {node.type === "action" && liveEvents.length > 0 && (
        <section
          className={`action-live-feed ${activityCollapsed ? "collapsed" : ""}`}
        >
          <header>
            <button
              className="activity-toggle"
              aria-expanded={!activityCollapsed}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                toggleActivity(node);
              }}
            >
              <span>{tr("行动动态", "Action activity")}</span>
              <small>
                {activityCollapsed
                  ? tr(
                      `${liveEvents.length} 条记录 · 已折叠`,
                      `${liveEvents.length} entries · collapsed`,
                    )
                  : node.status === "running"
                    ? tr("实时更新", "Live updates")
                    : tr("执行记录", "Execution record")}
              </small>
              <i>⌄</i>
            </button>
          </header>
          <div>
            {liveEvents.filter((event) => event.type !== "config").map((event) => event.meta?.tool ? <ToolEvent key={event.id} event={event} tr={tr} /> : event.type === "status" ? (
              // Progress notes ("snapshot taken", "approved"…) are quiet one-liners, not cards.
              <p key={event.id} className="activity-status">{event.text}</p>
            ) : (
              <article key={event.id} className={event.type}>
                <ActivityIcon kind={["thinking", "message", "user", "file", "stderr", "command"].includes(event.type) ? (event.type === "command" ? "bash" : event.type) : "status"} />
                <span>
                  <strong>
                    {event.type === "thinking"
                      ? tr("正在思考", "Thinking")
                      : event.type === "command"
                        ? tr("运行命令", "Running command")
                        : event.type === "file"
                          ? tr("修改文件", "Changing files")
                          : event.type === "message"
                            ? tr("阶段结果", "Step result")
                            : event.type === "user"
                              ? tr("你追加了指令", "You added an instruction")
                            : event.type === "stderr"
                              ? tr("终端错误", "Terminal error")
                              : tr("终端输出", "Terminal output")}
                  </strong>
                  <small>{event.text}</small>
                </span>
              </article>
            ))}
          </div>
          {node.execution?.terminal && (
            <details className="action-terminal">
              <summary>{tr("完整终端输出", "Full terminal output")}</summary>
              <pre>{node.execution.terminal}</pre>
            </details>
          )}
        </section>
      )}
      {node.type === "action" && node.compareGroup && (
        <button className="compare-open" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openCompare(node.compareGroup); }}>
          {tr("方案 {0} · 并排对比", "Variant {0} · compare").replace("{0}", node.variant || "")}
        </button>
      )}
      {node.type === "action" && node.actionPlanFirst && !node.planApproved && node.status === "done" && <PlanReady node={node} tr={tr} executePlan={executePlan} />}
      {node.type === "action" && <ChangesPanel node={node} tr={tr} applyAgentChanges={applyAgentChanges} />}
      {node.type === "action" && artifacts.length > 0 && (
        // The files this run produced or changed: what each one is, and what you can do with it.
        <section className="action-artifacts v2" onPointerDown={(event) => event.stopPropagation()}>
          <header><span>{tr("生成的文件", "Files from this run")}</span><small>{artifacts.length}</small></header>
          <ul>
            {artifacts.map((artifact) => {
              const name = String(artifact.name || "");
              const base = name.split(/[\\/]/).pop() || name;
              const folder = name.slice(0, Math.max(0, name.length - base.length)).replace(/[\\/]$/, "");
              const ext = (base.match(/\.([a-z0-9]{1,6})$/i)?.[1] || "").toLowerCase();
              const kind = artifact.image || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ? "image" : ["md", "txt", "doc", "docx", "pdf"].includes(ext) ? "doc" : ["js", "jsx", "ts", "tsx", "py", "mjs", "css", "html", "json", "sh", "go", "rs"].includes(ext) ? "code" : "file";
              const openable = artifact.href || artifact.localPath;
              return (
                <li key={artifact.id} className={`artifact-row ${kind}`}>
                  <span className="artifact-type">{ext ? ext.toUpperCase().slice(0, 4) : kind === "image" ? "IMG" : "FILE"}</span>
                  <span className="artifact-text">
                    <strong title={name}>{base}</strong>
                    <small>{[systemText(artifact.state), folder].filter(Boolean).join(" · ")}</small>
                  </span>
                  {openable && <button className="artifact-action" onClick={(event) => { event.stopPropagation(); openActionArtifact(artifact); }}>{tr("打开", "Open")}</button>}
                  {openable && <button className="artifact-action quiet" title={tr("另存到你选的位置", "Save a copy where you choose")} onClick={(event) => { event.stopPropagation(); downloadActionArtifact(artifact); }}>{tr("另存为", "Save as")}</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {["running", "queued", "thinking", "streaming"].includes(node.status) && (
        <button
          className="stop-generation"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            node.type === "action"
              ? stopAgentJob(node)
              : stopGeneration(node.id);
          }}
        >
          {tr("停止", "Stop")}
        </button>
      )}
      <button
        className="resize-handle"
        aria-label={tr("调整卡片大小", "Resize card")}
        onPointerDown={(event) => beginResize(event, node)}
      />
      <button
        className="relation-handle"
        aria-label={tr("拖出关系线", "Create relation")}
        title={tr(
          "拖到另一个节点，选择继承、引用或合并",
          "Drag to another node, then choose inherit, reference, or merge",
        )}
        onPointerDown={(event) => beginRelationDrag(event, node)}
      >
        ⌁
      </button>
      {childCount > 0 && (
        <button
          className={`collapse-button ${collapsed ? "collapsed" : ""}`}
          aria-label={
            collapsed
              ? tr(
                  `展开分支，包含 ${hiddenCount} 个节点`,
                  `Expand branch (${hiddenCount} nodes)`,
                )
              : tr(
                  `折叠分支，包含 ${hiddenCount} 个节点`,
                  `Collapse branch (${hiddenCount} nodes)`,
                )
          }
          onPointerDown={stopNonRightDown}
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapse(node.id);
          }}
        >
          {collapsed ? `+${hiddenCount}` : "−"}
        </button>
      )}
      <button
        className={`fork-button ${branching ? "armed" : ""}`}
        aria-label={
          branching
            ? tr("取消创建分支", "Cancel branch")
            : tr("从这里创建分支", "Branch from here")
        }
        onPointerDown={stopNonRightDown}
        onClick={(event) => {
          event.stopPropagation();
          startBranch(node);
        }}
      >
        <span>{branching ? "✓" : "＋"}</span>
      </button>
      {branching && (
        <div className="branch-feedback">
          {tr("已选为分叉起点", "Selected as branch origin")}
        </div>
      )}
    </>
  );
}
