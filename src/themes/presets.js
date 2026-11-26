// One ordered list drives the theme picker; IDs are persisted canvas preferences.
export function themePresets(tr, customLabel) {
  return [
    ["contrast-light", tr("极昼", "Daylight")],
    ["contrast-black", tr("极夜", "Nightfall")],
    ["obsidian", tr("黑曜", "Obsidian")],
    ["moonstone", tr("白曜", "Moonstone")],
    ["fog", tr("雾白", "Fog")],
    ["notebook", tr("纸感", "Notebook")],
    ["inkline", tr("墨线", "Ink Line")],
    ["float", tr("浮岛", "Float")],
    ["aurora", tr("极光", "Aurora")],
    ["dusk", tr("暮光", "Dusk")],
    ["ocean", tr("深海", "Ocean")],
    ["sakura", tr("樱粉", "Sakura")],
    ["lavender", tr("薰衣草", "Lavender")],
    ["dune", tr("沙丘", "Dune")],
    ["blueprint", tr("蓝图", "Blueprint")],
    ["sticky", tr("便利贴", "Sticky Notes")],
    ["inkwash", tr("水墨", "Ink Wash")],
    ["terminal", tr("终端", "Terminal")],
    ["chalkboard", tr("黑板", "Chalkboard")],
    ["coffee", tr("咖啡", "Coffee")],
    ["bauhaus", tr("包豪斯", "Bauhaus")],
    ["neon", tr("霓虹", "Neon")],
    ["custom", customLabel],
  ];
}
