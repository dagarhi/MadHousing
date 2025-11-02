import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  Drawer,
  Stack,
  Text,
  Divider,
  Loader,
  Box,
  SegmentedControl,
} from "@mantine/core";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  LabelList,
} from "recharts";

export default function DrawerEstadisticas({ opened, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tipoOperacion, setTipoOperacion] = useState("sale");
  const [metrica, setMetrica] = useState("precio_medio");

  useEffect(() => {
    if (opened) {
      setLoading(true);
      axios
        .get("http://localhost:8000/estadisticas-globales")
        .then((res) => setStats(res.data))
        .catch((err) => console.error("Error cargando estadísticas:", err))
        .finally(() => setLoading(false));
    }
  }, [opened]);

  const datos = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats)
        .map(([zona, valores]) => {
            const v = valores?.[tipoOperacion] || {};
            const num =
            typeof v?.[metrica] === "number"
                ? v[metrica]
                : Number(v?.[metrica]) || 0;
            return { zona, valor: num };
        })
        .filter((z) => z.valor > 0);

  }, [stats, tipoOperacion, metrica]);

  const etiquetas = {
    precio_medio: "💶 Precio medio (€)",
    tamano_medio: "📏 Tamaño medio (m²)",
    score_medio: "⭐ Score medio (0–100)",
  };
  const etiquetasOperacion = {
    sale: "Venta",
    rent: "Alquiler",
  };
  const colorBarra = tipoOperacion === "sale" ? "#228be6" : "#20c997";

  if (loading) {
    return (
      <Drawer
        opened={opened}
        onClose={onClose}
        title="Estadísticas por zona"
        position="right"
        size="lg"
        withinPortal={false}
        zIndex={99999}
      >
        <Loader color="blue" mt="md" />
      </Drawer>
    );
  }

  if (!stats) return null;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>📊 Estadísticas por zona</Text>}
      position="right"
      size="lg"
      overlayProps={{ opacity: 0.4, blur: 3 }}
      withinPortal={false}
      zIndex={99999}
    >
      <Stack gap="md" mt="sm">
        {/* Selector de tipo de operación */}
        <SegmentedControl
          fullWidth
          value={tipoOperacion}
          onChange={setTipoOperacion}
          data={[
            { label: "🏠 Venta", value: "sale" },
            { label: "🔑 Alquiler", value: "rent" },
          ]}
        />

        {/* Selector de métrica */}
        <SegmentedControl
          fullWidth
          value={metrica}
          onChange={setMetrica}
          data={[
            { label: "💶 Precio", value: "precio_medio" },
            { label: "📏 Tamaño", value: "tamano_medio" },
            { label: "⭐ Score", value: "score_medio" },
          ]}
        />

        <Divider />

        {/* Gráfico */}
        <Box>
          <Text fw={500} mb="xs">
            {etiquetas[metrica]} — {etiquetasOperacion[tipoOperacion]}
          </Text>

          <ResponsiveContainer width="100%" height={500}>
            <BarChart
              key={`${tipoOperacion}-${metrica}`} // fuerza re-render
              data={datos}
              margin={{ top: 20, right: 30, left: 0, bottom: 80 }}
            >
              <XAxis
                dataKey="zona"
                angle={-45}
                textAnchor="end"
                interval={0}
                height={80}
              />
              <YAxis
                domain={
                  metrica === "score_medio" ? [0, 100] : ["auto", "auto"]
                }
              />
              <ChartTooltip />
              <Bar
                dataKey="valor"
                fill={colorBarra}
                name={etiquetasOperacion[tipoOperacion]}
              >
                <LabelList
                  dataKey="valor"
                  position="top"
                  fontSize={10}
                  formatter={(v) =>
                    metrica === "score_medio"
                      ? Number(v).toFixed(1)
                      : Math.round(Number(v)).toLocaleString()
                  }
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Stack>
    </Drawer>
  );
}