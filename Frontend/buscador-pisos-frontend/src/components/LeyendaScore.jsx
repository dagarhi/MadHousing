import { useState } from "react";
import { Popover, Button, Stack, Text, Box, Group } from "@mantine/core";
import { Info } from "lucide-react";

export default function LeyendaScore() {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      width={260}
      position="right-start"
      shadow="md"
      opened={opened}
      onChange={setOpened}
      withinPortal={false}   
      zIndex={6000}          
    >
      {/* Botón flotante */}
      <Popover.Target>
        <Button
          variant="filled"
          color="blue"
          size="lg"
          radius="xl"
          onClick={() => setOpened((o) => !o)}
          style={{
            position: "fixed",
            bottom: 30,
            left: 40,
            zIndex: 6000,
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
          leftSection={<Info size={20} />}
        >
          Leyenda
        </Button>
      </Popover.Target>

      {/* Ventanita emergente */}
      <Popover.Dropdown>
        <Stack gap="xs" p="xs">
          <Text fw={600}>Puntuación de los pisos</Text>
          <Text size="sm" c="dimmed">
            El color del marcador representa el score (0–100):
          </Text>

          <Box>
            <div
              style={{
                width: "100%",
                height: "14px",
                borderRadius: "8px",
                background:
                  "linear-gradient(to right, red, orange, yellow, green)",
              }}
            ></div>
          </Box>

          <Group justify="space-between" mt={2}>
            <Text size="xs" c="red.6">0</Text>
            <Text size="xs" c="yellow.7">50</Text>
            <Text size="xs" c="green.6">100</Text>
          </Group>

          <Text size="xs" c="dimmed" mt={4}>
            Rojo = piso caro / poca rentabilidad <br />
            Verde = piso económico / mejor valor
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
