import React from 'react';
export function CanvasLibraryGroups({open,closed,saved,trash,activeId,onSwitch,onOpen,onReopen,onRestore,onTrash,say,time}) {
 const recovered=c=>c.restoredAt||c.id?.startsWith('restored-');
 const group=(title,items,render,empty)=><section className="canvas-library-group"><h3>{title}<small>{items.length}</small></h3>{items.length?items.map(render):<p>{empty}</p>}</section>;
 const row=(c,label,action,detail,trailing)=><div className={`canvas-entry ${c.id===activeId?'current':''}`} key={c.token||c.id}>
  <button className="canvas-entry-open" onClick={action}><strong>{c.name}{c.id===activeId&&<em>{say('当前','Current')}</em>}{recovered(c)&&<em>{say('恢复副本','Recovered copy')}</em>}</strong><small>{label}{detail}</small></button>{trailing}
 </div>;
 return <div className="canvas-library-groups">
  {group(say('已打开','Open canvases'),open,c=>row(c,say('切换到画布','Switch to canvas'),()=>onSwitch(c.id)),say('暂无打开的画布','No open canvases'))}
  {group(say('本地存档','Local archives'),saved,c=>row(c,say('保存于 ','Saved '),()=>onOpen(c.id),time(c.updatedAt)+(recovered(c)?say(' · 恢复于 ',' · Restored ')+time(c.restoredAt||c.updatedAt):''),<button className="archive-trash" aria-label={say('移入回收区 ','Move to recovery ')+c.name} title={say('移入回收区','Move to recovery')} onClick={()=>onTrash(c.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button>),say('尚未保存本地 WDF','No local WDF saved yet'))}
  {group(say('最近关闭','Recently closed'),closed,c=>row(c,say('重新打开，保留关闭前的内容','Reopen with latest cached content'),()=>onReopen(c)),say('没有最近关闭的画布','No recently closed canvases'))}
  {group(say('回收区','Recovery'),trash,c=>row(c,say('恢复到独立存档，不覆盖其他画布','Restore separately without overwriting canvases'),()=>onRestore(c.token),c.deletedAt?say(' · 移入于 ',' · Removed ')+time(c.deletedAt):''),say('回收区为空','Recovery is empty'))}
 </div>;
}
