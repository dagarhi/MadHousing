import { useState } from "react";
import axios from "axios";

export default function Buscador({ onResultados }) {
  const [ciudad, setCiudad] = useState("");
  const [operation, setOperation] = useState("rent");

  // 🔍 Buscar pisos en la base de datos actual (idealista o prueba)
  const buscarPisos = async () => {
    if (!ciudad) return alert("Selecciona una zona");
    try {
      const res = await axios.get("http://localhost:8000/buscar", {
        params: { ciudad, operation },
      });
      onResultados(res.data.propiedades || []);
    } catch (err) {
      alert("Error al buscar pisos: " + err.message);
    }
  };

  // 🧱 Cargar la base de datos de prueba
  const cargarDatosPrueba = async () => {
    try {
      const res = await axios.post("http://localhost:8000/seed-test");
      alert(res.data.mensaje || "Base de datos de prueba cargada");
      await buscarPisos(); // Buscar automáticamente después
    } catch (err) {
      alert("Error al cargar datos de prueba: " + err.message);
    }
  };

  // 🌐 Volver a usar la base de datos real (Idealista/API)
  const usarBaseIdealista = async () => {
    try {
      const res = await axios.post("http://localhost:8000/seed-idealista");
      alert(res.data.mensaje || "Base de datos de Idealista activada");
      await buscarPisos(); // Buscar con la nueva fuente
    } catch (err) {
      alert("Error al cambiar a Idealista: " + err.message);
    }
  };

  return (
    <div style={{ padding: "10px" }}>
      <label>
        Ciudad:&nbsp;
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

      <button style={{ marginLeft: "10px", backgroundColor: "#eee" }} onClick={cargarDatosPrueba}>
        Cargar datos de prueba
      </button>

      <button style={{ marginLeft: "10px", backgroundColor: "#d1ecf1" }} onClick={usarBaseIdealista}>
        Usar datos de Idealista
      </button>
    </div>
  );
}
