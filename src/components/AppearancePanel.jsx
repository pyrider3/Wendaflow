import React from "react";
import { ThemePicker } from "./ThemePicker.jsx";
export function AppearancePanel({
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  languages,
  previewEnabled,
  onPreviewChange,
  customTheme,
  onCustomThemeChange,
  onRestoreColors,
  text,
  copy,
  tr,
}) {
  return (
    <section className="settings-section">
      <header>
        <h3>{text("appearance")}</h3>
        <p>{text("appearanceHint")}</p>
      </header>
      <div className="appearance-setting">
        <div>
          <strong>{text("interfaceTheme")}</strong>
          <span>{text("interfaceThemeHint")}</span>
        </div>
        <ThemePicker
          value={theme}
          onChange={onThemeChange}
          tr={tr}
          customLabel={text("customTheme")}
          label={text("interfaceTheme")}
        />
      </div>
      <div className="appearance-setting language-setting">
        <div>
          <strong>{copy.language}</strong>
          <span>{copy.languageHint}</span>
        </div>
        <select
          aria-label={copy.language}
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
        >
          {languages.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="appearance-setting preview-toggle-setting">
        <div>
          <strong>{text("preview")}</strong>
          <span>{text("previewHint")}</span>
        </div>
        <button
          type="button"
          className={`preview-switch ${previewEnabled ? "enabled" : ""}`}
          role="switch"
          aria-checked={previewEnabled}
          aria-label={text("preview")}
          onClick={() => onPreviewChange((value) => !value)}
        >
          <i aria-hidden="true" />
          <span>{previewEnabled ? text("enabled") : text("disabled")}</span>
        </button>
      </div>
      {theme === "custom" && (
        <div className="custom-theme-editor">
          <div>
            <strong>{text("customTheme")}</strong>
            <span>{text("customThemeHint")}</span>
          </div>
          <div>
            {[
              ["background", tr("背景", "Background")],
              ["surface", tr("卡片", "Cards")],
              ["text", tr("文字", "Text")],
              ["accent", tr("强调色", "Accent")],
              ["grid", tr("网格", "Grid")],
            ].map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="color"
                  value={customTheme[key]}
                  onChange={(event) =>
                    onCustomThemeChange((value) => ({
                      ...value,
                      [key]: event.target.value,
                    }))
                  }
                />
                <code>{customTheme[key]}</code>
              </label>
            ))}
          </div>
          <button type="button" onClick={onRestoreColors}>
            {text("restoreColors")}
          </button>
        </div>
      )}
    </section>
  );
}
