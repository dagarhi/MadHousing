import { useState } from "react";
import PantallaInicial from "./components/PantallaInicial";
import VistaMapa from "./components/VistaMapa";

export default function App() {
  const [entrado, setEntrado] = useState(false);

  return entrado ? (
    <VistaMapa />
  ) : (
    <PantallaInicial onEntrarMapa={() => setEntrado(true)} />
  );
}
