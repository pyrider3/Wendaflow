import React, { useEffect, useState } from "react";
import { LOCAL_PROXY_URL } from "../localProxy.js";
import { AGENT_IDS, AGENT_LABELS } from "../agents/catalog.mjs";
import { Button, Empty, Field, Fields, Group, Input, Page, Row, Select, Status, Switch } from "./settings/ui.jsx";
import { PiModelOptions, PiThinkingOptions, parsePiSelection, piSelectionValue } from "./PiOptions.jsx";

export function AgentsPanel({ enabled, onToggle, settings, onSettingChange, detection, onRedetect, piInfo, piLevels, piResources, onReloadPi, systemNotifications, onSystemNotificationsChange, workspaceConfig, onSaveWorkspace, onPickWorkspace, tr }) {
  const hints = {
    pi: tr("可自己配置命令、模型和参数的编程智能体。", "A coding agent whose command, model and arguments you configure yourself."),
    codex: tr("OpenAI 的 Codex 命令行。", "OpenAI's Codex command line."),
    claude: tr("Anthropic 的 Claude Code 命令行。", "Anthropic's Claude Code command line."),
    deepseek: tr("DeepSeek Harness，需要 DeepSeek API 密钥。", "DeepSeek Harness; needs a DeepSeek API key."),
  };
  const set = (id) => (patch) => onSettingChange(id, patch);
  const [folderDraft, setFolderDraft] = useState("");
  const [folderError, setFolderError] = useState("");
  const applyFolder = async (value) => {
    const failure = await onSaveWorkspace(value);
    setFolderError(failure || "");
    if (!failure) setFolderDraft("");
  };

  const [allowRules, setAllowRules] = useState({});
  useEffect(() => {
    fetch(`${LOCAL_PROXY_URL}/agents/allow-rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((response) => response.json()).then((result) => setAllowRules(result.rules || {})).catch(() => {});
  }, []);
  const removeRule = async (workspace, index) => {
    const response = await fetch(`${LOCAL_PROXY_URL}/agents/allow-rules/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, index }) });
    const result = await response.json().catch(() => ({}));
    if (response.ok) setAllowRules(result.rules || {});
  };
  const ruleLabel = (rule) => (rule.tool === "files" ? tr("修改此目录内的文件", "Edit files inside this folder") : rule.exact !== undefined ? tr("命令（完全一致）：{0}", "Command (exact): {0}").replace("{0}", rule.exact) : tr("以 {0} 开头的命令", "Commands starting with {0}").replace("{0}", rule.prefix));
  const ruleEntries = Object.entries(allowRules).flatMap(([folder, rules]) => rules.map((rule) => ({ folder, rule })));

  const status = (id) => {
    const found = detection?.[id];
    if (!detection) return <Status tone="busy">{tr("正在检测…", "Detecting…")}</Status>;
    if (found?.installed) return <Status tone="ok">{found.version ? tr(`已安装 · ${found.version}`, `Installed · ${found.version}`) : tr("已安装", "Installed")}</Status>;
    return <Status tone="warn">{found?.error || tr("没有检测到", "Not found")}</Status>;
  };

  const fields = {
    pi: (o, update) => {
      const noThinking = piLevels?.levels?.length === 1 && piLevels.levels[0] === "off";
      return (
        <Fields>
          <Field label={tr("命令或完整路径", "Command or full path")} span>
            <Input value={o.command} onChange={(e) => update({ command: e.target.value })} onBlur={onRedetect} placeholder={tr("留空则使用 PATH 里的 pi", "Leave empty to use pi from PATH")} spellCheck={false} />
          </Field>
          <Field label={tr("模型", "Model")} span>
            <Select value={piSelectionValue(o)} onChange={(e) => update({ ...parsePiSelection(e.target.value), thinking: "" })}>
              <PiModelOptions info={piInfo} selection={piSelectionValue(o)} tr={tr} />
            </Select>
            {piInfo?.error && <span className="sx-hint">{tr("无法读取 Pi 的模型列表：{0}", "Could not load Pi's model list: {0}").replace("{0}", piInfo.error)} <Button onClick={onReloadPi}>{tr("重试", "Retry")}</Button></span>}
            {!piInfo && <span className="sx-hint">{tr("正在读取 Pi 的模型列表…", "Loading Pi's model list…")}</span>}
          </Field>
          <Field label={tr("思考强度", "Thinking level")}>
            <Select value={o.thinking || ""} disabled={noThinking} onChange={(e) => update({ thinking: e.target.value })}>
              <PiThinkingOptions levels={piLevels} current={o.model ? undefined : piInfo?.current?.thinkingLevel} tr={tr} />
            </Select>
            {noThinking && <span className="sx-hint">{tr("这个模型不支持思考", "This model does not support thinking")}</span>}
          </Field>
          <Field label={tr("权限", "Permissions")}>
            <Select value={o.permission || (o.readOnly ? "read" : "full")} onChange={(e) => update({ permission: e.target.value, readOnly: e.target.value === "read" })}>
              <option value="ask">{tr("执行前询问", "Ask before acting")}</option>
              <option value="full">{tr("完全信任", "Full trust")}</option>
              <option value="read">{tr("只读（读取与搜索）", "Read-only (read and search)")}</option>
            </Select>
            <span className="sx-hint">{tr("Pi 自己不会在执行前询问。选“执行前询问”后，Wendaflow 会在编辑、写入和运行命令前请你批准；“只读”只开放读取和搜索。", "Pi never asks before acting by itself. “Ask before acting” makes Wendaflow ask you before edits, writes and commands; “Read-only” offers only read and search.")}</span>
          </Field>
          <Field label={tr("保存会话", "Save sessions")} span>
            <Switch checked={o.saveSession !== false} onChange={(value) => update({ saveSession: value })} label={tr("保存会话", "Save sessions")} onLabel={tr("保存到 Pi，可继续和分叉", "Saved in Pi; can continue and fork")} offLabel={tr("不保存", "Not saved")} />
          </Field>
          <Field label={tr("额外参数", "Extra arguments")} span>
            <Input value={o.extraArgs} onChange={(e) => update({ extraArgs: e.target.value })} placeholder="--append-system-prompt ./notes.md" spellCheck={false} />
          </Field>
          {piResources && (
            <Field label={tr("技能与 MCP 服务器", "Skills and MCP servers")} span>
              <div className="sx-tags">
                {piResources.skills.map((skill) => <span key={`s-${skill.name}`} title={skill.description}>{skill.name}</span>)}
                {piResources.mcp.map((server) => <span key={`m-${server.name}`} className={`mcp ${server.enabled ? "" : "off"}`} title={server.description}>{server.name}{server.enabled ? "" : ` · ${tr("已关闭", "Off")}`}</span>)}
                {!piResources.skills.length && !piResources.mcp.length && <span className="sx-hint">{tr("没有", "None")}</span>}
              </div>
              <span className="sx-hint">{tr("只读显示。要增减或开关它们，请在 Pi 里用 pi config 和 pi mcp。", "Read-only. To add, remove or switch them, use pi config and pi mcp in Pi.")}</span>
            </Field>
          )}
        </Fields>
      );
    },
    codex: (o, update) => (
      <Fields>
        <Field label={tr("模型", "Model")}>
          <Input value={o.model} onChange={(e) => update({ model: e.target.value })} placeholder={tr("使用默认模型", "Use default model")} spellCheck={false} />
        </Field>
        <Field label={tr("推理强度", "Reasoning effort")}>
          <Select value={o.reasoning} onChange={(e) => update({ reasoning: e.target.value })}>
            <option value="low">{tr("低", "Low")}</option><option value="medium">{tr("中", "Medium")}</option>
            <option value="high">{tr("高", "High")}</option><option value="xhigh">{tr("极高", "XHigh")}</option>
          </Select>
        </Field>
        <Field label={tr("执行模式", "Execution mode")} span>
          <Select value={o.accessMode} onChange={(e) => update({ accessMode: e.target.value })}>
            <option value="read-only">{tr("只读分析", "Read-only analysis")}</option>
            <option value="workspace-write">{tr("工作区可写", "Workspace write")}</option>
            <option value="auto-review">{tr("自动审查并执行", "Auto-review and execute")}</option>
            <option value="full-access">{tr("完全访问（跳过审批与沙箱）", "Full access (skip approvals and sandbox)")}</option>
          </Select>
        </Field>
      </Fields>
    ),
    claude: (o, update) => (
      <Fields>
        <Field label={tr("模型", "Model")}>
          <Input value={o.model} onChange={(e) => update({ model: e.target.value })} placeholder={tr("使用默认模型", "Use default model")} spellCheck={false} />
        </Field>
        <Field label={tr("权限模式", "Permission mode")}>
          <Select value={o.permissionMode} onChange={(e) => update({ permissionMode: e.target.value })}>
            <option value="default">{tr("默认", "Default")}</option><option value="plan">{tr("规划（只读）", "Plan (read-only)")}</option>
            <option value="acceptEdits">{tr("自动接受编辑", "Accept edits")}</option><option value="bypassPermissions">{tr("跳过权限", "Bypass permissions")}</option>
          </Select>
        </Field>
        <Field label={tr("最大轮数", "Maximum turns")}>
          <Input type="number" min="1" max="200" value={o.maxTurns} onChange={(e) => update({ maxTurns: e.target.value })} placeholder={tr("不限制", "No limit")} />
        </Field>
      </Fields>
    ),
    deepseek: (o, update) => (
      <Fields>
        <Field label={tr("推理策略", "Reasoning strategy")}>
          <Select value={o.reasoning} onChange={(e) => update({ reasoning: e.target.value })}>
            <option value="low">{tr("低", "Low")}</option><option value="medium">{tr("中", "Medium")}</option>
            <option value="high">{tr("高", "High")}</option><option value="max">{tr("最高", "Max")}</option>
          </Select>
        </Field>
        <Field label={tr("深度思考", "Extended thinking")}>
          <Switch checked={!!o.thinking} onChange={(value) => update({ thinking: value })} label={tr("深度思考", "Extended thinking")} onLabel={tr("已开启", "On")} offLabel={tr("已关闭", "Off")} />
        </Field>
        <Field label={tr("API 密钥", "API key")} span>
          <span className="sx-hint">{tr("写在 ~/.dsh/.env 里的 DEEPSEEK_API_KEY=…，Wendaflow 不会读取它。", "Put DEEPSEEK_API_KEY=… in ~/.dsh/.env. Wendaflow never reads it.")}</span>
        </Field>
      </Fields>
    ),
  };

  return (
    <Page title={tr("执行器", "Agents")} description={tr("行动模式会把任务交给这里启用的执行器。默认没有启用任何一个，请开启你要用的。", "Action mode hands tasks to the agents enabled here. None is enabled by default; turn on the ones you want.")}>
      <Group title={tr("默认工作目录", "Default working directory")} hint={tr("没有指定文件夹的行动会在这里运行，而不是在 Wendaflow 自己的程序目录里。", "Actions with no folder chosen run here instead of in Wendaflow's own program folder.")}>
        <div className="sx-row">
          <div className="sx-row-text">
            <strong>{workspaceConfig?.defaultWorkspace || tr("还没有设置", "Not set yet")}</strong>
            {!workspaceConfig?.defaultWorkspace && <span>{tr("现在会在 Wendaflow 的程序目录里运行，Pi 等执行器可能往里面写文件。", "Actions currently run in Wendaflow's program folder, where agents such as Pi may write files.")}</span>}
          </div>
          <div className="sx-row-control">
            <Button onClick={async () => setFolderError((await onPickWorkspace()) || "")}>{tr("选择文件夹", "Choose folder")}</Button>
            {workspaceConfig?.defaultWorkspace && <Button onClick={() => applyFolder("")}>{tr("改回程序目录", "Use the program folder")}</Button>}
          </div>
        </div>
        <div className="sx-row stack">
          <Input value={folderDraft} onChange={(e) => { setFolderDraft(e.target.value); setFolderError(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyFolder(folderDraft); } }} placeholder={tr("或直接输入文件夹路径，按回车确认", "Or type a folder path and press Enter")} aria-label={tr("工作目录路径", "Working directory path")} spellCheck={false} />
          {folderError && <span className="sx-hint" role="alert">{folderError}</span>}
        </div>
      </Group>
      <Group title={tr("通知", "Notifications")} hint={tr("页面在后台时，任务需要你批准或完成后弹出系统通知，点一下回到对应卡片。", "While the page is in the background, get a system notification when a task needs approval or finishes; click it to jump to the card.")}>
        <Row title={tr("系统通知", "System notifications")} hint={typeof Notification !== "undefined" && Notification.permission === "denied" ? tr("浏览器已拒绝通知，请在站点设置里允许。", "The browser blocked notifications; allow them in the site settings.") : undefined}>
          <Switch checked={!!systemNotifications} onChange={onSystemNotificationsChange} label={tr("系统通知", "System notifications")} onLabel={tr("已开启", "On")} offLabel={tr("已关闭", "Off")} />
        </Row>
      </Group>
      <Group title={tr("已记住的“以后都允许”", "Remembered “always allow” rules")} hint={tr("在审批卡上点“以后都允许”会出现在这里；只对那个目录生效，带管道、分号或重定向的命令不会被自动批准。", "Created from the approval card; they apply to that folder only, and commands with pipes, semicolons or redirects are never auto-approved.")}>
        {ruleEntries.length === 0 && <div className="sx-row"><div className="sx-row-text"><span>{tr("还没有。", "None yet.")}</span></div></div>}
        {ruleEntries.map(({ folder, rule }) => (
          <div className="sx-row" key={`${folder}:${rule.index}`}>
            <div className="sx-row-text"><strong>{ruleLabel(rule)}</strong><span>{folder}</span></div>
            <div className="sx-row-control"><Button onClick={() => removeRule(folder, rule.index)}>{tr("删除", "Remove")}</Button></div>
          </div>
        ))}
      </Group>
      {!enabled.length && (
        <Group>
          <Empty icon="⌘" title={tr("还没有启用执行器", "No agent enabled yet")}>{tr("开启下面的一个或几个，行动模式里才能选它们。", "Enable one or more below to use them in Action mode.")}</Empty>
        </Group>
      )}
      {AGENT_IDS.map((id) => (
        <Group
          key={id}
          title={AGENT_LABELS[id]}
          hint={hints[id]}
          action={<Switch checked={enabled.includes(id)} onChange={(value) => onToggle(id, value)} label={tr(`启用 ${AGENT_LABELS[id]}`, `Enable ${AGENT_LABELS[id]}`)} onLabel={tr("已启用", "Enabled")} offLabel={tr("未启用", "Off")} />}
        >
          <div className="sx-row">
            <div className="sx-row-text"><strong>{tr("本机状态", "On this computer")}</strong>{detection?.[id]?.path && <span>{detection[id].path}</span>}</div>
            <div className="sx-row-control">{status(id)} <Button onClick={onRedetect}>{tr("重新检测", "Re-check")}</Button></div>
          </div>
          {enabled.includes(id) && fields[id](settings[id] || {}, set(id))}
        </Group>
      ))}
    </Page>
  );
}
