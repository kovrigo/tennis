import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Shared styles first, so each page's stylesheet comes after them and can refine them.
import "./styles/base.css";
import "./styles/forms.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
