import React, { useState } from "react";
import { Button, Field, Group, Input, Row, Select } from "../settings/ui.jsx";
import { Callout, Collapse, Icon, IconButton, Segmented, Swatches, Textarea } from "./ui.jsx";
import "../settings/settings.css";
import "./inspector.css";

// Card inspector. `ctx` carries the app state and handlers it needs, so the
// component stays presentational and the App keeps ownership of the data.
export function Inspector({ ctx }) {
  const {
    selected, nodes, activePath, activeCanvas, closing, uiLanguage,
    tr, say, text, copy, statusLabel, systemText, canEditCard, NODE_COLORS, colorLabel,
    model, setModel, modelOptions, retryGeneration, stopGeneration, stopAgentJob, approveAction, openWorkspaceDirectory,
    editingNode, editDraft, setEditDraft, startEditingNode, saveNodeEdit, cancelEdit,
    setNodes, selectNode, startBranch, askAnotherAngle, continueAction,
    linkType, setLinkType, linkingFrom, setLinkingFrom,
    mindMapState, setMindMapState, generateMindMapSuggestions, addMindMapSuggestions,
    deletionIds, deletingIds, deleteSelection, onClose, onOpenSettings,
    titleExpanded, setTitleExpanded,
  } = ctx;
  const [contextOpen, setContextOpen] = useState(false);

  const patch = (changes) =>
    setNodes((items) => items.map((node) => (node.id === selected.id ? { ...node, ...changes } : node)));
  const isConversation = selected.type === "conversation";
  const isAction = selected.type === "action";
  const typeLabel = isConversation ? copy.chat : isAction ? copy.action : copy.idea;
  const state = isConversation || isAction ? statusLabel(selected.status, uiLanguage) : "";
  const busy = ["queued", "thinking", "streaming"].includes(selected.status);
  const linkNames = { inherit: tr("继承", "Inherit"), reference: tr("引用", "Reference"), merge: tr("合并", "Merge") };
  const linkHelp = {
    inherit: tr("目标节点会成为当前节点的子分支。", "The target node becomes a child branch of the current node."),
    merge: tr("将目标节点加入后续分支的合并上下文。", "Add the target node to the merged context for later branches."),
    reference: tr("关联但不改变树结构；后续分支会引用目标节点。", "Link without changing the tree; later branches cite the target node."),
  }[linkType];
  const parent = selected.parentId ? nodes.find((node) => node.id === selected.parentId) : null;
  const titleOf = (id) => nodes.find((node) => node.id === id)?.title || tr("已删除节点", "Deleted node");
  const record = selected.requestRecord;
  const events = selected.execution?.events || [];

  return (
    <aside
      className={`sx ix${closing ? " closing" : ""}`}
      aria-label={text("currentNode")}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="ix-head">
        <div className="ix-head-top">
          <span className={`ix-type ${selected.type}`}>
            <i aria-hidden="true" />
            {typeLabel}
          </span>
          {state && <span className={`ix-state ${selected.status}`}>{state}</span>}
          <span className="ix-spacer" />
          <IconButton
            icon="star"
            pressed={Boolean(selected.favorite)}
            label={selected.favorite ? tr("取消收藏", "Remove from favorites") : tr("收藏", "Favorite")}
            onClick={() => patch({ favorite: !selected.favorite })}
          />
          <IconButton
            icon="check"
            pressed={Boolean(selected.completed)}
            label={selected.completed ? tr("标为未完成", "Mark as not done") : tr("标为完成", "Mark as done")}
            onClick={() => patch({ completed: !selected.completed })}
          />
          <IconButton icon="close" label={text("close")} onClick={onClose} />
        </div>
        <button
          type="button"
          className={`ix-title${titleExpanded ? " expanded" : ""}`}
          title={selected.title}
          onClick={() => setTitleExpanded((value) => !value)}
        >
          {selected.title}
        </button>
        <div className="ix-meta">
          {[selected.author, selected.model || text("manualInput")].filter(Boolean).join(" · ")}
        </div>
      </header>

      <div className="ix-scroll">
        <div className="ix-body" key={selected.id}>
          {selected.prompt && (
            <section className="ix-quote">
              <small>{tr("这一轮的问题", "Question in this turn")}</small>
              <p>{selected.prompt}</p>
            </section>
          )}

          {isConversation && selected.status === "failed" && (
            <Callout
              tone="danger"
              title={tr("生成失败", "Generation failed")}
              actions={
                <>
                  <Button kind="primary" className="small" disabled={!selected.prompt} onClick={() => retryGeneration(selected, model)}>
                    {tr("修复连接后重试", "Retry after fixing connection")}
                  </Button>
                  <Button className="small" onClick={onOpenSettings}>
                    {text("settings")}
                  </Button>
                </>
              }
            >
              {systemText(selected.error) || systemText(selected.generationPhase)}
            </Callout>
          )}
          {isConversation && busy && (
            <Callout tone="busy" title={statusLabel(selected.status, uiLanguage)} actions={<Button kind="danger" className="small" onClick={() => stopGeneration(selected.id)}>{tr("停止生成", "Stop generation")}</Button>}>
              {systemText(selected.generationPhase)}
            </Callout>
          )}

          {isAction && (
            <Group title={tr("本地行动", "Local action")}>
              <Row
                title={statusLabel(selected.status, uiLanguage)}
                hint={
                  selected.status === "running"
                    ? `${selected.model || tr("执行器", "Runner")} ${tr("正在本地工作区执行", "is running in the local workspace")}`
                    : selected.status === "done"
                      ? tr("执行已完成，记录和产物均已保存", "Execution completed. Records and artifacts are saved.")
                      : selected.status === "failed"
                        ? tr("执行失败，请检查代理连接", "Execution failed. Check the agent connection.")
                        : tr("等待执行", "Waiting to run")
                }
              />
              <Row title={selected.execution?.workspace || activeCanvas?.workspace || tr("Wendaflow 项目目录", "Wendaflow project directory")} stack>
                <Button className="small" onClick={() => openWorkspaceDirectory(selected.execution?.workspace || activeCanvas?.workspace || "")}>
                  <Icon name="folder" /> {tr("打开 ↗", "Open ↗")}
                </Button>
              </Row>
              {selected.status === "approval" && (
                <div className="ix-pad">
                  <Button kind="primary" className="ix-wide" onClick={approveAction}>
                    {tr("允许", "Allow")} {selected.model || tr("执行器", "Runner")} {tr("执行", "to run")}
                  </Button>
                </div>
              )}
              {selected.status === "running" && (
                <div className="ix-pad">
                  <Button kind="danger" className="ix-wide" onClick={() => stopAgentJob(selected)}>
                    <Icon name="stop" /> {tr("停止当前任务", "Stop current task")}
                  </Button>
                </div>
              )}
              <div className="ix-pad">
                <Button className="ix-wide" onClick={continueAction}>
                  {tr("追加指令并继续", "Add instructions and continue")}
                </Button>
              </div>
            </Group>
          )}

          {editingNode ? (
            <Group title={tr("编辑节点", "Edit node")} className="ix-editor">
              <div className="ix-form">
                <Field label={tr("节点类型", "Node type")}>
                  <Select value={editDraft.type} onChange={(event) => setEditDraft((value) => ({ ...value, type: event.target.value }))}>
                    <option value="conversation">{copy.chat}</option>
                    <option value="thought">{copy.idea}</option>
                    <option value="action">{copy.action}</option>
                  </Select>
                </Field>
                <Field label={tr("标题", "Title")}>
                  <Input value={editDraft.title} onChange={(event) => setEditDraft((value) => ({ ...value, title: event.target.value }))} />
                </Field>
                {editDraft.type === "conversation" && (
                  <Field label={tr("这一轮的问题", "Question in this turn")}>
                    <Textarea rows={3} value={editDraft.prompt} onChange={(event) => setEditDraft((value) => ({ ...value, prompt: event.target.value }))} />
                  </Field>
                )}
                <Field label={tr("正文（Markdown）", "Body (Markdown)")}>
                  <Textarea className="content-edit" rows={6} value={editDraft.content} onChange={(event) => setEditDraft((value) => ({ ...value, content: event.target.value }))} />
                </Field>
                <Field label={tr("标签", "Tags")}>
                  <Input value={editDraft.tags} onChange={(event) => setEditDraft((value) => ({ ...value, tags: event.target.value }))} placeholder={tr("研究，重要，待确认", "Research, important, pending")} />
                </Field>
                <Field label={tr("卡片颜色", "Card color")}>
                  <Swatches colors={NODE_COLORS} value={editDraft.color} labelFor={colorLabel} onPick={(color) => setEditDraft((value) => ({ ...value, color }))} />
                </Field>
                <Field label={tr("备注", "Note")}>
                  <Textarea rows={3} value={editDraft.note} onChange={(event) => setEditDraft((value) => ({ ...value, note: event.target.value }))} placeholder={tr("不会发送给 AI 的私人备注", "Private note not sent to AI")} />
                </Field>
                <div className="ix-form-actions">
                  <Button onClick={cancelEdit}>{tr("取消", "Cancel")}</Button>
                  <Button kind="primary" onClick={saveNodeEdit}>{tr("保存", "Save")}</Button>
                </div>
              </div>
            </Group>
          ) : (
            <Group title={tr("卡片", "Card")}>
              <Row title={tr("卡片颜色", "Card color")} stack>
                <Swatches colors={NODE_COLORS} value={selected.color} labelFor={colorLabel} onPick={(color) => patch({ color })} />
              </Row>
              <Row
                title={tr("编辑、转换类型与标签", "Edit, convert type, and tags")}
                hint={canEditCard(selected) ? undefined : say("AI 生成内容只读", "AI-generated content is read-only")}
              >
                <Button className="small" disabled={!canEditCard(selected)} onClick={() => startEditingNode()}>
                  <Icon name="edit" /> {tr("编辑", "Edit")}
                </Button>
              </Row>
              {selected.note && (
                <Row title={tr("私人备注", "Private note")} hint={selected.note} />
              )}
            </Group>
          )}

          {isConversation && !editingNode && (
            <Group title={tr("生成操作", "Generation actions")}>
              <Row title={tr("重试模型", "Retry model")} stack>
                <Select value={model} onChange={(event) => setModel(event.target.value)}>
                  {modelOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </Select>
              </Row>
              <div className="ix-pad two">
                <Button className="ix-wide" disabled={busy || !selected.prompt} onClick={() => retryGeneration(selected, model)}>
                  <Icon name="refresh" /> {tr("使用所选模型重新生成", "Regenerate with selected model")}
                </Button>
                <Button className="ix-wide" onClick={askAnotherAngle}>
                  {tr("换个角度追问", "Ask from another angle")}
                </Button>
              </div>
            </Group>
          )}

          <Group title={tr("关联与扩展", "Relations and expansion")}>
            <div className="ix-pad">
              <Segmented
                label={tr("关联方式", "Link type")}
                value={linkType}
                onChange={setLinkType}
                items={[["inherit", linkNames.inherit], ["reference", linkNames.reference], ["merge", linkNames.merge]]}
              />
              <p className="ix-help" key={linkType}>{linkHelp}</p>
              <Button className={`ix-wide${linkingFrom === selected.id ? " active" : ""}`} onClick={() => setLinkingFrom((current) => (current === selected.id ? null : selected.id))}>
                <Icon name="link" />{" "}
                {linkingFrom === selected.id
                  ? tr(`取消${linkNames[linkType]}连线`, `Cancel ${linkNames[linkType]} link`)
                  : tr(`建立${linkNames[linkType]}连线`, `Create ${linkNames[linkType]} link`)}
              </Button>
            </div>
            {parent && (
              <Row title={`${tr("继承自", "Inherited from")} · ${parent.title}`} hint={undefined}>
                <Button kind="ghost" className="small" onClick={() => patch({ parentId: null })}>{tr("解除继承", "Remove inheritance")}</Button>
              </Row>
            )}
            {(selected.relations || []).map((relation) => (
              <Row key={relation.id} title={`${relation.type === "merge" ? tr("合并", "Merge") : tr("引用", "Reference")} · ${titleOf(relation.targetId)}`}>
                <Button kind="ghost" className="small" onClick={() => patch({ relations: (selected.relations || []).filter((item) => item.id !== relation.id) })}>
                  {tr("删除", "Delete")}
                </Button>
              </Row>
            ))}
            <div className="ix-pad">
              <Segmented
                label={tr("AI 扩展思维导图", "AI mind-map expansion")}
                value={mindMapState.mode}
                onChange={(mode) => setMindMapState((current) => ({ ...current, mode }))}
                items={[["questions", tr("问题", "Questions")], ["ideas", tr("想法", "Ideas")], ["counterpoints", tr("反驳", "Counterpoints")], ["actions", tr("行动", "Actions")]]}
              />
              <Button kind="primary" className="ix-wide" onClick={() => generateMindMapSuggestions(selected, mindMapState.mode)}>
                <Icon name="sparkle" /> {tr("AI 扩展思维导图", "AI mind-map expansion")}
              </Button>
            </div>
            {mindMapState.nodeId === selected.id && (
              <div className="ix-suggest">
                {mindMapState.status && <small>{systemText(mindMapState.status)}</small>}
                {mindMapState.suggestions.map((idea, index) => (
                  <label key={`${idea}-${index}`} className={mindMapState.selected.includes(idea) ? "on" : ""} style={{ "--d": `${index * 40}ms` }}>
                    <input
                      type="checkbox"
                      checked={mindMapState.selected.includes(idea)}
                      onChange={(event) =>
                        setMindMapState((current) => ({
                          ...current,
                          selected: event.target.checked ? [...current.selected, idea] : current.selected.filter((item) => item !== idea),
                        }))
                      }
                    />
                    <i aria-hidden="true"><Icon name="check" /></i>
                    <span>{idea}</span>
                  </label>
                ))}
                {mindMapState.suggestions.length > 0 && (
                  <div className="ix-form-actions">
                    <Button onClick={() => setMindMapState({ nodeId: null, status: "", suggestions: [], selected: [], mode: "questions" })}>{tr("全部丢弃", "Discard all")}</Button>
                    <Button kind="primary" disabled={!mindMapState.selected.length} onClick={addMindMapSuggestions}>
                      {tr("接受", "Accept")} {mindMapState.selected.length} {tr("个节点", "nodes")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Group>

          <div className={`ix-fold${contextOpen ? " open" : ""}`}>
            <button type="button" className="ix-fold-head" aria-expanded={contextOpen} onClick={() => setContextOpen((value) => !value)}>
              <strong>{`${tr("上下文", "Context")} · ${activePath.length}`}</strong>
              <span>
                {contextOpen ? tr("收起", "Collapse") : tr("展开", "Expand")}
                <Icon name="chevron" className={contextOpen ? "turn" : ""} />
              </span>
            </button>
            <Collapse open={contextOpen}>
              {activePath.length ? (
                <div className="ix-path">
                  {activePath.map((node, index) => (
                    <button key={node.id} type="button" className={node.id === selected.id ? "active" : ""} onClick={() => selectNode(node.id)}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{node.title}</strong>
                        <small>{node.content}</small>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Row title={tr("当前节点没有继承上下文。", "This node has no inherited context.")} />
              )}
              {isConversation && record && (
                <div className="ix-record">
                  <dl>
                    <dt>{tr("模型", "Model")}</dt><dd>{record.provider} · {record.model}</dd>
                    <dt>{tr("状态", "Status")}</dt><dd>{statusLabel(record.status, uiLanguage) || record.status}</dd>
                    <dt>{tr("耗时", "Duration")}</dt>
                    <dd>{record.durationMs ? tr(`${(record.durationMs / 1000).toFixed(1)} 秒`, `${(record.durationMs / 1000).toFixed(1)} seconds`) : tr("进行中", "In progress")}</dd>
                    <dt>{tr("上下文", "Context")}</dt>
                    <dd>{record.context?.length || 0} {tr("条", "items")} · {tr("附件", "attachments")} {record.attachments?.length || 0}</dd>
                  </dl>
                  {record.context?.length > 0 && (
                    <div className="ix-chips">
                      {record.context.map((item) => (
                        <span key={item.id} className={item.relation}>
                          {item.relation === "merge" ? tr("合并", "Merge") : item.relation === "reference" ? tr("引用", "Reference") : tr("继承", "Inherit")} · {item.title}
                        </span>
                      ))}
                    </div>
                  )}
                  {record.error && <pre>{systemText(record.error)}</pre>}
                </div>
              )}
              {isAction && events.length > 0 && (
                <div className="ix-record">
                  <strong>{tr("代理执行记录", "Agent execution record")} · {events.length} {tr("条", "items")}</strong>
                  <div className="ix-timeline">
                    {events.map((event) => (
                      <article key={event.id} className={event.type}>
                        <i />
                        <div>
                          <small>{new Date(event.at).toLocaleTimeString(uiLanguage)}</small>
                          <pre>{event.text}</pre>
                        </div>
                      </article>
                    ))}
                  </div>
                  {selected.execution.after?.status && <details><summary>{tr("工作区文件变化", "Workspace file changes")}</summary><pre>{selected.execution.after.status}</pre></details>}
                  {selected.execution.after?.diff && <details><summary>{tr("查看代码差异", "View code diff")}</summary><pre>{selected.execution.after.diff}</pre></details>}
                </div>
              )}
            </Collapse>
          </div>

          <div className="ix-danger">
            <Button kind="danger" disabled={!deletionIds.size || deletingIds.size} onClick={deleteSelection}>
              <Icon name="trash" /> {say(`删除选中的 ${deletionIds.size} 个卡片（保留子节点）`, `Delete ${deletionIds.size} selected cards (keep children)`)}
            </Button>
          </div>
        </div>
      </div>

      <footer className="ix-foot">
        <Button kind="primary" className="ix-branch" onClick={() => startBranch(selected)}>
          <Icon name="plus" /> {tr("分支", "Branch")}
        </Button>
      </footer>
    </aside>
  );
}
