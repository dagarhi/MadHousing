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
import Buscador from "./components/Buscador";
import MapaPisos from "./components/MapaPisos";
import ThemeToggle from "./components/ThemeToggle";
import LeyendaScore from "./components/LeyendaScore";
import DrawerFavoritos from "./components/DrawerFavoritos";
import DrawerHistorial from "./components/DrawerHistorial";
import DrawerEstadisticas from "./components/DrawerEstadisticas";
import DrawerComparador from "./components/DrawerComparador";


// 🧠 Helpers de almacenamiento
const guardarEnLocalStorage = (clave, valor) => {
  localStorage.setItem(clave, JSON.stringify(valor));
};

const cargarDeLocalStorage = (clave) => {
  const data = localStorage.getItem(clave);
  return data ? JSON.parse(data) : [];
};

export default function App() {
  const [pisos, setPisos] = useState([]);
  const [opened, setOpened] = useState(false);

  // ❤️ Favoritos
  const [favoritos, setFavoritos] = useState(cargarDeLocalStorage("favoritos"));
  const [drawerFavoritos, setDrawerFavoritos] = useState(false);

  // 🕓 Historial
  const [historial, setHistorial] = useState(cargarDeLocalStorage("historial"));
  const [drawerHistorial, setDrawerHistorial] = useState(false);

  // 📊 Estadísticas
  const [drawerEstadisticas, setDrawerEstadisticas] = useState(false);

  const [drawerComparador, setDrawerComparador] = useState(false);


  // 🔁 Sincronización con localStorage
  useEffect(() => guardarEnLocalStorage("favoritos", favoritos), [favoritos]);
  useEffect(() => guardarEnLocalStorage("historial", historial), [historial]);

  // 📈 Registrar resultados e historial
  const manejarResultados = (nuevosPisos, filtrosUsados = {}) => {
    setPisos(nuevosPisos);

    const entrada = {
      fecha: new Date().toLocaleString(),
      ciudad: filtrosUsados.ciudad || "N/D",
      operation: filtrosUsados.operation || "rent",
      filtros: {
        min_price: filtrosUsados.min_price,
        max_price: filtrosUsados.max_price,
        min_size: filtrosUsados.min_size,
        max_size: filtrosUsados.max_size,
      },
      cantidad: nuevosPisos.length,
    };

    setHistorial((prev) => [entrada, ...prev].slice(0, 10));
  };

  return (
    <Box style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* HEADER */}
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

        <Group gap="xs">
          {/* 🔍 Drawer de filtros */}
          <Tooltip
            label="Buscar y aplicar filtros"
            withArrow
            withinPortal={false}
            zIndex={99999}
          >
            <Button color="teal" onClick={() => setOpened(true)}>
              Buscar / Filtrar
            </Button>
          </Tooltip>

          {/* 📊 Estadísticas */}
          <Tooltip
            label="Ver estadísticas globales"
            withArrow
            withinPortal={false}
            zIndex={99999}
          >
            <ActionIcon
              variant="filled"
              color="blue"
              radius="xl"
              size="lg"
              onClick={() => setDrawerEstadisticas(true)}
            >
              <BarChart2 size={22} />
            </ActionIcon>
          </Tooltip>

          {/* ⚖️ Comparador */}
          <Tooltip
            label="Comparar zonas o pisos"
            withArrow
            withinPortal={false}
            zIndex={99999}
          >
            <ActionIcon
              variant="filled"
              color="indigo"
              radius="xl"
              size="lg"
              onClick={() => setDrawerComparador(true)}
            >
              <Scale size={22} />
            </ActionIcon>
          </Tooltip>

          {/* ❤️ Favoritos */}
          <Tooltip
            label="Mis pisos favoritos"
            withArrow
            withinPortal={false}
            zIndex={99999}
          >
            <ActionIcon
              variant="filled"
              color="pink"
              radius="xl"
              size="lg"
              onClick={() => setDrawerFavoritos(true)}
            >
              <Heart size={22} />
            </ActionIcon>
          </Tooltip>

          {/* 🕓 Historial */}
          <Tooltip
            label="Historial de búsquedas"
            withArrow
            withinPortal={false}
            zIndex={99999}
          >
            <ActionIcon
              variant="filled"
              color="gray"
              radius="xl"
              size="lg"
              onClick={() => setDrawerHistorial(true)}
            >
              <History size={22} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>

      {/* MAPA */}
      <Box style={{ flexGrow: 1, position: "relative" }}>
        <MapaPisos pisos={pisos} favoritos={favoritos} setFavoritos={setFavoritos} />

        <div
          style={{
            position: "fixed",
            bottom: 30,
            right: 40,
            zIndex: 3000,
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
        onResultados={manejarResultados}
      />

      {/* ❤️ Drawer de favoritos */}
      <DrawerFavoritos
        opened={drawerFavoritos}
        onClose={() => setDrawerFavoritos(false)}
        favoritos={favoritos}
        setFavoritos={setFavoritos}
      />

      {/* 🕓 Drawer de historial */}
      <DrawerHistorial
        opened={drawerHistorial}
        onClose={() => setDrawerHistorial(false)}
        historial={historial}
        setHistorial={setHistorial}
      />

      {/* 📊 Drawer de estadísticas */}
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
