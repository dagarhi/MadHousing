import {
  Drawer,
  ScrollArea,
  Stack,
  Box,
  Text,
  Divider,
  Group,
  Button,
  Badge,
} from "@mantine/core";
import { useEffect, useState } from "react";

export default function DrawerHistorial({ opened, onClose, historial, setHistorial }) {
  const [lista, setLista] = useState(historial || []);

  // 🔁 Sincronizar lista local con props cada vez que cambia el historial o se abre
  useEffect(() => {
    setLista(historial || []);
  }, [historial, opened]);

  // ❌ Eliminar una búsqueda concreta
  const eliminar = (fecha) => {
    const nueva = lista.filter((f) => f.fecha !== fecha);
    setLista(nueva);
    setHistorial(nueva);
  };

  // 🧹 Borrar todo el historial
  const borrarTodos = () => {
    setLista([]);
    setHistorial([]);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>Historial de búsquedas</Text>}
      position="right"
      size="md"
      overlayProps={{ opacity: 0.4, blur: 3 }}
      withinPortal={false}
      zIndex={99999}
    >
      {lista.length === 0 ? (
        <Text c="dimmed" ta="center" mt="lg">
          No hay búsquedas recientes.
        </Text>
      ) : (
        <ScrollArea h="calc(100vh - 140px)">
          <Stack gap="sm">
            {lista.map((h, i) => (
              <Box
                key={i}
                p="sm"
                style={{
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "var(--mantine-color-body)",
                }}
              >
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={500}>{h.fecha}</Text>
                    <Text size="sm" mt={4}>
                      <strong>Zona:</strong> {h.ciudad || "N/D"} —{" "}
                      <strong>{h.operation === "rent" ? "Alquiler" : "Venta"}</strong>
                    </Text>

                    {h.filtros && (
                      <Text size="sm" c="dimmed" mt={2}>
                        {h.filtros.min_price && h.filtros.max_price
                          ? `💶 ${h.filtros.min_price}–${h.filtros.max_price} €`
                          : ""}
                        {"  "}
                        {h.filtros.min_size && h.filtros.max_size
                          ? `📏 ${h.filtros.min_size}–${h.filtros.max_size} m²`
                          : ""}
                      </Text>
                    )}

                    <Badge color="blue" size="sm" mt={4}>
                      {h.cantidad ?? 0} resultados
                    </Badge>
                  </div>

                  <Button
                    color="red"
                    size="xs"
                    variant="light"
                    onClick={() => eliminar(h.fecha)}
                  >
                    Quitar
                  </Button>
                </Group>
              </Box>
            ))}
          </Stack>
        </ScrollArea>
      )}

      <Divider my="md" />
      <Group justify="flex-end">
        <Button variant="light" color="red" onClick={borrarTodos}>
          Borrar historial
        </Button>
      </Group>
    </Drawer>
  );
}
