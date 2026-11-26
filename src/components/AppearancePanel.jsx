import React from "react";
import { ThemePicker } from "./ThemePicker.jsx";
import { CustomThemeEditor } from "./CustomThemeEditor.jsx";
import { Group, Page, Row, Select, Switch } from "./settings/ui.jsx";

export function AppearancePanel({
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  languages,
  previewEnabled,
  onPreviewChange,
  canvasHints,
  onCanvasHintsChange,
  customTheme,
  onCustomThemeChange,
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
        {theme === "custom" && <CustomThemeEditor value={customTheme} onChange={onCustomThemeChange} tr={tr} />}
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
        <Row
          title={tr("画布操作提示", "Canvas hints")}
          hint={tr("在画布底部显示操作提示条。框选时的模式提示仍会显示。", "Show the gesture hints at the bottom of the canvas. Selection mode feedback still appears while selecting.")}
        >
          <Switch
            checked={canvasHints}
            onChange={(value) => onCanvasHintsChange(value)}
            label={tr("画布操作提示", "Canvas hints")}
            onLabel={text("enabled")}
            offLabel={text("disabled")}
          />
        </Row>
      </Group>
    </Page>
  );
}
