import React from "react";

// Small line icons for an agent run's activity: what kind of step each entry is, at a glance.
const PATHS = {
  read: "M4 3.5h6l3 3v9H4zM10 3.5v3h3M6.5 9.5h4M6.5 12h4",
  edit: "M11.5 3.5l3 3-7.5 7.5H4v-3zM10 5l3 3",
  write: "M4 3.5h6l3 3v9H4zM10 3.5v3h3M8.5 9v5M6 11.5h5",
  bash: "M3.5 5l3.5 3.5L3.5 12M8.5 13h5",
  grep: "M8 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM11.3 11.3 15 15",
  find: "M8 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM11.3 11.3 15 15",
  ls: "M3 4.5A1.5 1.5 0 0 1 4.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 15 6v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 13z",
  thinking: "M9 2.5c.5 3.2 2.3 5 5.5 5.5-3.2.5-5 2.3-5.5 5.5-.5-3.2-2.3-5-5.5-5.5 3.2-.5 5-2.3 5.5-5.5z",
  message: "M3.5 4.5h11v7.5h-6l-3 2.5V12h-2z",
  user: "M9 8.5a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM3.5 15.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5",
  file: "M4 3.5h6l3 3v9H4zM10 3.5v3h3",
  stderr: "M9 3l6.5 11.5h-13zM9 7.5v3.5M9 12.8v.2",
  status: "M9 9h.01",
};

export function ActivityIcon({ kind }) {
  return (
    <i className={`activity-icon ${kind}`} aria-hidden="true">
      <svg viewBox="0 0 18 18"><path d={PATHS[kind] || PATHS.status} /></svg>
    </i>
  );
}
