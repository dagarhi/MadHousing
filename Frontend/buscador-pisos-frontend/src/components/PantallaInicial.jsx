import { Box, Button, Title, Text, Stack } from "@mantine/core";

export default function PantallaInicial({ onEntrarMapa }) {
  return (
    <Box
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #3b82f6, #0ea5e9)",
        color: "white",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <Stack align="center" spacing="md" maw={480}>
        <Title order={1}>Buscador de Pisos</Title>
        <Text size="lg" c="rgba(255,255,255,0.9)">
          Explora el mercado inmobiliario de Madrid con mapas interactivos,
          puntuaciones y comparadores de zonas.
        </Text>

        <Button
          color="teal"
          size="lg"
          radius="xl"
          mt="md"
          onClick={onEntrarMapa}
        >
          Explorar mapa
        </Button>

        <Text size="sm" c="rgba(255,255,255,0.6)">
          Proyecto TFG — Universidad Politécnica de Madrid
        </Text>
      </Stack>
    </Box>
  );
}
