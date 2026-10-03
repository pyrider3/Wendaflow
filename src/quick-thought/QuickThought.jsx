import React, {useLayoutEffect,useRef} from 'react';
import './quick-thought.css';
export {quickThoughtCopy} from './labels.js';
export function ThoughtEditor({editor,node,labels,onChange,onDone,onCancel}) {
  const inputRef=useRef(null);
  useLayoutEffect(()=>{const el=inputRef.current;if(el){el.style.height='0px';el.style.height=`${Math.max(42,el.scrollHeight)}px`;}},[editor.value]);
  return <div className="quick-thought-editor" style={{left:node.x,top:node.y,width:Math.max(224,node.manualWidth||224)}}
    onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}}>
    <textarea ref={inputRef} autoFocus aria-label={labels.edit} placeholder={labels.newIdea} value={editor.value} onChange={e=>onChange(e.target.value)} onBlur={onDone} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onCancel();}if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();onDone();}}}/>
  </div>;
}
