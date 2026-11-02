import React from "react";
import { ThemePicker } from "./ThemePicker.jsx";
import { Button, Group, Page, Row, Select, Switch } from "./settings/ui.jsx";

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
    <Page title={text("appearance")} description={text("appearanceHint")}>
      <Group title={text("interfaceTheme")} hint={text("interfaceThemeHint")}>
        <div className="sx-row stack">
          <ThemePicker
            value={theme}
            onChange={onThemeChange}
            tr={tr}
            customLabel={text("customTheme")}
            label={text("interfaceTheme")}
          />
        </div>
        {theme === "custom" && (
          <div>
            <div className="sx-colors">
              {[
                ["background", tr("背景", "Background")],
                ["surface", tr("卡片", "Cards")],
                ["text", tr("文字", "Text")],
                ["accent", tr("强调色", "Accent")],
                ["grid", tr("网格", "Grid")],
              ].map(([key, label]) => (
                <label key={key} className="sx-color">
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
                  <div>
                    <span>{label}</span>
                    <code>{customTheme[key]}</code>
                  </div>
                </label>
              ))}
            </div>
            <div className="sx-actionbar">
              <span className="sx-note">{text("customThemeHint")}</span>
              <Button kind="ghost" className="small" onClick={onRestoreColors}>
                {text("restoreColors")}
              </Button>
            </div>
          </div>
        )}
      </Group>
      <Group>
        <Row title={copy.language} hint={copy.languageHint}>
          <Select
            aria-label={copy.language}
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
          >
            {languages.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </Row>
        <Row title={text("preview")} hint={text("previewHint")}>
          <Switch
            checked={previewEnabled}
            onChange={(value) => onPreviewChange(value)}
            label={text("preview")}
            onLabel={text("enabled")}
            offLabel={text("disabled")}
          />
        </Row>
      </Group>
    </Page>
  );
}
