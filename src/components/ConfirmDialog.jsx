import React, { useEffect, useRef } from "react";
import { Button } from "./settings/ui.jsx";
import "./settings/settings.css";

// Small modal for "are you sure" questions. `actions` is a list of
// { id, label, kind }; Esc and a click on the backdrop answer with `cancelId`.
export function ConfirmDialog({ title, message, actions, cancelId = "cancel", onAnswer }) {
  const cardRef = useRef(null);

  useEffect(() => {
    const safe = cardRef.current?.querySelector("[data-safe]");
    (safe || cardRef.current)?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="sx-backdrop sx-confirm-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onAnswer(cancelId);
      }}
    >
      <section
        ref={cardRef}
        className="sx sx-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onAnswer(cancelId);
          }
        }}
      >
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="sx-confirm-actions">
          {actions.map((action) => (
            <Button
              key={action.id}
              kind={action.kind}
              data-safe={action.id === cancelId ? "" : undefined}
              onClick={() => onAnswer(action.id)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
