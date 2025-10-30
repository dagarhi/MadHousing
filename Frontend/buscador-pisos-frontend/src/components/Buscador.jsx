import { useState } from "react";
import axios from "axios";
import {
  Drawer,
  Button,
  Select,
  Stack,
  Title,
  Divider,
  Group,
} from "@mantine/core";

export default function Buscador({ onResultados, opened, onClose }) {
  const [ciudad, setCiudad] = useState("");
  const [operation, setOperation] = useState("rent");

  const buscarPisos = async () => {
    if (!ciudad) return alert("Selecciona una zona");
    try {
      const res = await axios.get("http://localhost:8000/buscar", {
        params: { ciudad, operation, source: "test" },
      });
      onResultados(res.data.propiedades || []);
      onClose();
    } catch (err) {
      alert("Error al buscar pisos: " + err.message);
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Title order={4}>Filtros de búsqueda</Title>}
      position="right"
      size="sm"
      overlayProps={{ opacity: 0.4, blur: 3 }}
      withinPortal={false} // 👈 MUY IMPORTANTE: desactiva el portal del Drawer
      zIndex={3000}
    >
      <Stack gap="md" mt="sm">
        <Select
          label="Zona"
          placeholder="Selecciona zona"
          data={[
            { value: "vallecas", label: "Vallecas" },
            { value: "alcorcon", label: "Alcorcón" },
          ]}
          value={ciudad}
          onChange={setCiudad}
          withinPortal={false}
          comboboxProps={{ withinPortal: false }} // 👈 fuerza render interno
        />

        <Select
          label="Tipo de operación"
          data={[
            { value: "rent", label: "Alquiler" },
            { value: "sale", label: "Venta" },
          ]}
          value={operation}
          onChange={setOperation}
          withinPortal={false}
          comboboxProps={{ withinPortal: false }}
        />

        <Divider />

        <Group justify="flex-end">
          <Button variant="light" color="gray" onClick={onClose}>
            Cancelar
          </Button>
          <Button color="teal" onClick={buscarPisos}>
            Buscar
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
}


