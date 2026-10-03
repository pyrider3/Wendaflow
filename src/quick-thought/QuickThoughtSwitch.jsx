import React from "react";
export function QuickThoughtSwitch({ enabled, onToggle, labels }) {
  return (
    <button
      type="button"
      className="quick-thought-toggle"
      role="switch"
      aria-checked={enabled}
      title={labels.sliceHint}
      onClick={onToggle}
    >
      <span className="quick-switch-track" aria-hidden="true">
        <i />
      </span>
      <span>{labels.mode}</span>
    </button>
  );
}
