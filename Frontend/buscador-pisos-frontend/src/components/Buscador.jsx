import { useState, useEffect } from "react";
import axios from "axios";
import {
  Drawer,
  Button,
  Select,
  Stack,
  Text,
  Divider,
  Group,
  RangeSlider,
  NumberInput,
  Checkbox,
  Loader,
  Accordion,
} from "@mantine/core";
import { Coins, Ruler, Star, Settings2 } from "lucide-react";

export default function Buscador({ onResultados, opened, onClose }) {
  const [ciudad, setCiudad] = useState("");
  const [operation, setOperation] = useState("rent");

  const [stats, setStats] = useState(null);
  const [priceRange, setPriceRange] = useState([0, 0]);
  const [sizeRange, setSizeRange] = useState([0, 0]);
  const [scoreRange, setScoreRange] = useState([0, 100]);
  const [rooms, setRooms] = useState(null);
  const [floor, setFloor] = useState(null);
  const [hasLift, setHasLift] = useState(false);
  const [loading, setLoading] = useState(false);

  // ================================================================
  // 🧠 Cargar estadísticas dinámicamente al elegir zona y operación
  // ================================================================
  useEffect(() => {
    const cargarStats = async () => {
      if (!ciudad || ciudad === "todas" || !operation) return;
      setLoading(true);
      try {
        const res = await axios.get("http://localhost:8000/buscar", {
          params: { ciudad, operation },
        });
        const s = res.data.stats;
        if (s) {
          setStats(s);
          setPriceRange([s.price.min, s.price.max]);
          setSizeRange([s.size.min, s.size.max]);
          setScoreRange([s.score.min, s.score.max]);
        }
      } catch (err) {
        console.error("Error cargando stats:", err);
      } finally {
        setLoading(false);
      }
    };
    cargarStats();
  }, [ciudad, operation]);

  // ================================================================
  // 🔍 Buscar pisos con los filtros aplicados
  // ================================================================
  const buscarPisos = async () => {
    if (!ciudad) return alert("Selecciona una zona");

    try {
      setLoading(true);
      let res;

      if (ciudad === "todas") {
        res = await axios.get("http://localhost:8000/buscar-todo", {
          params: { operation },
        });
      } else {
        const params = { ciudad, operation };

        if (stats?.price) {
          params.min_price = priceRange[0];
          params.max_price = priceRange[1];
        }
        if (stats?.size) {
          params.min_size = sizeRange[0];
          params.max_size = sizeRange[1];
        }
        if (stats?.score) {
          params.min_score = scoreRange[0];
          params.max_score = scoreRange[1];
        }

        if (rooms != null) params.rooms = rooms;
        if (floor != null) params.floor = floor;
        if (hasLift) params.hasLift = true;

        res = await axios.get("http://localhost:8000/buscar", { params });
      }

      onResultados(res.data.propiedades || []);
      onClose();
    } catch (err) {
      alert("Error al buscar pisos: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>Filtros de búsqueda</Text>}
      position="right"
      size="md"
      overlayProps={{ opacity: 0.4, blur: 3 }}
      zIndex={3000}
    >
      <Stack gap="md" mt="sm">
        {/* Zona */}
        <Select
          label="Zona"
          placeholder="Selecciona zona"
          data={[
            { value: "todas", label: "Todas las zonas" },
            { value: "madrid_centro", label: "Centro de Madrid" },
            { value: "retiro", label: "Retiro" },
            { value: "arganzuela", label: "Arganzuela" },
            { value: "moratalaz", label: "Moratalaz" },
            { value: "vallecas", label: "Vallecas" },
            { value: "alcorcon", label: "Alcorcón" },
          ]}
          value={ciudad}
          onChange={setCiudad}
          comboboxProps={{ withinPortal: false }}
        />

        {/* Operación */}
        <Select
          label="Tipo de operación"
          data={[
            { value: "rent", label: "Alquiler" },
            { value: "sale", label: "Venta" },
          ]}
          value={operation}
          onChange={setOperation}
          comboboxProps={{ withinPortal: false }}
        />

        <Divider />

        {loading && <Loader color="teal" size="sm" />}

        {stats && ciudad !== "todas" ? (
          <>
            <Group justify="center" gap={6}>
              <Coins size={18} />
              <Text fw={500}>Precio (€)</Text>
            </Group>
            <RangeSlider
              min={stats.price.min}
              max={stats.price.max}
              step={50}
              value={priceRange}
              onChange={setPriceRange}
            />

            <Group justify="center" gap={6}>
              <Ruler size={18} />
              <Text fw={500}>Tamaño (m²)</Text>
            </Group>
            <RangeSlider
              min={stats.size.min}
              max={stats.size.max}
              step={5}
              value={sizeRange}
              onChange={setSizeRange}
            />

            <Group justify="center" gap={6}>
              <Star size={18} />
              <Text fw={500}>Score (0–100)</Text>
            </Group>
            <RangeSlider
              min={stats.score.min}
              max={stats.score.max}
              step={5}
              value={scoreRange}
              onChange={setScoreRange}
            />

            {/* Filtros avanzados */}
            <Accordion mt="md" variant="separated" radius="md">
              <Accordion.Item value="advanced">
                <Accordion.Control icon={<Settings2 size={18} />}>
                  Filtros avanzados
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="sm" mt="xs">
                    <NumberInput
                      label="Habitaciones mínimas"
                      placeholder="Ej. 2"
                      value={rooms}
                      onChange={setRooms}
                      min={0}
                    />
                    <NumberInput
                      label="Planta"
                      placeholder="Ej. 3"
                      value={floor}
                      onChange={setFloor}
                      min={0}
                    />
                    <Divider />
                    <Checkbox
                      label="Ascensor"
                      checked={hasLift}
                      onChange={(e) => setHasLift(e.currentTarget.checked)}
                    />
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </>
        ) : ciudad !== "todas" && !loading ? (
          <Text c="dimmed" size="sm" ta="center">
            No hay estadísticas disponibles para esta zona/operación.
            <br />
            Ejecuta <b>/seed-idealista</b> si necesitas más datos.
          </Text>
        ) : null}

        <Divider />

        <Group justify="flex-end" mt="md">
          <Button variant="light" color="gray" onClick={onClose}>
            Cancelar
          </Button>
          <Button color="teal" onClick={buscarPisos} disabled={loading || !ciudad || !operation}>
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
}