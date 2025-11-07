import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { FavoritosProvider } from "./context/FavoritosContext";
import { useLocalStorage } from "@mantine/hooks";
import App from "./App";
import "leaflet/dist/leaflet.css";
import "@mantine/core/styles.css";

function Root() {
  const [colorScheme] = useLocalStorage({
    key: "app-color-scheme",
    defaultValue: "auto",
  });

  return (
    <MantineProvider
      defaultColorScheme={colorScheme}
      withGlobalStyles
      withNormalizeCSS
    >
      <FavoritosProvider>
        <App />
      </FavoritosProvider>
    </MantineProvider>
  );
}

// 👉 Este script se ejecuta antes del render
ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    <ColorSchemeScript defaultColorScheme="auto" />
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  </>
);
