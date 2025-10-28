import { useState } from "react";
import Buscador from  "./components/Buscador"
import MapaPisos from "./components/MapaPisos"
import "leaflet/dist/leaflet.css";

export default function App() {
  const [pisos, setPisos] = useState([]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",      // Pantalla completa
      width: "100vw",
      overflow: "hidden"
    }}>
      {/* HEADER */}
      <header style={{
        backgroundColor: "#2d3748",
        color: "white",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
      }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>🏠 Buscador de Pisos</h1>
        <div>
          <Buscador onResultados={setPisos} />
        </div>
      </header>

      {/* MAPA */}
      <main style={{ flex: 1 }}>
        <MapaPisos pisos={pisos} />
      </main>
    </div>
  );
}
