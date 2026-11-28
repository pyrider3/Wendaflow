import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {pickerChoices} from '../canvas/picker.mjs';
import {ContextMenu} from './ContextMenu.jsx';
import './canvas-picker.css';

function PickerActions({item,menu,groups,onClose,onSearch,onView,onRename,onStar,onDuplicate,onTrash,onMove,say}) {
  const [pending,setPending]=useState(false);
  const run=async action=>{if(pending)return;setPending(true);try{if(await action()!==false)onClose();}finally{setPending(false);}};
  const sections=menu.view==='groups'
    ? [
        [
          { id: 'back', icon: 'back', label: say('返回','Back'), shortcut: 'Esc', keepOpen: true, onSelect: () => onView('actions') },
        ],
        [
          { id: 'ungrouped', role: 'menuitemradio', groupLabel: say('移动到分组','Move to group'), label: say('未分组','Ungrouped'), checked: !item.groupId, disabled: pending, onSelect: () => void run(() => onMove([item.id], '')) },
          ...groups.map((group) => ({
            id: `grp-${group.id}`,
            role: 'menuitemradio',
            groupLabel: say('移动到分组','Move to group'),
            label: group.name,
            checked: item.groupId === group.id,
            disabled: pending,
            onSelect: () => void run(() => onMove([item.id], group.id)),
          })),
        ],
      ]
    : [
        [
          { id: 'rename', icon: 'edit', label: say('重命名','Rename'), shortcut: 'F2', onSelect: onRename },
          { id: 'star', icon: item.starred ? 'starFilled' : 'star', label: item.starred ? say('取消收藏','Unstar') : say('收藏','Star'), accent: Boolean(item.starred), disabled: pending, onSelect: () => void run(() => onStar(item.id)) },
          { id: 'duplicate', icon: 'copy', label: say('复制画布','Duplicate canvas'), disabled: pending, onSelect: () => void run(() => onDuplicate(item.id)) },
          { id: 'move', icon: 'folder', label: say('移动到分组','Move to group'), submenuArrow: true, keepOpen: true, onSelect: () => onView('groups') },
        ],
        [
          { id: 'trash', icon: 'trash', label: say('移入回收站','Move to trash'), danger: true, disabled: pending, onSelect: () => void run(() => onTrash([item.id])) },
        ],
      ];

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      openKey={`picker:${item.id}:${menu.x}:${menu.y}:${menu.openedAt || 0}`}
      className="picker-context-menu"
      ariaLabel={say('画布操作 ','Canvas actions ') + item.name}
      header={menu.view === 'groups'
        ? { badgeTone: 'canvas', title: say('移动到分组', 'Move to group'), subtitle: item.name }
        : { badgeTone: 'canvas', title: item.name }}
      sections={sections}
      focusFirstOnOpen
      onKeyDownExtra={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
          event.preventDefault();
          event.stopPropagation();
          onSearch();
          return true;
        }
        if (event.key === 'Escape' && menu.view === 'groups') {
          event.preventDefault();
          event.stopPropagation();
          onView('actions');
          return true;
        }
        return false;
      }}
      onClose={onClose}
    />
  );
}

export function CanvasPicker({items,meta,activeId,onOpen,onClose,onCreate,onManage,onRename,onStar,onDuplicate,onMove,onTrash,say}) {
  const [query,setQuery]=useState(''),[index,setIndex]=useState(0),[menu,setMenu]=useState(null),[editing,setEditing]=useState(null),[name,setName]=useState(''),[opening,setOpening]=useState(false);
  const root=useRef(null),input=useRef(null),trigger=useRef(null);
  // Recent canvases are not capped at a handful: the list scrolls.
  const choices=useMemo(()=>pickerChoices(items,query,200),[items,query]);
  const current=choices[Math.min(index,Math.max(0,choices.length-1))];
  const menuItem=menu&&items.find(item=>item.id===menu.id&&!item.trashedAt);
  useLayoutEffect(()=>{
    document.querySelectorAll('.manager-exit-shell,.canvas-picker-exit').forEach(el=>el.remove());
    const previous=document.activeElement,el=root.current;input.current?.focus();
    return()=>{
      if(previous?.isConnected)previous.focus({preventScroll:true});
      if(!el||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const rect=el.getBoundingClientRect(),appearance=getComputedStyle(el),copy=el.cloneNode(true);
      copy.classList.add('canvas-picker-exit');copy.setAttribute('aria-hidden','true');copy.inert=true;
      Object.assign(copy.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',animation:'none',pointerEvents:'none',zIndex:'120'});
      document.body.appendChild(copy);
      copy.animate([{opacity:appearance.opacity,transform:appearance.transform},{opacity:0,transform:'translateX(-6px) scale(.985)'}],{duration:90,easing:'ease-in'}).finished.then(()=>copy.remove(),()=>copy.remove());
    };
  },[]);
  useEffect(()=>setIndex(0),[query]);
  useEffect(()=>setIndex(value=>Math.min(value,Math.max(0,choices.length-1))),[choices.length]);
  useEffect(()=>{root.current?.querySelector('.picker-row.is-highlighted')?.scrollIntoView({block:'nearest'});},[index,query]);
  useEffect(()=>{if(menu&&!menuItem)setMenu(null);},[menuItem,menu]);
  const open=async item=>{if(!item||opening)return;setOpening(true);try{await onOpen(item.id);}finally{setOpening(false);}};
  const closeMenu=()=>{setMenu(null);requestAnimationFrame(()=>{if(trigger.current?.isConnected)trigger.current.focus();else input.current?.focus();});};
  const rename=item=>{setMenu(null);setEditing(item.id);setName(item.name);};
  const showMenu=(event,item)=>{
    event.preventDefault();event.stopPropagation();
    const isButton=event.currentTarget.matches('button');
    trigger.current=isButton?event.currentTarget:event.currentTarget.querySelector('.picker-row-actions');
    const rect=event.currentTarget.getBoundingClientRect();
    const x=isButton?rect.right:event.clientX;
    const y=isButton?rect.bottom+4:event.clientY;
    setMenu({id:item.id,view:'actions',x,y,openedAt:Date.now()});
  };
  return <div className="canvas-picker-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={root} className="canvas-picker" role="dialog" aria-modal="true" aria-label={say('切换画布','Choose canvas')} onKeyDown={event=>{
      if(event.defaultPrevented||menu)return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopPropagation();setEditing(null);input.current?.focus();return;}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(editing)setEditing(null);else if(query)setQuery('');else onClose();return;}
      if(editing&&event.key!=='Tab')return;
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();setIndex(value=>(value+(event.key==='ArrowDown'?1:-1)+Math.max(1,choices.length))%Math.max(1,choices.length));input.current?.focus();}
      if(event.key==='Enter'&&event.target===input.current){event.preventDefault();void open(current);}
      if(event.key==='F2'&&current){event.preventDefault();rename(current);}
      if(event.key==='Tab'){const buttons=[...root.current.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.getClientRects().length),first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    }}>
      <header className="picker-search-row">
        <label className="picker-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="m12.5 12.5 4 4"/></svg><input ref={input} aria-label={say('搜索画布','Search canvases')} placeholder={say('搜索画布…','Search canvases…')} value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button className="picker-clear" aria-label={say('清空搜索','Clear search')} onClick={()=>{setQuery('');input.current?.focus();}}>×</button>}</label>
        <button className="picker-create" aria-label={say('新建画布','New canvas')} title={say('新建画布','New canvas')} onClick={onCreate}>＋</button>
      </header>
      <div className="picker-section-label">{query?say('搜索结果','Results'):say('最近使用','Recent')}</div>
      <div className="picker-list" role="list" aria-label={say('画布列表','Canvases')}>
        {choices.map((item,i)=><div key={item.id} role="listitem" className={`picker-row ${i===Math.min(index,choices.length-1)?'is-highlighted':''}`} data-canvas-id={item.id} onPointerMove={()=>{if(!editing&&!menu)setIndex(i);}} onContextMenu={event=>showMenu(event,item)}>
          {editing===item.id?<form className="picker-rename" onSubmit={event=>{event.preventDefault();if(name.trim()&&onRename(item.id,name)!==false){setEditing(null);input.current?.focus();}}}>
            <input autoFocus aria-label={say('画布名称','Canvas name')} value={name} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key!=='Tab')event.stopPropagation();if(event.key==='Escape'){event.preventDefault();setEditing(null);input.current?.focus();}}}/><button type="submit" aria-label={say('保存名称','Save name')}>✓</button>
          </form>:<>
            <button className="picker-row-open" aria-label={say('打开画布 ','Open canvas ')+item.name} aria-current={item.id===activeId?'page':undefined} disabled={opening} title={item.name} onFocus={()=>setIndex(i)} onClick={()=>void open(item)}>
              <span className="picker-current" aria-hidden="true">{item.id===activeId?'✓':''}</span><span className="picker-row-name">{item.name}</span>{item.starred&&<span className="picker-favorite" aria-label={say('已收藏','Starred')}>★</span>}
            </button>
            <button className={`picker-row-actions ${menu?.id===item.id?'is-visible':''}`} aria-label={say('画布操作 ','Canvas actions ')+item.name} aria-haspopup="menu" aria-expanded={menu?.id===item.id} onFocus={()=>setIndex(i)} onClick={event=>showMenu(event,item)}>···</button>
          </>}
        </div>)}
        {!choices.length&&<div className="picker-empty">{query?say('没有匹配的画布','No matching canvases'):say('还没有画布','No canvases yet')}</div>}
      </div>
      <footer><button className="picker-manage" onClick={onManage}><span>{say('管理画布','Manage canvases')}</span><span aria-hidden="true">→</span></button></footer>
      {menuItem&&<PickerActions item={menuItem} menu={menu} groups={meta.groups} onView={view=>setMenu(value=>({...value,view}))} onClose={closeMenu} onSearch={()=>{setMenu(null);input.current?.focus();}} onRename={()=>rename(menuItem)} onStar={onStar} onDuplicate={onDuplicate} onTrash={onTrash} onMove={onMove} say={say}/>}
    </section>
  </div>;
}
