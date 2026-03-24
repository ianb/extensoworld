import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { appRouter } from "./router.js";
import "./styles.css";

class MissingRootElementError extends Error {
  constructor() {
    super("Missing #root element");
    this.name = "MissingRootElementError";
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new MissingRootElementError();
}
createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={appRouter} />
  </StrictMode>,
);
