import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import { applyTheme, getInitialTheme } from "./lib/theme";
import "./index.css";

// Apply the saved (or system) theme before React mounts so the first
// painted frame already matches — prevents a light-to-dark flash.
applyTheme(getInitialTheme());

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
