import {
  Drawer,
  ScrollArea,
  Stack,
  Box,
  Text,
  Divider,
  Group,
  Button,
} from "@mantine/core";
import { useEffect, useState } from "react";

export default function DrawerFavoritos({ opened, onClose, favoritos, setFavoritos }) {
  const [lista, setLista] = useState(favoritos || []);

  // 🔁 Sincroniza al abrir o cambiar favoritos
  useEffect(() => {
    setLista(favoritos || []);
  }, [favoritos, opened]);

  // ❌ Eliminar un solo favorito por propertyCode
  const eliminar = (propertyCode) => {
    const nueva = lista.filter((f) => f.propertyCode !== propertyCode);
    setLista(nueva);
    setFavoritos(nueva);
  };

  // 🧹 Eliminar todos
  const borrarTodos = () => {
    setLista([]);
    setFavoritos([]);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>Mis pisos favoritos</Text>}
      position="right"
      size="md"
      overlayProps={{ opacity: 0.4, blur: 3 }}
      withinPortal={false}
      zIndex={99999}
    >
      {lista.length === 0 ? (
        <Text c="dimmed" ta="center" mt="lg">
          No tienes pisos guardados aún.
        </Text>
      ) : (
        <ScrollArea h="calc(100vh - 140px)">
          <Stack gap="sm">
            {lista.map((p) => (
              <Box
                key={p.propertyCode}
                p="sm"
                style={{
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "var(--mantine-color-body)",
                }}
              >
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={500}>{p.address || "Dirección desconocida"}</Text>
                    <Text size="sm" c="dimmed">
                      {p.price ? `${p.price.toLocaleString()} €` : "Sin precio"} —{" "}
                      {p.size ? `${p.size} m²` : "Sin tamaño"}
                    </Text>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#228be6", fontSize: "0.9em" }}
                      >
                        Ver en Idealista
                      </a>
                    )}
                  </div>

                  <Button
                    color="red"
                    size="xs"
                    variant="light"
                    onClick={() => eliminar(p.propertyCode)}
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
          Borrar todos
        </Button>
      </Group>
    </Drawer>
  );
}
