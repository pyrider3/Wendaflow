import React, { useEffect, useRef } from "react";
import { NavIcon } from "./ui.jsx";
import { BrandMark } from "../BrandMark.jsx";
import "./settings.css";

// Shell for the settings dialog: backdrop, card, sliding navigation pill and an
// animated content area.  Pages are plain children keyed by the active section,
// so switching sections replays the page-enter animation.
export function SettingsDialog({
  closing,
  onClose,
  title,
  closeLabel,
  sections,
  active,
  onSelect,
  children,
}) {
  const cardRef = useRef(null);
  const bodyRef = useRef(null);
  const index = Math.max(0, sections.findIndex((section) => section.id === active));

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [active]);

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  function onNavKeyDown(event) {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = sections[(index + step + sections.length) % sections.length];
    onSelect(next.id);
    requestAnimationFrame(() =>
      cardRef.current?.querySelector(`[data-section="${next.id}"]`)?.focus()
    );
  }

  return (
    <div
      className={`sx-backdrop${closing ? " closing" : ""}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={cardRef}
        className="sx sx-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <aside className="sx-side">
          <div className="sx-brand">
            <BrandMark size={34} />
            <div>
              <strong>Wendaflow</strong>
              <small>{title}</small>
            </div>
          </div>
          <nav
            className="sx-nav"
            aria-label={title}
            style={{ "--sx-index": index, "--sx-count": sections.length }}
            onKeyDown={onNavKeyDown}
          >
            <i className="sx-nav-pill" aria-hidden="true" />
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                data-section={section.id}
                className={section.id === active ? "active" : ""}
                aria-current={section.id === active ? "page" : undefined}
                onClick={() => onSelect(section.id)}
              >
                <NavIcon name={section.id} />
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="sx-main">
          <button type="button" className="sx-close" aria-label={closeLabel} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <div className="sx-scroll" ref={bodyRef}>
            <div className="sx-stage" key={active}>
              {children}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
