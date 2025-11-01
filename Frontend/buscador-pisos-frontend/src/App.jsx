import { useState } from "react";
import { Button, Group, Title, Box } from "@mantine/core";
import Buscador from "./components/Buscador";
import MapaPisos from "./components/MapaPisos";
import ThemeToggle from "./components/ThemeToggle";
import LeyendaScore from "./components/LeyendaScore"; 

export default function App() {
  const [pisos, setPisos] = useState([]);
  const [opened, setOpened] = useState(false);

  return (
    <Box style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box
        style={{
          flexShrink: 0,
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1rem",
          backgroundColor: "var(--mantine-color-blue-9)",
          color: "white",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          zIndex: 1000,
        }}
      >
        <Title order={3} style={{ color: "white" }}>
          Buscador de Pisos
        </Title>
        <Group>
          <Button color="teal" onClick={() => setOpened(true)}>
            Buscar / Filtrar
          </Button>
        </Group>
      </Box>

      {/* Contenedor del mapa */}
      <Box style={{ flexGrow: 1, position: "relative" }}>
        <MapaPisos pisos={pisos} />

        {/* Botones flotantes */}
        <div
          style={{
            position: "fixed",
            bottom: 30,
            right: 40,
            zIndex: 8000,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <ThemeToggle />
          <LeyendaScore /> 
        </div>
      </Box>

      {/* Drawer de filtros */}
      <Buscador
        opened={opened}
        onClose={() => setOpened(false)}
        onResultados={setPisos}
      />
    </Box>
  );
}
