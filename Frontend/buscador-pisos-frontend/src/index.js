import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import App from "./App";
import "leaflet/dist/leaflet.css";
import "@mantine/core/styles.css";

// 🌓 Componente envoltorio para manejar el tema manualmente
function Root() {
  const [colorScheme, setColorScheme] = useLocalStorage({
    key: "app-color-scheme",
    defaultValue: "auto",
  });

  return (
    <>
      <ColorSchemeScript defaultColorScheme="auto" />
      <MantineProvider
        defaultColorScheme={colorScheme}
        withGlobalStyles
        withNormalizeCSS
      >
        <App />
      </MantineProvider>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
