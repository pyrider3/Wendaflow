import React, { memo, useEffect, useRef, useState } from "react";
import {
  DEFAULT_GROUP_HEIGHT,
  DEFAULT_GROUP_WIDTH,
  collapsedGroupRect,
} from "../canvas/groups.mjs";

const GROUP_COLOR_ACCENTS = {
  "#edf7f1": "#36a674",
  "#fff4dc": "#dfa02e",
  "#fff0f0": "#e06270",
  "#eef6ff": "#448ef7",
  "#f5efff": "#956ef0",
};

export function groupAccentColor(color) {
  if (!color) return "";
  return GROUP_COLOR_ACCENTS[String(color).toLowerCase()] || color;
}

export function normalizeGroupSwatch(entry) {
  if (Array.isArray(entry)) return { id: entry[0] || "default", value: entry[2] || "" };
  return { id: entry?.id || entry?.value || "default", value: entry?.value || "" };
}

function resizeHandles(tr) {
  return [
    ["nw", tr("左上角缩放", "Resize from top-left")],
    ["n", tr("上边缘缩放", "Resize from top edge")],
    ["ne", tr("右上角缩放", "Resize from top-right")],
    ["e", tr("右边缘缩放", "Resize from right edge")],
    ["se", tr("右下角缩放", "Resize from bottom-right")],
    ["s", tr("下边缘缩放", "Resize from bottom edge")],
    ["sw", tr("左下角缩放", "Resize from bottom-left")],
    ["w", tr("左边缘缩放", "Resize from left edge")],
  ];
}

function borderStyleLabel(style, tr) {
  if (style === "dashed") return tr("虚线边框", "Dashed border");
  if (style === "none") return tr("无边框", "No border");
  return tr("实线边框", "Solid border");
}

function BorderStyleIcon({ style }) {
  if (style === "dashed") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" strokeDasharray="3 2" />
      </svg>
    );
  }
  if (style === "none") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" strokeDasharray="1.5 2.5" opacity="0.45" />
        <path d="M3 13 13 3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
    </svg>
  );
}

function GroupMiniToolbar({
  node,
  cardCount,
  colors,
  colorLabel,
  onRecolor,
  onToggleCollapse,
  onToggleLock,
  onToggleAutoFit,
  onCycleBorderStyle,
  onFit,
  onSelectInside,
  onRename,
  onUngroup,
  tr,
}) {
  const barRef = useRef(null);
  const collapsed = Boolean(node.collapsed);
  const locked = Boolean(node.locked);
  const autoFit = Boolean(node.autoFit);
  const borderStyle = node.borderStyle || "solid";

  // Roving-tabindex fallback only when native focusgroup is unsupported.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || "focusGroup" in HTMLElement.prototype) return undefined;
    const buttons = () => [...bar.querySelectorAll('button:not([disabled])')];
    const items = buttons();
    items.forEach((btn, idx) => { btn.tabIndex = idx === 0 ? 0 : -1; });
    const onFocusIn = ({ target }) => {
      const list = buttons();
      if (!list.includes(target)) return;
      list.forEach((btn) => { btn.tabIndex = btn === target ? 0 : -1; });
    };
    const onKeyDown = (event) => {
      const list = buttons();
      const idx = list.indexOf(document.activeElement);
      if (idx < 0 || !list.length) return;
      const rtl = getComputedStyle(bar).direction === "rtl";
      let next = -1;
      if (event.key === "ArrowRight") next = (idx + (rtl ? -1 : 1) + list.length) % list.length;
      else if (event.key === "ArrowLeft") next = (idx + (rtl ? 1 : -1) + list.length) % list.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = list.length - 1;
      if (next < 0) return;
      event.preventDefault();
      event.stopPropagation();
      list[next]?.focus();
    };
    bar.addEventListener("focusin", onFocusIn);
    bar.addEventListener("keydown", onKeyDown);
    return () => {
      bar.removeEventListener("focusin", onFocusIn);
      bar.removeEventListener("keydown", onKeyDown);
    };
  }, [colors.length]);

  const borderTitle = `${tr("切换边框样式", "Cycle border style")} · ${borderStyleLabel(borderStyle, tr)}`;

  return (
    <div
      ref={barRef}
      className="group-toolbar"
      role="toolbar"
      aria-label={tr("分组框操作", "Group frame actions")}
      {...{ focusgroup: "toolbar wrap" }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="group-toolbar-colors" role="group" aria-label={tr("分组框颜色", "Group frame color")}>
        {colors.slice(0, 6).map((item) => {
          const { id, value } = normalizeGroupSwatch(item);
          const active = (node.color || "") === value;
          const label = colorLabel(id);
          const swatch = groupAccentColor(value);
          return (
            <button
              key={id}
              type="button"
              className={`group-swatch ${value ? "" : "plain"}`}
              aria-label={label}
              title={label}
              aria-pressed={active}
              style={swatch ? { "--swatch": swatch } : undefined}
              onClick={() => onRecolor(node.id, value)}
            />
          );
        })}
      </div>
      <span className="group-toolbar-sep" role="separator" aria-orientation="vertical" />
      <div className="group-toolbar-actions" role="group" aria-label={tr("分组状态", "Group modes")}>
        <button
          type="button"
          className="group-tool-btn"
          aria-label={tr("折叠分组", "Collapse group")}
          title={tr("折叠分组", "Collapse group")}
          aria-pressed={collapsed}
          onClick={() => onToggleCollapse(node.id)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {collapsed
              ? <path d="M5.5 3.5h5v3h-5ZM3 9.5h10v3.5H3ZM8 6.5v3" />
              : <path d="M3 3.5h10v9H3ZM5.5 7.5h5" />}
          </svg>
        </button>
        <button
          type="button"
          className="group-tool-btn"
          aria-label={tr("锁定分组", "Lock group")}
          title={tr("锁定分组", "Lock group")}
          aria-pressed={locked}
          onClick={() => onToggleLock(node.id)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {locked
              ? <><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>
              : <><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 4.6-1.3" /></>}
          </svg>
        </button>
        <button
          type="button"
          className="group-tool-btn"
          aria-label={tr("自动贴合内部卡片", "Auto-fit to cards")}
          title={tr("自动贴合内部卡片", "Auto-fit to cards")}
          aria-pressed={autoFit}
          onClick={() => onToggleAutoFit(node.id)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 5.5V2.5h3M13.5 5.5V2.5h-3M2.5 10.5v3h3M13.5 10.5v3h-3M5.5 8h5M8 5.5v5" />
          </svg>
        </button>
        <button
          type="button"
          className="group-tool-btn"
          aria-label={tr("切换边框样式", "Cycle border style")}
          title={borderTitle}
          onClick={() => onCycleBorderStyle(node.id)}
        >
          <BorderStyleIcon style={borderStyle} />
        </button>
      </div>
      <span className="group-toolbar-sep" role="separator" aria-orientation="vertical" />
      <div className="group-toolbar-actions" role="group" aria-label={tr("分组操作", "Group controls")}>
        <button
          type="button"
          className="group-tool-btn"
          aria-label={tr("适配内部卡片", "Fit to contained cards")}
          title={tr("适配内部卡片", "Fit to contained cards")}
          aria-disabled={cardCount === 0 || collapsed ? "true" : undefined}
          onClick={() => { if (cardCount > 0 && !collapsed) onFit(node.id); }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10M6 6h4v4H6Z" />
          </svg>
        </button>
        <button
          type="button"
          className="group-tool-btn"
          aria-label={tr("选中内部卡片", "Select contained cards")}
          title={tr("选中内部卡片", "Select contained cards")}
          aria-disabled={cardCount === 0 || collapsed ? "true" : undefined}
          onClick={() => { if (cardCount > 0 && !collapsed) onSelectInside(node.id); }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 4.5h4v3H3ZM9 4.5h4v3H9ZM3 9.5h4v3H3ZM9 11h4M11 9v4" />
          </svg>
        </button>
        <button
          type="button"
          className="group-tool-btn"
          aria-label={tr("重命名分组", "Rename group")}
          title={tr("重命名分组", "Rename group")}
          onClick={() => onRename(node)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M11.2 2.8a1.5 1.5 0 0 1 2.1 2.1l-7.2 7.2-3 .8.8-3 7.3-7.1Z" />
          </svg>
        </button>
        <button
          type="button"
          className="group-tool-btn danger"
          aria-label={tr("解散分组框（保留卡片）", "Ungroup (keep cards)")}
          title={tr("解散分组框（保留卡片）", "Ungroup (keep cards)")}
          onClick={() => onUngroup(node.id)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export const GroupFrame = memo(function GroupFrame({
  node,
  selected,
  soleSelected,
  dragging,
  resizing,
  muted,
  newborn,
  deleting,
  editing,
  bigTitle,
  cardCount,
  colors,
  colorLabel,
  onDragStart,
  onResizeStart,
  onContextMenu,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRecolor,
  onToggleCollapse,
  onToggleLock,
  onToggleAutoFit,
  onCycleBorderStyle,
  onZoomToGroup,
  onFit,
  onSelectInside,
  onUngroup,
  tr,
}) {
  const [draftTitle, setDraftTitle] = useState(node.title || "");
  const inputRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    cancelledRef.current = false;
    setDraftTitle(node.title || "");
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [editing, node.id]);

  const collapsed = Boolean(node.collapsed);
  const locked = Boolean(node.locked);
  const autoFit = Boolean(node.autoFit);
  const borderStyle = node.borderStyle || "solid";
  const fillMode = node.fillMode || "full";
  const showBigTitle = Boolean(bigTitle && !collapsed && !editing);
  const collapsedRect = collapsed ? collapsedGroupRect(node) : null;
  const visualX = collapsedRect ? collapsedRect.x : node.x;
  const visualY = collapsedRect ? collapsedRect.y : node.y;
  const width = collapsedRect ? collapsedRect.width : (node.manualWidth || DEFAULT_GROUP_WIDTH);
  const height = collapsedRect ? collapsedRect.height : (node.manualHeight || DEFAULT_GROUP_HEIGHT);
  const displayTitle = node.title || tr("未命名分组", "Untitled group");

  const commit = () => {
    if (cancelledRef.current) return;
    onCommitRename(node.id, draftTitle);
  };

  const handleTitleKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      cancelledRef.current = true;
      onCancelRename();
      return;
    }
    if (event.key === "Enter") {
      // IME-safe enter-to-submit: never commit while composing CJK/IME text.
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      commit();
    }
  };

  const startMove = (event) => {
    if (editing) return;
    onDragStart(event, node);
  };

  const handleHeaderDoubleClick = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (collapsed) onToggleCollapse(node.id);
    else onStartRename(node);
  };

  const surfaceInteractive = collapsed || locked;

  return (
    <section
      data-node-id={node.id}
      data-node-x={visualX}
      data-node-y={visualY}
      data-node-type="group"
      data-group-border={borderStyle}
      data-group-fill={fillMode}
      data-group-collapsed={collapsed ? "true" : undefined}
      data-group-locked={locked ? "true" : undefined}
      data-group-autofit={autoFit ? "true" : undefined}
      data-group-big-title={showBigTitle ? "true" : undefined}
      aria-label={displayTitle}
      className={`node group group-border-${borderStyle} group-fill-${fillMode} ${node.color ? "group-colored" : ""} ${collapsed ? "group-collapsed" : ""} ${locked ? "group-locked" : ""} ${showBigTitle ? "group-big-title" : ""} ${selected ? "selected" : ""} ${dragging ? "dragging" : ""} ${resizing ? "resizing" : ""} ${muted ? "muted" : ""} ${newborn ? "newborn" : ""} ${deleting ? "deleting" : ""} ${editing ? "group-editing" : ""}`}
      style={{
        transform: `translate(${visualX}px, ${visualY}px)`,
        width: `${width}px`,
        height: `${height}px`,
        ...(node.color ? { "--group-tint": groupAccentColor(node.color) } : {}),
      }}
      onPointerDown={surfaceInteractive ? startMove : undefined}
      onClick={surfaceInteractive ? (event) => event.stopPropagation() : undefined}
      onDoubleClick={collapsed ? handleHeaderDoubleClick : undefined}
      onContextMenu={surfaceInteractive ? (event) => onContextMenu(event, node) : undefined}
    >
      {/* Project Graph dashed expanded-area preview while a collapsed section is selected */}
      {collapsed && selected && collapsedRect && (
        <div
          className="group-expanded-preview"
          aria-hidden="true"
          style={{
            left: `${collapsedRect.expanded.x - visualX}px`,
            top: `${collapsedRect.expanded.y - visualY}px`,
            width: `${collapsedRect.expanded.width}px`,
            height: `${collapsedRect.expanded.height}px`,
          }}
        />
      )}

      {/* Project Graph top-right corner lock accent when selected */}
      {locked && selected && !collapsed && (
        <span className="group-lock-corner" aria-hidden="true" />
      )}

      {/* Border drag hit bands so dragging any edge moves the group while keeping open interior click-through */}
      {!collapsed && !locked && (
        <>
          <div className="group-edge e-left" onPointerDown={startMove} onContextMenu={(event) => onContextMenu(event, node)} aria-hidden="true" />
          <div className="group-edge e-right" onPointerDown={startMove} onContextMenu={(event) => onContextMenu(event, node)} aria-hidden="true" />
          <div className="group-edge e-bottom" onPointerDown={startMove} onContextMenu={(event) => onContextMenu(event, node)} aria-hidden="true" />
        </>
      )}

      {/* Project Graph zoom-out big covered title for bird's-eye canvas reading */}
      {showBigTitle && (
        <div
          className="group-big-cover"
          title={tr("双击放大查看此分组", "Double-click to zoom into this group")}
          onPointerDown={startMove}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onZoomToGroup?.(node);
          }}
          onContextMenu={(event) => onContextMenu(event, node)}
        >
          <span className="group-big-title-text">{displayTitle}</span>
          {cardCount > 0 && (
            <span className="group-big-count" aria-hidden="true">{cardCount}</span>
          )}
        </div>
      )}

      {!showBigTitle && (
        <header
          className="group-header"
          title={collapsed
            ? tr("拖动移动折叠分组；双击展开", "Drag to move collapsed group; double-click to expand")
            : tr("拖动移动分组及内部卡片；按住 Alt 仅移动分组框；双击重命名", "Drag to move group and cards; hold Alt to move frame only; double-click to rename")}
          onPointerDown={startMove}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={handleHeaderDoubleClick}
          onContextMenu={(event) => onContextMenu(event, node)}
        >
          <button
            type="button"
            className="group-fold-btn"
            aria-label={tr("折叠分组", "Collapse group")}
            title={tr("折叠分组", "Collapse group")}
            aria-pressed={collapsed}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse(node.id);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5.5 4 10.5 8 5.5 12" />
            </svg>
          </button>

          {editing ? (
            <input
              ref={inputRef}
              type="text"
              className="group-title-input"
              aria-label={tr("分组名称", "Group name")}
              value={draftTitle}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={commit}
            />
          ) : (
            <span className="group-title">{displayTitle}</span>
          )}

          {locked && !editing && (
            <button
              type="button"
              className="group-lock-pill"
              aria-label={tr("锁定分组", "Lock group")}
              title={tr("已锁定：点击解锁", "Locked: click to unlock")}
              aria-pressed="true"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onToggleLock(node.id);
              }}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
              </svg>
            </button>
          )}

          {cardCount > 0 && !editing && (
            <em className="group-count" aria-label={tr(`${cardCount} 张卡片`, `${cardCount} cards`)}>
              {cardCount}
            </em>
          )}
        </header>
      )}

      {soleSelected && !dragging && !resizing && !editing && (
        <GroupMiniToolbar
          node={node}
          cardCount={cardCount}
          colors={colors}
          colorLabel={colorLabel}
          onRecolor={onRecolor}
          onToggleCollapse={onToggleCollapse}
          onToggleLock={onToggleLock}
          onToggleAutoFit={onToggleAutoFit}
          onCycleBorderStyle={onCycleBorderStyle}
          onFit={onFit}
          onSelectInside={onSelectInside}
          onRename={onStartRename}
          onUngroup={onUngroup}
          tr={tr}
        />
      )}

      {!collapsed && !locked && !showBigTitle && resizeHandles(tr).map(([dir, label]) => (
        <button
          key={dir}
          type="button"
          className={`group-resize-handle h-${dir}`}
          aria-label={label}
          onPointerDown={(event) => onResizeStart(event, node, dir)}
          onClick={(event) => event.stopPropagation()}
        />
      ))}
    </section>
  );
});
