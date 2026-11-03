import React,{useEffect,useRef} from 'react';
import '../components/settings/settings.css';
import '../components/polish.css';

// Chords are written "A + B"; "A / B" lists alternatives.  Known key names are
// drawn as key caps, anything else (mouse gestures) stays plain text.
const KEY=/^(shift|alt|ctrl|⌘|enter|tab|esc|f2|i|z|s|\?|space|空格)$/i;
function Keys({value}) {
 return <span className="help-keys">{value.split(' + ').map((part,index)=><React.Fragment key={index}>
  {index>0&&<i aria-hidden="true">+</i>}
  {part.split(' / ').map((alt,altIndex)=><React.Fragment key={altIndex}>
   {altIndex>0&&<i aria-hidden="true">/</i>}
   {KEY.test(alt.trim())?<kbd>{alt.trim()}</kbd>:<span className="gesture">{alt}</span>}
  </React.Fragment>)}
 </React.Fragment>)}</span>;
}

export function ShortcutHelp({quick,say,hints,onToggleHints,onClose}) {
 const ref=useRef(null);
 useEffect(()=>{const previous=document.activeElement;ref.current?.querySelector('button')?.focus();return()=>previous?.isConnected&&previous.focus?.({preventScroll:true});},[]);
 const groups=[
  [say('画布','Canvas'),[
   [say('双击空白','Double-click blank canvas'),say(quick?'新建想法':'创建新起点',quick?'New idea':'New starting point')],
   [say('空格 + 拖动 / 中键','Space + drag / Middle button'),say('平移画布','Pan canvas')],
   ['Ctrl / ⌘ + S',say('保存本地 WDF','Save local WDF')],
   ['I',say('打开 / 关闭卡片详情','Toggle card details')],
   ['Ctrl / ⌘ + Z',say('撤销','Undo')],['Ctrl / ⌘ + Shift + Z',say('重做','Redo')],
  ]],
  [say('选择与移动','Selecting and moving'),[
   [say(quick?'左键框选':'右键框选',quick?'Left-drag marquee':'Right-drag marquee'),say('接触卡片即选中','Select intersecting cards')],
   ['Shift + '+say('点击卡片','click card'),say('切换多选','Toggle card selection')],
   ['Shift + '+say('框选','marquee'),say('追加选择','Add to selection')],
   ['Alt + '+say('框选','marquee'),say('减去选择','Subtract selection')],
   ['Alt + '+say('拖动卡片','drag card'),say('一起移动子树','Move the subtree')],
   ...(quick?[[say('方向键','Arrow keys'),say('选择相邻想法','Select nearby idea')]]:[]),
  ]],
  ...(quick?[[say('快速思维','Quick thinking'),[
   [say('右键从卡片拖动','Right-drag from card'),say('连接母子节点，拖到空白新建子想法','Connect parent/child; drop on blank to create child')],
   [say('右键划过空白','Right-drag on blank'),say('划动切除想法或连线','Slice ideas or links')],
   ['Enter',say('完成编辑 / 新建同级想法','Finish editing / New sibling idea')],
   ['Ctrl / ⌘ + Enter',say('完成并新建同级想法','Finish and create sibling')],
   ['Tab',say('完成并新建子想法','Finish and create child')],
   ['F2',say('编辑选中想法','Edit selected idea')],
  ]]]:[]),
  [say('编辑与面板','Editing and panels'),[
   ['Shift + Enter',say('编辑时换行','New line while editing')],
   ['Esc',say('取消当前编辑或关闭面板','Cancel editing or close panel')],
   ['?',say('打开快捷键帮助','Keyboard shortcuts')],
  ]],
 ];
 return <div className="sx-backdrop sx-help-backdrop" onPointerDown={e=>e.stopPropagation()} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section ref={ref} className="sx sx-help" role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){const items=[...ref.current.querySelectorAll('button,input')];const at=items.indexOf(document.activeElement);e.preventDefault();items[(at+(e.shiftKey?-1:1)+items.length)%items.length]?.focus();}}}>
   <header><h2 id="shortcut-help-title">{say('快捷键帮助','Keyboard shortcuts')}</h2><button className="help-close" onClick={onClose} aria-label={say('关闭快捷键帮助','Close shortcuts')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
   <div className="help-scroll">
    {groups.map(([title,rows],index)=><section key={title} className="help-group" style={{'--d':`${index*60}ms`}}>
     <h3>{title}</h3>
     <dl>{rows.map(([keys,value])=><div key={keys+value}><dt><Keys value={keys}/></dt><dd>{value}</dd></div>)}</dl>
    </section>)}
   </div>
   <label className="help-toggle"><input type="checkbox" checked={hints} onChange={onToggleHints}/><i aria-hidden="true"/>{say('显示编辑快捷键提示','Show editor shortcut hints')}</label>
  </section>
 </div>;
}
