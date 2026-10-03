import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    openActionArtifact,
    downloadActionArtifact,
    openLibraryItem,
    toggleActivity,
    stopAgentJob,
    stopGeneration,
    beginResize,
    beginRelationDrag,
    toggleCollapse,
    startBranch,
  } = actions;
  const { statusLabel, outputAssets, actionArtifacts, shouldShowNodeThinking } =
    helpers;
  const assets = outputAssets(node.content);
  const artifacts = node.type === "action" ? actionArtifacts(node) : [];
  const liveEvents =
    node.type === "action" ? (node.execution?.events || []).slice(-18) : [];
  const activityCollapsed = node.execution?.activityCollapsed !== false;
  const showNodeThinking = shouldShowNodeThinking(node);
  return (
    <>
      <div className="node-topline">
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
      </div>
      {!!assets.length && (
        <div className="output-assets">
          {assets.map((asset) => (
            <a
              key={asset.url}
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              onPointerDown={(event) => event.stopPropagation()}
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
        <h2>{displayTitle}</h2>
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
      {!editing && previewContentPhase !== "hidden" && (
        <div
          className={`markdown-content preview-content-${previewContentPhase}`}
          onWheel={handleContentWheel}
        >
          {(node.type !== "thought" || node.content !== displayTitle) && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...props }) => (
                  <a
                    {...props}
                    href={href}
                    onClick={(event) => {
                      if (node.type !== "action") return;
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
              }}
            >
              {node.content}
            </ReactMarkdown>
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
                      href={item.dataUrl}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openLibraryItem(item);
                      }}
                    >
                      <img src={item.dataUrl} alt={item.name} />
                      <span>
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
                      onPointerDown={(event) => event.stopPropagation()}
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
            {liveEvents.map((event) => (
              <article key={event.id} className={event.type}>
                <i>
                  {event.type === "thinking"
                    ? tr("思", "TH")
                    : event.type === "command"
                      ? "›_"
                      : event.type === "file"
                        ? tr("文", "FI")
                        : event.type === "message"
                          ? tr("答", "RE")
                          : "·"}
                </i>
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
      {node.type === "action" && (
        <section
          className={`action-artifacts ${artifacts.length ? "" : "empty"}`}
        >
          <header>
            <span>{tr("产物", "Artifacts")}</span>
            <small>
              {artifacts.length
                ? `${artifacts.length} ${tr("项", "items")}`
                : node.status === "running"
                  ? tr("正在收集…", "Collecting…")
                  : tr("暂无", "None")}
            </small>
          </header>
          {artifacts.length > 0 && (
            <div>
              {artifacts.map((artifact) =>
                artifact.href || artifact.localPath ? (
                  <div
                    className="artifact-item"
                    key={artifact.id}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <i>{artifact.image ? tr("图", "IMG") : tr("档", "FILE")}</i>
                    <span>
                      <strong>{artifact.name}</strong>
                      <small>{systemText(artifact.state)}</small>
                    </span>
                    <button
                      title={tr(
                        "下载到指定位置",
                        "Download to a selected location",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        downloadActionArtifact(artifact);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      title={tr(
                        "用系统默认程序打开",
                        "Open with the default app",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        openActionArtifact(artifact);
                      }}
                    >
                      ↗
                    </button>
                  </div>
                ) : (
                  <div key={artifact.id}>
                    <i>{tr("文", "DOC")}</i>
                    <span>
                      <strong>{artifact.name}</strong>
                      <small>{systemText(artifact.state)}</small>
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
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
          onPointerDown={(event) => event.stopPropagation()}
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
        onPointerDown={(event) => event.stopPropagation()}
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
