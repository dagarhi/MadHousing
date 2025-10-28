import { useState } from "react";
import Buscador from "./components/Buscador";
import MapaPisos from "./components/MapaPisos";
import "./App.css";

function App() {
  const [pisos, setPisos] = useState([]);

  return (
    <div>
      <h1>🏠 Buscador de Pisos</h1>
      <Buscador onResultados={setPisos} />
      <MapaPisos pisos={pisos} />
    </div>
  );
}

export default App;
