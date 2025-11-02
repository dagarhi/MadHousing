import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Drawer,
  Stack,
  Text,
  Divider,
  Loader,
  Select,
  Group,
  Box,
  SegmentedControl,
  Table,
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

export default function DrawerComparador({ opened, onClose }) {
  const [stats, setStats] = useState(null); // { [district]: { sale:{...}, rent:{...} } }
  const [loading, setLoading] = useState(false);
  const [zonaA, setZonaA] = useState(null); // district
  const [zonaB, setZonaB] = useState(null); // district
  const [tipoOperacion, setTipoOperacion] = useState("sale");

  // Cargar estadísticas por distrito
  useEffect(() => {
    if (!opened) return;
    setLoading(true);
    axios
      .get("http://localhost:8000/estadisticas-globales")
      .then((res) => setStats(res.data || {}))
      .catch((err) => console.error("Error cargando estadísticas:", err))
      .finally(() => setLoading(false));
  }, [opened]);

  // Zonas con datos para la operación activa (count>0); ignorar "Desconocido" o falsy
  const zonasConDatos = useMemo(() => {
    if (!stats) return [];
    return Object.keys(stats)
      .filter(Boolean)
      .filter((z) => z !== "Desconocido")
      .filter((z) => {
        const op = stats[z]?.[tipoOperacion];
        const count = op?.count ?? 0;
        return count > 0;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [stats, tipoOperacion]);

  // Invalida selecciones si dejan de ser válidas al cambiar operación/datos
  useEffect(() => {
    if (zonaA && !zonasConDatos.includes(zonaA)) setZonaA(null);
    if (zonaB && !zonasConDatos.includes(zonaB)) setZonaB(null);
  }, [zonasConDatos, zonaA, zonaB]);

  if (loading) {
    return (
      <Drawer
        opened={opened}
        onClose={onClose}
        title="Comparador de zonas"
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

  const datosA = zonaA ? stats[zonaA]?.[tipoOperacion] ?? {} : {};
  const datosB = zonaB ? stats[zonaB]?.[tipoOperacion] ?? {} : {};

  const crearDatosChart = (campo) => [
    { zona: zonaA || "Zona A", valor: typeof datosA[campo] === "number" ? datosA[campo] : 0 },
    { zona: zonaB || "Zona B", valor: typeof datosB[campo] === "number" ? datosB[campo] : 0 },
  ];

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>⚖️ Comparador de zonas</Text>}
      position="right"
      size="lg"
      overlayProps={{ opacity: 0.4, blur: 3 }}
      withinPortal={false}
      zIndex={99999}
    >
      <Stack gap="md" mt="sm">
        {zonasConDatos.length === 0 ? (
          <Text c="dimmed" ta="center" mt="md">
            No hay datos disponibles para esta operación.
          </Text>
        ) : (
          <>
            <Group grow>
              <Select
                label="Zona A (district)"
                data={zonasConDatos.map((z) => ({ value: z, label: z }))}
                value={zonaA}
                onChange={setZonaA}
                allowDeselect={false}
                searchable
                comboboxProps={{ withinPortal: false }}
              />
              <Select
                label="Zona B (district)"
                data={zonasConDatos.map((z) => ({ value: z, label: z }))}
                value={zonaB}
                onChange={setZonaB}
                allowDeselect={false}
                searchable
                comboboxProps={{ withinPortal: false }}
              />
            </Group>

            <SegmentedControl
              fullWidth
              value={tipoOperacion}
              onChange={setTipoOperacion}
              data={[
                { label: "🏠 Venta", value: "sale" },
                { label: "🔑 Alquiler", value: "rent" },
              ]}
            />

            <Divider />

            {zonaA && zonaB ? (
              <>
                <Text fw={500}>
                  Comparando <strong>{zonaA}</strong> vs{" "}
                  <strong>{zonaB}</strong> (
                  {tipoOperacion === "sale" ? "Venta" : "Alquiler"})
                </Text>

                {/* Precio medio */}
                <Box>
                  <Text fw={500} mb="xs">💶 Precio medio (€)</Text>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart
                      data={crearDatosChart("precio_medio")}
                      margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                    >
                      <XAxis dataKey="zona" />
                      <YAxis />
                      <ChartTooltip />
                      <Bar dataKey="valor" fill="#228be6">
                        <LabelList
                          dataKey="valor"
                          position="top"
                          fontSize={10}
                          formatter={(v) =>
                            typeof v === "number" ? Math.round(v).toLocaleString() : v
                          }
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>

                {/* Tamaño medio */}
                <Box>
                  <Text fw={500} mb="xs">📏 Tamaño medio (m²)</Text>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart
                      data={crearDatosChart("tamano_medio")}
                      margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                    >
                      <XAxis dataKey="zona" />
                      <YAxis />
                      <ChartTooltip />
                      <Bar dataKey="valor" fill="#20c997">
                        <LabelList
                          dataKey="valor"
                          position="top"
                          fontSize={10}
                          formatter={(v) =>
                            typeof v === "number" ? v.toFixed(1) : v
                          }
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>

                {/* Score medio */}
                <Box>
                  <Text fw={500} mb="xs">⭐ Score medio</Text>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart
                      data={crearDatosChart("score_medio")}
                      margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                    >
                      <XAxis dataKey="zona" />
                      <YAxis domain={[0, 100]} />
                      <ChartTooltip />
                      <Bar dataKey="valor" fill="#f59f00">
                        <LabelList
                          dataKey="valor"
                          position="top"
                          fontSize={10}
                          formatter={(v) =>
                            typeof v === "number" ? v.toFixed(1) : v
                          }
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>

                {/* Número de pisos */}
                <Box>
                  <Text fw={500} mb="xs">🏠 Número de pisos</Text>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart
                      data={crearDatosChart("count")}
                      margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                    >
                      <XAxis dataKey="zona" />
                      <YAxis />
                      <ChartTooltip />
                      <Bar dataKey="valor" fill="#7950f2">
                        <LabelList dataKey="valor" position="top" fontSize={10} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>

                <Divider />

                <Box>
                  <Table striped highlightOnHover withTableBorder>
                    <thead>
                      <tr>
                        <th>Métrica</th>
                        <th>{zonaA}</th>
                        <th>{zonaB}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Precio medio (€)</td>
                        <td>{datosA.precio_medio?.toLocaleString?.() ?? "—"}</td>
                        <td>{datosB.precio_medio?.toLocaleString?.() ?? "—"}</td>
                      </tr>
                      <tr>
                        <td>Tamaño medio (m²)</td>
                        <td>{typeof datosA.tamano_medio === "number" ? datosA.tamano_medio.toFixed(1) : "—"}</td>
                        <td>{typeof datosB.tamano_medio === "number" ? datosB.tamano_medio.toFixed(1) : "—"}</td>
                      </tr>
                      <tr>
                        <td>Score medio</td>
                        <td>{typeof datosA.score_medio === "number" ? datosA.score_medio.toFixed(1) : "—"}</td>
                        <td>{typeof datosB.score_medio === "number" ? datosB.score_medio.toFixed(1) : "—"}</td>
                      </tr>
                      <tr>
                        <td>Nº de pisos</td>
                        <td>{datosA.count ?? "—"}</td>
                        <td>{datosB.count ?? "—"}</td>
                      </tr>
                    </tbody>
                  </Table>
                </Box>
              </>
            ) : (
              <Text c="dimmed" ta="center" mt="md">
                Selecciona dos zonas para comparar.
              </Text>
            )}
          </>
        )}
      </Stack>
    </Drawer>
  );
}
