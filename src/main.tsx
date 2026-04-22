import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Importar helpers do console (diagnóstico e reset de testes)
import "./utils/consoleHelpers.ts";

createRoot(document.getElementById("root")!).render(<App />);
