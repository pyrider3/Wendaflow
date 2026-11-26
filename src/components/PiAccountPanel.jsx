import React, { useEffect, useState } from "react";
import { LOCAL_PROXY_URL } from "../localProxy.js";
import { Button, Group, Row } from "./settings/ui.jsx";

const money = (value) => `$${value >= 100 ? value.toFixed(0) : value >= 1 ? value.toFixed(2) : value.toFixed(value >= 0.01 ? 3 : 4)}`;
const count = (value) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : String(value);

// Settings → Agents, for the built-in Pi: subscription logins (only possible in Pi's own /login) and what
// Pi has spent across all its sessions lately.
export function PiAccountPanel({ command, onReloadPi, tr }) {
  const [usage, setUsage] = useState(null);
  const [days, setDays] = useState(30);
  const [login, setLogin] = useState({ state: "idle", text: "" });
  useEffect(() => {
    let stale = false;
    setUsage(null);
    fetch(`${LOCAL_PROXY_URL}/agents/pi/usage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) })
      .then((response) => response.json()).then((result) => { if (!stale) setUsage(result.error ? { error: result.error } : result); })
      .catch((error) => { if (!stale) setUsage({ error: error.message }); });
    return () => { stale = true; };
  }, [days]);
  const openLogin = async () => {
    setLogin({ state: "busy", text: "" });
    try {
      const response = await fetch(`${LOCAL_PROXY_URL}/agents/pi/login-terminal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setLogin({ state: "opened", text: tr("已在终端里打开 Pi。输入 /login 选择服务商并完成登录，然后回到这里点“重新读取模型”。", "Pi is open in a terminal. Type /login, pick a provider and finish signing in, then come back and press “Reload models”.") });
    } catch (error) { setLogin({ state: "error", text: error.message }); }
  };
  const peak = Math.max(...(usage?.days || []).map((day) => day.cost), 0);
  return (
    <>
      <Group title={tr("订阅账号", "Subscriptions")} hint={tr("Claude Pro/Max、ChatGPT、GitHub Copilot 这类订阅不用 API 密钥，要在 Pi 里登录一次；登录后它们的模型会出现在 Pi 的模型列表里。", "Subscriptions such as Claude Pro/Max, ChatGPT or GitHub Copilot need no API key; sign in once inside Pi and their models show up in Pi's model list.")}>
        <Row title={tr("在终端里登录", "Sign in from a terminal")} hint={login.text || undefined}>
          <Button kind="primary" disabled={login.state === "busy"} onClick={openLogin}>{tr("打开终端登录", "Open terminal to sign in")}</Button>
          <Button onClick={onReloadPi}>{tr("重新读取模型", "Reload models")}</Button>
        </Row>
      </Group>
      <Group title={tr("Pi 用量", "Pi usage")} hint={tr("统计这台电脑上所有 Pi 会话（包括终端里用的），按 Pi 记录的价格计算。", "Covers every Pi session on this computer, terminal ones included, priced as Pi records them.")}
        action={<div className="pi-usage-range" role="group" aria-label={tr("时间范围", "Time range")}>{[7, 30, 90].map((value) => <button key={value} className={days === value ? "selected" : ""} onClick={() => setDays(value)}>{tr("{0} 天", "{0} days").replace("{0}", value)}</button>)}</div>}>
        {!usage && <div className="sx-row"><div className="sx-row-text"><span>{tr("正在统计…", "Adding it up…")}</span></div></div>}
        {usage?.error && <div className="sx-row"><div className="sx-row-text"><span>{usage.error}</span></div></div>}
        {usage && !usage.error && (
          <div className="pi-usage">
            <div className="pi-usage-totals">
              <div><small>{tr("花费", "Spent")}</small><strong>{money(usage.totals.cost)}</strong></div>
              <div><small>{tr("回答次数", "Replies")}</small><strong>{count(usage.totals.turns)}</strong></div>
              <div><small>{tr("输入 / 输出 token", "Tokens in / out")}</small><strong>{count(usage.totals.input + usage.totals.cacheRead)} / {count(usage.totals.output)}</strong></div>
              <div><small>{tr("会话", "Sessions")}</small><strong>{count(usage.totals.sessions)}</strong></div>
            </div>
            <div className="pi-usage-bars" role="img" aria-label={tr("每天的花费", "Spending per day")}>
              {usage.days.map((day) => <span key={day.date} title={`${day.date} · ${money(day.cost)} · ${count(day.tokens)} tokens`} style={{ "--h": peak ? `${Math.max(day.cost ? 4 : 0, (day.cost / peak) * 100)}%` : "0%" }} />)}
            </div>
            {usage.models.length > 0 && (
              <ul className="pi-usage-models">
                {usage.models.slice(0, 6).map((item) => <li key={item.model}><span>{item.model}</span><em>{count(item.tokens)} tokens</em><b>{money(item.cost)}</b></li>)}
              </ul>
            )}
          </div>
        )}
      </Group>
    </>
  );
}
