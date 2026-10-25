import React, {useLayoutEffect,useRef} from 'react';
import './quick-thought.css';
export {quickThoughtCopy} from './labels.js';
export function ThoughtEditor({editor,node,labels,onChange,onDone,onCancel,hints,say}) {
  const inputRef=useRef(null);
  const measureRef=useRef(null);
  const previousSize=useRef(null);
  const sizeAnimation=useRef(null);
  useLayoutEffect(()=>{
    const el=inputRef.current, measure=measureRef.current;
    if(el && measure){
      const box=el.parentElement;
      const before=previousSize.current ? {width:box.offsetWidth,height:box.offsetHeight} : null;
      sizeAnimation.current?.cancel();
      el.style.width=`${Math.max(24,measure.offsetWidth + 2)}px`;
      el.style.height='0px';
      el.style.height=`${Math.max(24,el.scrollHeight)}px`;
      const after={width:box.offsetWidth,height:box.offsetHeight};
      previousSize.current=after;
      if(before && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && (before.width!==after.width || before.height!==after.height)) {
        sizeAnimation.current=box.animate([{width:`${before.width}px`,height:`${before.height}px`},{width:`${after.width}px`,height:`${after.height}px`}],{duration:110,easing:'cubic-bezier(.16,1,.3,1)'});
      }
    }
  },[editor.value, labels.newIdea]);
  return <div className="quick-thought-editor" style={{left:node.x,top:node.y}}
    onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}}>
    <span ref={measureRef} className="quick-thought-measure" aria-hidden="true">{(editor.value || labels.newIdea) + "\u200b"}</span>
    <textarea ref={inputRef} autoFocus aria-label={labels.edit} placeholder={labels.newIdea} value={editor.value} onChange={e=>onChange(e.target.value)} onBlur={()=>onDone()} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&['s','k'].includes(e.key.toLowerCase()))return;e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onCancel();}if(e.key==='Tab'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();onDone('child');}if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();onDone(e.ctrlKey||e.metaKey?'sibling':undefined);}}}/>
    {hints && <small className="quick-edit-hint" aria-hidden="true">{say('Enter 完成 · Shift+Enter 换行 · Tab 子想法 · Esc 取消','Enter done · Shift+Enter new line · Tab child · Esc cancel')}</small>}
  </div>;
}
