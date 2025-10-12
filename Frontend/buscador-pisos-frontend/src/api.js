import axios from 'axios';

const API_URL = "http://localhost:8000";

export async function obtenerPropiedades(ciudad = "vallecas", operacion = "rent") {
  const res = await axios.get(`${API_URL}/buscar`, {
    params: { ciudad, operation: operacion }
  });
  return res.data.propiedades || [];
}
