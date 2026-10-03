// One ordered list drives the theme picker; IDs are persisted canvas preferences.
export function themePresets(tr, customLabel) {
  return [
    ["sage", tr("雾青", "Mist")],
    ["paper", tr("珍珠", "Pearl")],
    ["midnight", tr("夜蓝", "Midnight")],
    ["graphite", tr("墨黑", "Graphite")],
    ["contrast-light", tr("极昼", "Daylight")],
    ["contrast-black", tr("极夜", "Nightfall")],
    ["contrast-blue", tr("钴蓝", "Cobalt")],
    ["contrast-amber", tr("琥珀", "Amber")],
    ["contrast-plum", tr("紫曜", "Plum")],
    ["custom", customLabel],
  ];
}
