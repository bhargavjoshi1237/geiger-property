"use client";

import { useEffect } from "react";

const DARK_FAVICON = "/favicon.ico";
const LIGHT_FAVICON = "/faviconL.ico";

export function SystemFavicon() {
  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

    const updateFavicon = () => {
      document
        .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
        .forEach((link) => link.remove());

      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/x-icon";
      link.href = colorScheme.matches ? DARK_FAVICON : LIGHT_FAVICON;
      document.head.appendChild(link);
    };

    updateFavicon();
    colorScheme.addEventListener("change", updateFavicon);

    return () => colorScheme.removeEventListener("change", updateFavicon);
  }, []);

  return null;
}
