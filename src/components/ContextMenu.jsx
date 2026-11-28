import React, { useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./context-menu.css";

function MenuIcon({ name }) {
  switch (name) {
    case "branch":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="4.2" cy="3.8" r="1.6" />
          <circle cx="4.2" cy="12.2" r="1.6" />
          <circle cx="11.8" cy="6.2" r="1.6" />
          <path d="M4.2 5.4v5.2M4.2 9.2c0-2 3-1.8 6-2.8" />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M11.1 2.7a1.5 1.5 0 0 1 2.2 2.2l-7.2 7.2-3.1.8.8-3.1 7.3-7.1Z" />
        </svg>
      );
    case "inspector":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="2" />
          <path d="M9.6 2.8v10.4" />
        </svg>
      );
    case "group":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="2.2" />
          <path d="M4.5 5.4h3.5M4.8 8.2h2.6v2.6H4.8ZM9 8.2h2.4v2.6H9Z" />
        </svg>
      );
    case "subtree":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="2.2" width="12" height="11.6" rx="2.2" strokeDasharray="2.5 2" />
          <circle cx="5.2" cy="8" r="1.2" />
          <circle cx="10.6" cy="5.6" r="1.1" />
          <circle cx="10.6" cy="10.4" r="1.1" />
          <path d="M6.4 8h1.5l1.6-2M7.9 8l1.6 2" />
        </svg>
      );
    case "detach":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M9.5 3.2H4.2a1.7 1.7 0 0 0-1.7 1.7v6.2a1.7 1.7 0 0 0 1.7 1.7h5.3M7.5 8h6.2M11.3 5.5 13.8 8l-2.5 2.5" />
        </svg>
      );
    case "collapse":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2.6" y="3" width="10.8" height="10" rx="2" />
          <path d="M5.4 8h5.2" />
        </svg>
      );
    case "expand":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2.6" y="3" width="10.8" height="10" rx="2" />
          <path d="M5.4 8h5.2M8 5.4v5.2" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3.5" y="7" width="9" height="6.4" rx="1.6" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
      );
    case "unlock":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3.5" y="7" width="9" height="6.4" rx="1.6" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 4.6-1.3" />
        </svg>
      );
    case "autofit":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 5.5V2.5h3M13.5 5.5V2.5h-3M2.5 10.5v3h3M13.5 10.5v3h-3M5.6 8h4.8M8 5.6v4.8" />
        </svg>
      );
    case "border":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.4" strokeDasharray="3 2" />
        </svg>
      );
    case "fit":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 5.8V2.5h3.3M13.5 5.8V2.5h-3.3M2.5 10.2v3.3h3.3M13.5 10.2v3.3h-3.3M6 6h4v4H6Z" />
        </svg>
      );
    case "selectInside":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.8 4.2h4v3.2h-4ZM9.2 4.2h4v3.2h-4ZM2.8 9.2h4v3.2h-4ZM9.4 11h4M11.4 9v4" />
        </svg>
      );
    case "unpack":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="4" width="10" height="8.5" rx="2" />
          <path d="M5.6 7.5h4.8M5.6 10h3.2" />
        </svg>
      );
    case "ungroup":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.6 5.4V3.2h2.2M13.4 5.4V3.2h-2.2M2.6 10.6v2.2h2.2M13.4 10.6v2.2h-2.2M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m8 2.2 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" />
        </svg>
      );
    case "starFilled":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="m8 2.2 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" />
        </svg>
      );
    case "copy":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="5.4" y="5.4" width="8" height="8" rx="1.6" />
          <path d="M10.6 5.4V3.8A1.4 1.4 0 0 0 9.2 2.4H3.8a1.4 1.4 0 0 0-1.4 1.4v5.4a1.4 1.4 0 0 0 1.4 1.4h1.6" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3v10M3 8h10" />
        </svg>
      );
    case "link":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6.4 9.6 9.6 6.4M7.2 4.6l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5l-1.2 1.2M8.8 11.4l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5l1.2-1.2" />
        </svg>
      );
    case "unlink":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M7.2 4.6l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5l-1.2 1.2M8.8 11.4l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5l1.2-1.2M3 3l10 10" />
        </svg>
      );
    case "folder":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.2 4.6A1.4 1.4 0 0 1 3.6 3.2h2.7l1.3 1.4h4.8a1.4 1.4 0 0 1 1.4 1.4v5.4a1.4 1.4 0 0 1-1.4 1.4H3.6a1.4 1.4 0 0 1-1.4-1.4Z" />
        </svg>
      );
    case "back":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10.2 3.6 5.8 8l4.4 4.4" />
        </svg>
      );
    case "trash":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 4.5h10M6.2 4.5V3.1a.9.9 0 0 1 .9-.9h1.8a.9.9 0 0 1 .9.9v1.4M4.5 4.5l.6 8.2a1.3 1.3 0 0 0 1.3 1.2h3.2a1.3 1.3 0 0 0 1.3-1.2l.6-8.2" />
        </svg>
      );
    default:
      return null;
  }
}

export function clampMenuPosition(x, y, width, height, viewportWidth, viewportHeight, margin = 10) {
  const safeW = Math.max(margin * 2, viewportWidth || 1024);
  const safeH = Math.max(margin * 2, viewportHeight || 768);
  let left = x;
  let top = y;
  if (left + width > safeW - margin && x - width >= margin) {
    left = x - width;
  }
  if (top + height > safeH - margin && y - height >= margin) {
    top = y - height;
  }
  left = Math.max(margin, Math.min(left, safeW - width - margin));
  top = Math.max(margin, Math.min(top, safeH - height - margin));
  return { left: Math.round(left), top: Math.round(top) };
}

function normalizeSwatchEntry(entry) {
  if (Array.isArray(entry)) return { id: entry[0] || "default", value: entry[2] || "" };
  return { id: entry?.id || entry?.value || "default", value: entry?.value || "" };
}

export function ContextMenu({
  x,
  y,
  openKey,
  ariaLabel,
  className = "",
  header = null,
  swatches = null,
  sections = [],
  focusFirstOnOpen = false,
  onKeyDownExtra = null,
  onClose,
}) {
  const anchorRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);
  const activeRef = useRef(true);
  const closedByActionRef = useRef(false);
  const prevFocusRef = useRef(null);
  const anchorName = `--wf-ctx-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const supportsPopover = typeof HTMLElement !== "undefined" && Object.hasOwn(HTMLElement.prototype, "popover");

  useLayoutEffect(() => {
    activeRef.current = true;
    closedByActionRef.current = false;
    prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const pop = popRef.current;
    const anchor = anchorRef.current;
    if (!pop) return undefined;

    const supportsAnchor =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("position-area", "block-end");
    const supportsToggleSource =
      typeof ToggleEvent !== "undefined" && "source" in ToggleEvent.prototype;

    const applyManualPosition = () => {
      const rect = pop.getBoundingClientRect();
      const { left, top } = clampMenuPosition(
        x,
        y,
        rect.width || 240,
        rect.height || 220,
        window.innerWidth,
        window.innerHeight,
      );
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
    };

    if (supportsPopover && typeof pop.showPopover === "function") {
      if (supportsAnchor && !supportsToggleSource && anchor) {
        anchor.style.anchorName = anchorName;
        pop.style.positionAnchor = anchorName;
      } else {
        pop.style.removeProperty("position-anchor");
      }

      try {
        if (supportsAnchor && supportsToggleSource && anchor) {
          pop.showPopover({ source: anchor });
        } else {
          pop.showPopover();
        }
      } catch {
        try { pop.showPopover(); } catch {}
      }

      if (!supportsAnchor) {
        applyManualPosition();
      } else {
        // Guard against extreme edge cases where anchor positioning could still clamp partially offscreen.
        const rect = pop.getBoundingClientRect();
        if (
          rect.right > window.innerWidth - 4 ||
          rect.bottom > window.innerHeight - 4 ||
          rect.left < 4 ||
          rect.top < 4
        ) {
          pop.dataset.manualPos = "true";
          applyManualPosition();
        }
      }

      const handleToggle = (event) => {
        if (event.newState === "closed" && activeRef.current) {
          activeRef.current = false;
          if (!closedByActionRef.current && prevFocusRef.current?.isConnected) {
            prevFocusRef.current.focus({ preventScroll: true });
          }
          onClose?.();
        }
      };
      pop.addEventListener("toggle", handleToggle);

      if (focusFirstOnOpen) {
        const first = listRef.current?.querySelector('button:not(:disabled):not([aria-disabled="true"])');
        first?.focus({ preventScroll: true });
      }

      return () => {
        activeRef.current = false;
        pop.removeEventListener("toggle", handleToggle);
        try {
          if (pop.matches(":popover-open")) pop.hidePopover();
        } catch {}
      };
    }

    // Fallback when native Popover API is unavailable.
    applyManualPosition();
    if (focusFirstOnOpen) {
      const first = listRef.current?.querySelector('button:not(:disabled):not([aria-disabled="true"])');
      first?.focus({ preventScroll: true });
    }

    const onOutside = (event) => {
      if (!pop.contains(event.target)) {
        activeRef.current = false;
        onClose?.();
      }
    };
    const onEsc = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        activeRef.current = false;
        if (prevFocusRef.current?.isConnected) prevFocusRef.current.focus({ preventScroll: true });
        onClose?.();
      }
    };
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onEsc, true);
    return () => {
      activeRef.current = false;
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onEsc, true);
    };
  }, [x, y, openKey]);

  // Progressive fallback for browsers without native focusgroup="menu nomemory":
  // adds ARIA menu/menuitem roles and ArrowUp/ArrowDown/Home/End navigation only when unsupported.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const nativeFocusgroup = typeof HTMLElement !== "undefined" && "focusGroup" in HTMLElement.prototype;

    if (!nativeFocusgroup) {
      list.setAttribute("role", "menu");
      list.querySelectorAll("button:not([role])").forEach((btn) => {
        btn.setAttribute("role", "menuitem");
      });
    }

    const enabledItems = () =>
      [...list.querySelectorAll("button")]
        .filter((btn) => btn.closest("[focusgroup]") === list)
        .filter((btn) => !btn.disabled && btn.getAttribute("aria-disabled") !== "true");

    const onKeyDown = (event) => {
      if (onKeyDownExtra?.(event) === true) return;
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        dismiss(false);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss(false);
        return;
      }
      if (!nativeFocusgroup && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        const items = enabledItems();
        if (!items.length) return;
        const current = items.indexOf(document.activeElement);
        let next = 0;
        if (event.key === "Home") next = 0;
        else if (event.key === "End") next = items.length - 1;
        else if (current < 0) next = event.key === "ArrowUp" ? items.length - 1 : 0;
        else next = (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        event.preventDefault();
        event.stopPropagation();
        items[next]?.focus({ preventScroll: true });
      }
    };

    const onFocusOut = () => {
      const pop = popRef.current;
      window.requestAnimationFrame(() => {
        if (!activeRef.current || !pop) return;
        const active = document.activeElement;
        if (active && active !== document.body && !pop.contains(active)) {
          dismiss(false);
        }
      });
    };

    list.addEventListener("keydown", onKeyDown);
    popRef.current?.addEventListener("focusout", onFocusOut);
    return () => {
      list.removeEventListener("keydown", onKeyDown);
      popRef.current?.removeEventListener("focusout", onFocusOut);
    };
  }, [openKey, sections.length]);

  const dismiss = (fromAction = true) => {
    closedByActionRef.current = fromAction;
    const pop = popRef.current;
    if (supportsPopover && pop && typeof pop.hidePopover === "function") {
      try {
        if (pop.matches(":popover-open")) {
          pop.hidePopover();
          return;
        }
      } catch {}
    }
    if (activeRef.current) {
      activeRef.current = false;
      if (!fromAction && prevFocusRef.current?.isConnected) {
        prevFocusRef.current.focus({ preventScroll: true });
      }
      onClose?.();
    }
  };

  const activateItem = (item) => {
    if (item.disabled) return;
    if (item.keepOpen) {
      item.onSelect?.();
      return;
    }
    if (item.role === "menuitemcheckbox" || item.role === "menuitemradio") {
      item.onSelect?.();
      window.setTimeout(() => dismiss(true), 120);
      return;
    }
    dismiss(true);
    item.onSelect?.();
  };

  const visibleSections = sections
    .map((group) => (Array.isArray(group) ? group.filter(Boolean) : []))
    .filter((group) => group.length > 0);

  const hasCheckableInGroup = (group) =>
    group.some((item) => item.role === "menuitemcheckbox" || item.role === "menuitemradio");

  const content = (
    <>
      <span
        ref={anchorRef}
        className="wf-menu-anchor"
        aria-hidden="true"
        style={{ left: `${Math.round(x)}px`, top: `${Math.round(y)}px` }}
      />
      <div
        ref={popRef}
        popover={supportsPopover ? "auto" : undefined}
        className={`wf-context-menu canvas-context-menu sx ${className}`.trim()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {header && (
          <header className="wf-menu-head">
            <div className="wf-menu-head-main">
              {header.badgeTone && (
                <span className={`wf-menu-dot tone-${header.badgeTone}`} aria-hidden="true" />
              )}
              <strong className="wf-menu-title" title={header.title}>
                {header.title}
              </strong>
              {header.pill && <span className="wf-menu-pill">{header.pill}</span>}
            </div>
            {header.subtitle && <p className="wf-menu-subtitle">{header.subtitle}</p>}
          </header>
        )}

        {swatches && swatches.colors?.length > 0 && (
          <div
            className="wf-menu-swatches"
            role="group"
            aria-label={swatches.ariaLabel}
          >
            {swatches.colors.slice(0, 6).map((entry) => {
              const { id, value } = normalizeSwatchEntry(entry);
              const active = swatches.activeValue !== undefined && swatches.activeValue !== null && swatches.activeValue === value;
              const label = swatches.labelFor ? swatches.labelFor(id) : id;
              const swatchColor = swatches.accentFor ? swatches.accentFor(value) : value;
              return (
                <button
                  key={id}
                  type="button"
                  className={`wf-menu-swatch ${value ? "" : "plain"}`}
                  aria-label={label}
                  title={label}
                  aria-pressed={active}
                  style={swatchColor ? { "--swatch": swatchColor } : undefined}
                  onClick={() => {
                    swatches.onPick?.(value);
                  }}
                />
              );
            })}
          </div>
        )}

        {(header || swatches) && visibleSections.length > 0 && (
          <hr className="wf-menu-sep" />
        )}

        <div
          ref={listRef}
          className="wf-menu-list"
          {...{ focusgroup: "menu nomemory" }}
          aria-label={ariaLabel}
        >
          {visibleSections.map((group, sectionIndex) => {
            const checkableGroup = hasCheckableInGroup(group);
            const radioGroup = group.every((item) => item.role === "menuitemradio");
            const renderItem = (item) => {
              const isCheckable = item.role === "menuitemcheckbox" || item.role === "menuitemradio";
              return (
                <button
                  key={item.id || item.label}
                  type="button"
                  role={isCheckable ? item.role : undefined}
                  aria-checked={isCheckable ? Boolean(item.checked) : undefined}
                  aria-disabled={item.disabled ? "true" : undefined}
                  className={`wf-menu-item ${isCheckable ? "is-checkable" : ""} ${item.danger ? "danger" : ""} ${item.accent ? "accent" : ""}`.trim()}
                  onPointerMove={(event) => {
                    if (item.disabled) return;
                    if (document.activeElement !== event.currentTarget) {
                      event.currentTarget.focus({ preventScroll: true });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (item.disabled) return;
                    if (item.role === "menuitemcheckbox" && event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      item.onSelect?.();
                    }
                  }}
                  onClick={() => activateItem(item)}
                >
                  {!isCheckable && (
                    <span className="wf-menu-ico" aria-hidden="true">
                      <MenuIcon name={item.icon} />
                    </span>
                  )}
                  <span className="wf-menu-label">{item.label}</span>
                  {item.badge && (
                    <span className="wf-menu-badge" aria-hidden="true">
                      {item.badge}
                    </span>
                  )}
                  {item.shortcut && (
                    <span className="hint wf-menu-shortcut" aria-hidden="true">
                      {item.shortcut}
                    </span>
                  )}
                  {item.submenuArrow && (
                    <span className="hint wf-menu-chevron" aria-hidden="true">
                      ›
                    </span>
                  )}
                </button>
              );
            };

            return (
              <React.Fragment key={sectionIndex}>
                {sectionIndex > 0 && <hr className="wf-menu-sep" />}
                {radioGroup ? (
                  <div className="wf-menu-group" role="group" aria-label={group[0]?.groupLabel || ariaLabel}>
                    {group.map(renderItem)}
                  </div>
                ) : (
                  <div className={`wf-menu-section ${checkableGroup ? "has-checkable" : ""}`}>
                    {group.map(renderItem)}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </>
  );

  const portalTarget = typeof document !== "undefined"
    ? (document.querySelector(".app-shell") || document.body)
    : null;
  return portalTarget ? createPortal(content, portalTarget) : null;
}
