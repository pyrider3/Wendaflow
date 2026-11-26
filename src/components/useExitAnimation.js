import React, { useLayoutEffect, useRef } from "react";

// Lets a panel fade out instead of vanishing when React unmounts it: on unmount, a frozen copy of the
// element is placed exactly where it was and animated away, then removed. Same approach as the canvas
// picker. Skipped when the user prefers reduced motion.
// inPlace: put the copy right next to the original (same parent and classes) instead of on <body>, so styles
// scoped to its ancestors still apply. Use it for absolutely positioned popovers.
export function useExitAnimation(ref, { duration = 140, to = "translateY(4px) scale(.985)", inPlace = false } = {}) {
  useLayoutEffect(() => () => {
    const el = ref.current;
    if (!el || !el.isConnected || typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const style = getComputedStyle(el);
    const copy = el.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    copy.inert = true;
    if (inPlace && el.parentNode && style.position === "absolute") {
      Object.assign(copy.style, { animation: "none", pointerEvents: "none" });
      el.parentNode.insertBefore(copy, el.nextSibling);
      copy.animate([{ opacity: style.opacity, transform: "none" }, { opacity: 0, transform: to }], { duration, easing: "ease-in" }).finished.then(() => copy.remove(), () => copy.remove());
      return;
    }
    Object.assign(copy.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", animation: "none", pointerEvents: "none", zIndex: "500" });
    document.body.appendChild(copy);
    copy.animate([{ opacity: style.opacity, transform: "none" }, { opacity: 0, transform: to }], { duration, easing: "ease-in" }).finished.then(() => copy.remove(), () => copy.remove());
  }, []);
}

// A <section> (or other tag) that fades out when it unmounts, for panels rendered as `{open && <… />}`.
export function ExitAnimated({ as = "section", exit, ...props }) {
  const ref = useRef(null);
  useExitAnimation(ref, exit);
  return React.createElement(as, { ...props, ref });
}
