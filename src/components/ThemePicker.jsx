import React from "react";
import { themePresets } from "../themes/presets.js";
export function ThemePicker({ value, onChange, tr, customLabel, label }) {
  return (
    <div className="theme-presets" role="group" aria-label={label}>
      {themePresets(tr, customLabel).map(([id, name]) => (
        <button
          key={id}
          type="button"
          className={value === id ? "active" : ""}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          <i data-swatch={id} aria-hidden="true" />
          <span>{name}</span>
        </button>
      ))}
    </div>
  );
}
