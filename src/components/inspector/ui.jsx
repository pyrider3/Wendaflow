import React from "react";

// Small controls used only by the card inspector. Colours come from the --sx-*
// tokens (see ../settings/settings.css), so every theme is covered.

const cx = (...names) => names.filter(Boolean).join(" ");

const paths = {
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4",
  close: "M6 6l12 12M18 6 6 18",
  chevron: "m9 6 6 6-6 6",
  plus: "M12 5v14M5 12h14",
  trash: "M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8L18 16Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1",
  refresh: "M20 11a8 8 0 0 0-14.5-3.5L4 9M4 5v4h4M4 13a8 8 0 0 0 14.5 3.5L20 15M20 19v-4h-4",
  stop: "M7 7h10v10H7z",
  folder: "M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z",
};

export function Icon({ name, className }) {
  return (
    <svg className={cx("ix-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export function IconButton({ icon, label, pressed, tone, onClick, disabled }) {
  return (
    <button
      type="button"
      className={cx("ix-icon-btn", pressed && "on", tone)}
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Segmented({ items, value, onChange, label }) {
  const index = Math.max(0, items.findIndex(([id]) => id === value));
  return (
    <div className="ix-seg" role="radiogroup" aria-label={label} style={{ "--i": index, "--n": items.length }}>
      <i className="ix-seg-pill" aria-hidden="true" />
      {items.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={id === value}
          className={id === value ? "active" : ""}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Collapse({ open, children }) {
  return (
    <div className={cx("ix-collapse", open && "open")} aria-hidden={!open}>
      <div className="ix-collapse-inner">{children}</div>
    </div>
  );
}

export function Swatches({ colors, value, labelFor, onPick }) {
  return (
    <div className="ix-swatches" role="group">
      {colors.map(([id, , color]) => (
        <button
          key={id}
          type="button"
          className={cx("ix-swatch", (value || "") === color && "active", !color && "plain")}
          style={{ "--swatch": color || "transparent" }}
          aria-label={labelFor(id)}
          aria-pressed={(value || "") === color}
          title={labelFor(id)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onPick(color);
          }}
        >
          <Icon name="check" />
        </button>
      ))}
    </div>
  );
}

export function Textarea(props) {
  return <textarea {...props} className={cx("sx-input ix-textarea", props.className)} />;
}

export function Callout({ tone = "info", title, children, actions }) {
  return (
    <div className={cx("ix-callout", tone)}>
      {title && <strong>{title}</strong>}
      {children && <p>{children}</p>}
      {actions && <div className="ix-callout-actions">{actions}</div>}
    </div>
  );
}
