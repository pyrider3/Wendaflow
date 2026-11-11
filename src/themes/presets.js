// One ordered list drives the theme picker; IDs are persisted canvas preferences.
export function themePresets(tr, customLabel) {
  return [
    ["sage", tr("雾青", "Mist")],
    ["paper", tr("珍珠", "Pearl")],
    ["midnight", tr("夜蓝", "Midnight")],
    ["graphite", tr("墨黑", "Graphite")],
    ["contrast-light", tr("极昼", "Daylight")],
    ["contrast-black", tr("极夜", "Nightfall")],
    ["starlight", tr("星夜", "Starlight")],
    ["obsidian", tr("黑曜", "Obsidian")],
    ["aurora", tr("极光", "Aurora")],
    ["dusk", tr("暮光", "Dusk")],
    ["ocean", tr("深海", "Ocean")],
    ["sakura", tr("樱粉", "Sakura")],
    ["lavender", tr("薰衣草", "Lavender")],
    ["dune", tr("沙丘", "Dune")],
    ["custom", customLabel],
  ];
}
