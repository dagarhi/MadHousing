import { useState } from "react";
import { AppShell, Button, Group, Title } from "@mantine/core";
import Buscador from "./components/Buscador";
import MapaPisos from "./components/MapaPisos";

export default function App() {
  const [pisos, setPisos] = useState([]);
  const [opened, setOpened] = useState(false);

  return (
    <AppShell
      header={{ height: 60 }}
      padding="0"
      styles={{
        main: {
          overflow: "visible", // 👈 permite que el Drawer se vea completo
        },
      }}
    >
      {/* Header */}
      <AppShell.Header
        style={{
          backgroundColor: "var(--mantine-color-blue-9)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1rem",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        }}
      >
        <Title order={3}>🏠 Buscador de Pisos</Title>
        <Group>
          <Button color="teal" onClick={() => setOpened(true)}>
            Buscar / Filtrar
          </Button>
        </Group>
      </AppShell.Header>

      {/* Contenido principal */}
      <AppShell.Main style={{ height: "calc(100vh - 60px)" }}>
        <MapaPisos pisos={pisos} />
      </AppShell.Main>

      {/* Drawer de filtros */}
      <Buscador
        opened={opened}
        onClose={() => setOpened(false)}
        onResultados={setPisos}
      />
    </AppShell>
  );
}

