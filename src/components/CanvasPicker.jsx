import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {pickerChoices} from '../canvas/picker.mjs';
import './canvas-picker.css';

function PickerActions({item,menu,groups,onClose,onSearch,onView,onRename,onStar,onDuplicate,onTrash,onMove,say}) {
  const ref=useRef(null),[pending,setPending]=useState(false);
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    const rect=el.getBoundingClientRect();el.style.top=`${Math.max(8,Math.min(menu.y,window.innerHeight-rect.height-8))}px`;
    el.querySelector('button')?.focus();
  },[menu.view]);
  const run=async action=>{if(pending)return;setPending(true);try{if(await action()!==false)onClose();}finally{setPending(false);}};
  return createPortal(<div className="picker-actions-scrim" onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget)onClose();}}>
    <div ref={ref} className="picker-context-menu" role="menu" aria-label={say('画布操作 ','Canvas actions ')+item.name} style={{left:menu.x,top:menu.y}} onKeyDown={event=>{
      event.stopPropagation();
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();onSearch();return;}
      if(event.key==='Escape'){event.preventDefault();if(menu.view==='groups')onView('actions');else onClose();}
      const buttons=[...ref.current.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
      if(event.key==='Tab'){event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}
    }}>
      {menu.view==='groups'?<>
        <button role="menuitem" onClick={()=>onView('actions')}>‹ {say('返回','Back')}</button>
        <div className="picker-menu-rule"/>
        <button role="menuitem" disabled={pending} onClick={()=>run(()=>onMove([item.id],''))}>{say('未分组','Ungrouped')}{!item.groupId&&<span aria-hidden="true">✓</span>}</button>
        {groups.map(group=><button key={group.id} role="menuitem" disabled={pending} onClick={()=>run(()=>onMove([item.id],group.id))}>{group.name}{item.groupId===group.id&&<span aria-hidden="true">✓</span>}</button>)}
      </>:<>
        <button role="menuitem" onClick={onRename}>{say('重命名','Rename')}<kbd aria-hidden="true">F2</kbd></button>
        <button role="menuitem" disabled={pending} onClick={()=>run(()=>onStar(item.id))}>{item.starred?say('取消收藏','Unstar'):say('收藏','Star')}</button>
        <button role="menuitem" disabled={pending} onClick={()=>run(()=>onDuplicate(item.id))}>{say('复制画布','Duplicate canvas')}</button>
        <button role="menuitem" onClick={()=>onView('groups')}>{say('移动到分组','Move to group')}<span aria-hidden="true">›</span></button>
        <div className="picker-menu-rule"/>
        <button role="menuitem" className="picker-menu-danger" disabled={pending} onClick={()=>run(()=>onTrash([item.id]))}>{say('移入回收站','Move to trash')}</button>
      </>}
    </div>
  </div>,document.body);
}

export function CanvasPicker({items,meta,activeId,onOpen,onClose,onCreate,onManage,onRename,onStar,onDuplicate,onMove,onTrash,say}) {
  const [query,setQuery]=useState(''),[index,setIndex]=useState(0),[menu,setMenu]=useState(null),[editing,setEditing]=useState(null),[name,setName]=useState(''),[opening,setOpening]=useState(false);
  const root=useRef(null),input=useRef(null),trigger=useRef(null);
  const choices=useMemo(()=>pickerChoices(items,query),[items,query]);
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
    trigger.current=event.currentTarget.matches('button')?event.currentTarget:event.currentTarget.querySelector('.picker-row-actions');
    const rect=event.currentTarget.getBoundingClientRect();
    setMenu({id:item.id,view:'actions',x:Math.max(8,Math.min(rect.right-190,window.innerWidth-202)),y:Math.max(8,Math.min(rect.bottom+4,window.innerHeight-220))});
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
