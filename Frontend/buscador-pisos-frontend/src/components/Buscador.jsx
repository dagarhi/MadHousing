import { useState } from "react";
import axios from "axios";

export default function Buscador({ onResultados }) {
  const [ciudad, setCiudad] = useState("");
  const [operation, setOperation] = useState("rent");

  // 🔍 Buscar pisos en la base de datos (usando la BD de prueba ahora mismo)
  const buscarPisos = async () => {
    if (!ciudad) return alert("Selecciona una zona");
    try {
      const res = await axios.get("http://localhost:8000/buscar", {
        params: {
          ciudad,
          operation,
          source: "test", // 👈 muy importante para leer pisos_test.db
        },
      });
      onResultados(res.data.propiedades || []);
    } catch (err) {
      alert("Error al buscar pisos: " + err.message);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <label>
        Zona:&nbsp;
        <select value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
          <option value="">Selecciona zona</option>
          <option value="vallecas">Vallecas</option>
          <option value="alcorcon">Alcorcón</option>
        </select>
      </label>

      <label style={{ marginLeft: "10px" }}>
        Tipo:&nbsp;
        <select value={operation} onChange={(e) => setOperation(e.target.value)}>
          <option value="rent">Alquiler</option>
          <option value="sale">Venta</option>
        </select>
      </label>

      <button style={{ marginLeft: "10px" }} onClick={buscarPisos}>
        Buscar
      </button>
    </div>
  );
}
