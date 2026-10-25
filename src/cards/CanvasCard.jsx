import React, {memo} from 'react';
import {CardContent} from './CardContent.jsx';
import {sameCardProps} from '../canvas/visibility.mjs';

// All visual dependencies are explicit. Event dispatch uses the latest parent
// commit, so memoized cards never retain old selection, mode or editor state.
export const CanvasCard=memo(function CanvasCard({node,runtime,renderData,uiLanguage,showThinking,tabIndex,className,style,view}){
  return <article tabIndex={tabIndex} aria-label={view.displayTitle}
    data-node-id={node.id} data-node-x={node.x} data-node-y={node.y}
    className={className} style={style}
    onPointerDown={event=>runtime.current.pointerDown(event,node)}
    onClick={event=>runtime.current.click(event)}
    onDoubleClick={event=>runtime.current.doubleClick(event,node)}
    onContextMenu={event=>runtime.current.contextMenu(event,node)}>
    <CardContent node={node} view={view} actions={renderData.actions}
      helpers={{...renderData.helpers,shouldShowNodeThinking:()=>showThinking}}
      copy={renderData.copy} tr={renderData.tr} systemText={renderData.systemText} uiLanguage={uiLanguage}/>
  </article>;
},sameCardProps);
