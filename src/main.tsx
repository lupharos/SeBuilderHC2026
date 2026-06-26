
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { seedOnBoot } from "./app/utils/seedData";

  /* Seed default data into localStorage BEFORE the first render, so every
     useLocalStorage hook hydrates from the curated knowledge base on a
     fresh install. seedOnBoot never throws and falls back to built-in
     defaults if no seed is served (offline / missing file). */
  seedOnBoot().finally(() => {
    createRoot(document.getElementById("root")!).render(<App />);
  });
  