import React from "react";

// Actions under storyboard cards. Rendered only while the comic plugin is on;
// with it off the cards still show their text and images, just no buttons.
export function ComicCardBar({ node, actions, tr, stopPointer }) {
  return (
    <div
      className="comic-bar"
      onPointerDown={stopPointer}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {node.comic.role === "panel" && node.comic.status === "running" ? (
        <div className="generation-progress streaming">
          <i />
          {node.comic.phase || tr("ComfyUI 正在出图…", "ComfyUI is drawing…")}
        </div>
      ) : node.comic.role === "panel" ? (
        <button
          onClick={(event) => {
            event.stopPropagation();
            actions.generateComicPanel?.(node);
          }}
        >
          {node.attachments?.some((item) => item.comfy)
            ? tr("重新出图", "Redraw")
            : tr("生成画面", "Generate image")}
        </button>
      ) : (
        <>
          <button
            onClick={(event) => {
              event.stopPropagation();
              actions.generateComicSeries?.(node);
            }}
          >
            {tr("逐张出图", "Draw all panels")}
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              actions.exportComicStrip?.(node);
            }}
          >
            {tr("导出长图", "Export long image")}
          </button>
        </>
      )}
      {node.comic.status === "error" && node.comic.error && (
        <small className="comic-error">{node.comic.error}</small>
      )}
    </div>
  );
}
