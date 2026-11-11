import React from "react";

// Shared building blocks for every settings page. Colours come from the --sx-*
// tokens in settings.css, so a page never needs theme-specific overrides.

const cx = (...names) => names.filter(Boolean).join(" ");

export function Page({ title, description, children }) {
  return (
    <section className="sx-page">
      <header className="sx-page-head">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className="sx-page-body">{children}</div>
    </section>
  );
}

export function Group({ title, hint, action, children, className }) {
  return (
    <div className={cx("sx-group", className)}>
      {(title || action) && (
        <div className="sx-group-head">
          <div>
            <strong>{title}</strong>
            {hint && <span>{hint}</span>}
          </div>
          {action}
        </div>
      )}
      <div className="sx-group-body">{children}</div>
    </div>
  );
}

export function Row({ title, hint, children, stack }) {
  return (
    <div className={cx("sx-row", stack && "stack")}>
      <div className="sx-row-text">
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      {children && <div className="sx-row-control">{children}</div>}
    </div>
  );
}

export function Fields({ children }) {
  return <div className="sx-fields">{children}</div>;
}

export function Field({ label, span, children }) {
  return (
    <label className={cx("sx-field", span && "span")}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export const Input = React.forwardRef(function Input(props, ref) {
  return <input ref={ref} {...props} className={cx("sx-input", props.className)} />;
});

export function Select({ children, className, ...props }) {
  return (
    <span className={cx("sx-select", className)}>
      <select {...props}>{children}</select>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </span>
  );
}

export function Switch({ checked, onChange, label, onLabel, offLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx("sx-switch", checked && "on")}
      onClick={() => onChange(!checked)}
    >
      <i aria-hidden="true" />
      {(onLabel || offLabel) && <span>{checked ? onLabel : offLabel}</span>}
    </button>
  );
}

export function Button({ kind = "default", className, ...props }) {
  return <button type="button" {...props} className={cx("sx-btn", kind, className)} />;
}

export function Chips({ items, activeId, onSelect, onAdd, addLabel }) {
  return (
    <div className="sx-chips" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeId}
          className={item.id === activeId ? "active" : ""}
          onClick={() => onSelect(item.id)}
        >
          {item.name}
        </button>
      ))}
      <button type="button" className="add" aria-label={addLabel} onClick={onAdd}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

export function Status({ tone = "idle", children }) {
  return (
    <span className={cx("sx-status", tone)}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function Empty({ icon, title, children }) {
  return (
    <div className="sx-empty">
      <div className="sx-empty-icon">{icon}</div>
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
}

export const icons = {
  models: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M7.5 7.5 9 9M15 15l1.5 1.5M16.5 7.5 15 9M9 15l-1.5 1.5M9 9h6v6H9z" />,
  appearance: <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3ZM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01" />,
  notifications: <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7ZM10 20a2 2 0 0 0 4 0" />,
  agents: <path d="M12 3a3 3 0 0 1 3 3v1h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V6a3 3 0 0 1 3-3ZM9.5 13h.01M14.5 13h.01M10 16.5h4" />,
  plugins: <path d="M10 4h4v3a2 2 0 1 0 4 0h2v6h-3a2 2 0 1 0 0 4h3v3H5v-5a2 2 0 1 1 0-4V4h5Z" />,
  project: <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />,
  about: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01" />,
};

export function NavIcon({ name }) {
  return (
    <svg className="sx-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}
