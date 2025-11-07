import { Drawer, ScrollArea, Stack, Box, Text, Group, Button, Divider } from "@mantine/core";
import { useFavoritos } from "../context/FavoritosContext";


export default function DrawerFavoritos({ opened, onClose }) {
  const { favoritos, toggleFavorito, borrarTodos } = useFavoritos();

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>Mis pisos favoritos ❤️</Text>}
      position="right"
      size="md"
      overlayProps={{ opacity: 0.4, blur: 3 }}
      withinPortal={false}
      zIndex={99999}
    >
      {favoritos.length === 0 ? (
        <Text c="dimmed" ta="center" mt="lg">
          No tienes pisos guardados aún.
        </Text>
      ) : (
        <ScrollArea h="calc(100vh - 140px)">
          <Stack gap="sm">
            {favoritos.map((p) => (
              <Box
                key={p.propertyCode}
                p="sm"
                style={{
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "var(--mantine-color-body)",
                }}
              >
                <Group justify="space-between">
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
                    onClick={() => toggleFavorito(p)}
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
