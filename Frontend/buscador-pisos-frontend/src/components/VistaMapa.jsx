import { useState, useEffect } from "react";
import {
  Button,
  Group,
  Title,
  Box,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { BarChart2, Scale, Heart, History } from "lucide-react";
import Buscador from "./Buscador";
import MapaPrincipal from "./MapaPrincipal";
import ThemeToggle from "./ThemeToggle";
import LeyendaScore from "./LeyendaScore";
import DrawerFavoritos from "./DrawerFavoritos";
import DrawerHistorial from "./DrawerHistorial";
import DrawerEstadisticas from "./DrawerEstadisticas";
import DrawerComparador from "./DrawerComparador";

const guardar = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const cargar = (k) => JSON.parse(localStorage.getItem(k) || "[]");

export default function VistaMapa() {
  const [pisos, setPisos] = useState([]);
  const [opened, setOpened] = useState(false);
  const [favoritos, setFavoritos] = useState(cargar("favoritos"));
  const [historial, setHistorial] = useState(cargar("historial"));
  const [drawerFavoritos, setDrawerFavoritos] = useState(false);
  const [drawerHistorial, setDrawerHistorial] = useState(false);
  const [drawerEstadisticas, setDrawerEstadisticas] = useState(false);
  const [drawerComparador, setDrawerComparador] = useState(false);

  const operation = "sale"; // ✅ operación por defecto: venta

  useEffect(() => guardar("favoritos", favoritos), [favoritos]);
  useEffect(() => guardar("historial", historial), [historial]);

  // ✅ Carga inicial de datos para mostrar el mapa
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const per_page = 1000;
        const res = await fetch(
          `http://localhost:8000/buscar-todo?operation=${operation}&page=1&per_page=${per_page}`
        );
        const data = await res.json();
        const arr = Array.isArray(data?.propiedades) ? data.propiedades : [];
        console.log("✅ Datos cargados:", arr.length, "pisos");
        if (!cancel) setPisos(arr);
      } catch (e) {
        console.error("Error cargando pisos iniciales:", e);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const manejarResultados = (nuevosPisos, filtrosUsados = {}) => {
    setPisos(nuevosPisos);
    const entrada = {
      fecha: new Date().toLocaleString(),
      ciudad: filtrosUsados.ciudad || "N/D",
      operation: filtrosUsados.operation || operation,
      cantidad: nuevosPisos.length,
    };
    setHistorial((prev) => [entrada, ...prev].slice(0, 10));
  };

  return (
    <Box style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* HEADER */}
      <Box
        style={{
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1rem",
          backgroundColor: "var(--mantine-color-blue-9)",
          color: "white",
          zIndex: 5000,
        }}
      >
        <Group>
          <Title order={3} style={{ color: "white" }}>
            Buscador de Pisos (Venta)
          </Title>
        </Group>

        <Group gap="xs">
          <Tooltip label="Buscar y aplicar filtros" withArrow>
            <Button color="teal" onClick={() => setOpened(true)}>
              Filtrar
            </Button>
          </Tooltip>
          <Tooltip label="Estadísticas globales" withArrow>
            <ActionIcon color="blue" onClick={() => setDrawerEstadisticas(true)}>
              <BarChart2 size={22} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Comparador" withArrow>
            <ActionIcon color="indigo" onClick={() => setDrawerComparador(true)}>
              <Scale size={22} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Favoritos" withArrow>
            <ActionIcon color="pink" onClick={() => setDrawerFavoritos(true)}>
              <Heart size={22} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Historial" withArrow>
            <ActionIcon color="gray" onClick={() => setDrawerHistorial(true)}>
              <History size={22} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>

      {/* MAPA */}
      <Box
        style={{
          flexGrow: 1,
          position: "relative",
          minHeight: "calc(100vh - 60px)",
        }}
      >
        <MapaPrincipal pisos={pisos} />
        {/* Controles superpuestos */}
        <div
          style={{
            position: "absolute",
            bottom: 30,
            right: 40,
            zIndex: 4000,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <ThemeToggle />
          <LeyendaScore />
        </div>
      </Box>

      {/* DRAWERS */}
      <Buscador
        opened={opened}
        onClose={() => setOpened(false)}
        onResultados={manejarResultados}
      />
      <DrawerFavoritos
        opened={drawerFavoritos}
        onClose={() => setDrawerFavoritos(false)}
        favoritos={favoritos}
        setFavoritos={setFavoritos}
      />
      <DrawerHistorial
        opened={drawerHistorial}
        onClose={() => setDrawerHistorial(false)}
        historial={historial}
        setHistorial={setHistorial}
      />
      <DrawerEstadisticas
        opened={drawerEstadisticas}
        onClose={() => setDrawerEstadisticas(false)}
      />
      <DrawerComparador
        opened={drawerComparador}
        onClose={() => setDrawerComparador(false)}
      />
    </Box>
  );
}
