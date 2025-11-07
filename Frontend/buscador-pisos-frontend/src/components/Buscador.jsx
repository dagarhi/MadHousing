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

// 🔁 Trae TODAS las páginas respetando el límite del backend (per_page <= 100)
async function fetchTodasLasPaginasBuscar(paramsBase) {
  const per_page = 100; // ← el backend limita a 100 en /buscar
  let page = 1;
  let acumulado = [];

  while (true) {
    const res = await axios.get("http://localhost:8000/buscar", {
      params: { ...paramsBase, page, per_page },
    });
    const data = res.data;
    const chunk = Array.isArray(data?.propiedades) ? data.propiedades : [];
    acumulado = acumulado.concat(chunk);

    const total = data?.total ?? chunk.length;
    const porPagina = data?.por_pagina ?? per_page;
    if (page * porPagina >= total || chunk.length === 0) break;
    page += 1;
  }
  return acumulado;
}

export default function Buscador({ onResultados, opened, onClose }) {
  const [zonas, setZonas] = useState({});
  const [ciudad, setCiudad] = useState("");
  const [distrito, setDistrito] = useState("");
  const [barrio, setBarrio] = useState("");
  const [operation, setOperation] = useState("rent");
  const [stats, setStats] = useState(null);
  const [priceRange, setPriceRange] = useState([0, 0]);
  const [sizeRange, setSizeRange] = useState([0, 0]);
  const [scoreRange, setScoreRange] = useState([0, 100]);
  const [rooms, setRooms] = useState(null);
  const [floor, setFloor] = useState(null);
  const [hasLift, setHasLift] = useState(false);
  const [loading, setLoading] = useState(false);
  const [noData, setNoData] = useState(false);
  const [loadingZonas, setLoadingZonas] = useState(true);

  // 📦 Jerarquía de zonas
  useEffect(() => {
    const cargarZonas = async () => {
      try {
        const res = await axios.get("http://localhost:8000/zonas-jerarquicas");
        setZonas(res.data || {});
      } catch (err) {
        console.error("Error cargando zonas:", err);
      } finally {
        setLoadingZonas(false);
      }
    };
    cargarZonas();
  }, []);

  // 🔄 Reset dependientes
  useEffect(() => {
    setDistrito("");
    setBarrio("");
  }, [ciudad]);
  useEffect(() => setBarrio(""), [distrito]);

  // 🔍 Selects dinámicos
  const ciudadesOptions =
    Object.keys(zonas || {}).length > 0
      ? Object.keys(zonas).map((c) => ({ value: c, label: c }))
      : [];

  const distritosOptions = ciudad
    ? Object.keys(zonas[ciudad] || {}).map((d) => ({ value: d, label: d }))
    : [];

  const barriosOptions =
    ciudad && distrito
      ? (zonas[ciudad][distrito] || []).map((b) => ({ value: b, label: b }))
      : [];

  // 📊 Cargar estadísticas cuando cambian zona/operación
  useEffect(() => {
    const cargarStats = async () => {
      const zonaSeleccionada = barrio || distrito || ciudad;
      if (!zonaSeleccionada) return;
      setLoading(true);
      try {
        // 👇 per_page = 100 (el backend limita a 100 en /buscar)
        const res = await axios.get("http://localhost:8000/buscar", {
          params: { ciudad: zonaSeleccionada, operation, page: 1, per_page: 100 },
        });
        const props = res.data?.propiedades ?? [];
        const s = res.data?.stats ?? {};

        const rangosValidos =
          s.price &&
          s.size &&
          s.score &&
          (s.price.max > s.price.min ||
            s.size.max > s.size.min ||
            s.score.max > s.score.min);

        if (props.length > 0 && rangosValidos) {
          setStats(s);
          setNoData(false);
          setPriceRange([s.price.min, s.price.max]);
          setSizeRange([s.size.min, s.size.max]);
          setScoreRange([s.score.min, s.score.max]);
        } else {
          setStats(null);
          setNoData(true);
        }
      } catch (err) {
        console.error("Error cargando stats:", err);
        setStats(null);
        setNoData(true);
      } finally {
        setLoading(false);
      }
    };
    cargarStats();
  }, [ciudad, distrito, barrio, operation]);

  // 🔎 Buscar pisos (todas las páginas)
  const buscarPisos = async () => {
    const zonaSeleccionada = barrio || distrito || ciudad;
    if (!zonaSeleccionada) return alert("Selecciona una zona válida");
    if (noData) return alert("No hay datos disponibles para esta zona");

    try {
      setLoading(true);
      const params = { ciudad: zonaSeleccionada, operation };

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

      const todas = await fetchTodasLasPaginasBuscar(params);
      onResultados(todas, params);
      onClose();
    } catch (err) {
      alert("Error al buscar pisos: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 🧭 Mostrar todos los datos de una operación (usa /buscar-todo, allí sí permiten 1000)
  const mostrarTodos = async () => {
    try {
      setLoading(true);
      const per_page = 1000; // /buscar-todo permite hasta 1000 (backend)
      let page = 1;
      let out = [];
      while (true) {
        const res = await axios.get("http://localhost:8000/buscar-todo", {
          params: { operation, page, per_page },
        });
        const data = res.data;
        const chunk = Array.isArray(data?.propiedades) ? data.propiedades : [];
        out = out.concat(chunk);
        const total = data?.total ?? chunk.length;
        if (page * per_page >= total || chunk.length === 0) break;
        page += 1;
      }
      onResultados(out, { operation, mostrarTodo: true });
      onClose();
    } catch (err) {
      alert("Error al cargar todos los datos: " + err.message);
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
        {loadingZonas ? (
          <Loader color="teal" mt="md" />
        ) : Object.keys(zonas).length === 0 ? (
          <Text c="dimmed" ta="center">No hay zonas disponibles.</Text>
        ) : (
          <>
            <Select
              label="Ciudad / Municipio"
              placeholder="Selecciona ciudad"
              data={ciudadesOptions}
              value={ciudad}
              onChange={setCiudad}
              searchable
              comboboxProps={{ withinPortal: false }}
            />

            <Select
              label="Distrito"
              placeholder="Selecciona distrito"
              data={distritosOptions}
              value={distrito}
              onChange={setDistrito}
              disabled={!ciudad}
              searchable
              comboboxProps={{ withinPortal: false }}
            />

            <Select
              label="Barrio"
              placeholder="Selecciona barrio"
              data={barriosOptions}
              value={barrio}
              onChange={setBarrio}
              disabled={!distrito || barriosOptions.length === 0}
              searchable
              comboboxProps={{ withinPortal: false }}
            />
          </>
        )}

        <Select
          label="Tipo de operación"
          data={[
            { value: "rent", label: "Alquiler" },
            { value: "sale", label: "Venta" },
          ]}
          value={operation}
          onChange={setOperation}
          searchable
          comboboxProps={{ withinPortal: false }}
        />

        <Divider />

        {loading && <Loader color="teal" size="sm" />}
        {!loading && noData && (
          <Text c="dimmed" ta="center" mt="md">
            No hay datos disponibles para esta zona en {operation === "rent" ? "alquiler" : "venta"}.
          </Text>
        )}

        {!loading && stats && !noData && (
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

            <Accordion mt="md" variant="separated" radius="md">
              <Accordion.Item value="advanced">
                <Accordion.Control icon={<Settings2 size={18} />}>
                  Filtros avanzados
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="sm" mt="xs">
                    <NumberInput
                      label="Habitaciones mínimas"
                      value={rooms}
                      onChange={setRooms}
                      min={0}
                    />
                    <NumberInput
                      label="Planta"
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
        )}

        <Divider />

        <Group justify="space-between" mt="md">
          <Button variant="light" color="gray" onClick={onClose}>
            Cancelar
          </Button>

          <Group>
            <Button variant="light" color="blue" onClick={mostrarTodos} disabled={loading}>
              Mostrar todos los datos
            </Button>

            <Button color="teal" onClick={buscarPisos} disabled={loading || !ciudad || noData}>
              {loading ? "Buscando..." : "Buscar"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Drawer>
  );
}
