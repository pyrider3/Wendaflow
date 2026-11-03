import React from "react";

// One stroke-icon set for the app chrome (top bar, rail), so no button relies on
// a text glyph that renders differently per platform.
const paths = {
  canvases: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  library: "M4 5h16v14H4zM8.5 10.2h.01M20 16l-4.5-4.5L8 19",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8M12 17h.01",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6",
  undo: "M9 14 4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5M20 9h-9a6 6 0 0 0 0 12h3",
  fit: "M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4",
  arrange: "M5 4h6v5H5zM13 15h6v5h-6zM5 15h6v5H5zM8 9v3h8v3",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14",
  focus: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  export: "M12 4v11M8 8l4-4 4 4M5 15v4h14v-4",
};

export function AppIcon({ name }) {
  return (
    <svg className="app-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
