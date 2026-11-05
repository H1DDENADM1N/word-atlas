import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "@fontsource-variable/atkinson-hyperlegible-next/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installTapFeedback } from "./lib/feedback";
import { installFocusRing } from "./lib/focusRing";
import { installBackHandler, installSystemTheme, isShell } from "./lib/native";
import { preloadFiles } from "./lib/sound";
import "./styles/app.css";

installSystemTheme();
installFocusRing();
// Decode both short cues at boot, not on the first press: under the APK's
// `file://` origin the buffers are already inline, so the first tap and the
// first keystroke both start synchronously with no promise round-trip.
preloadFiles(["tap.mp3", "key.mp3"]);
installTapFeedback();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Inside the APK the page is already unpacked from the package, so the service
// worker would only add a second cache layer. The hardware back key is wired to
// in-app navigation instead.
installBackHandler();

if (import.meta.env.PROD && !isShell && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => null);
  });
}
