import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// 🔧 Componente auxiliar que fuerza el resize al montar el mapa
function FixMapResize() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [map]);
  return null;
}

export default function MapaPisos({ pisos = [] }) {
  const getColorByScore = (score) => {
    if (score >= 70) return "green";
    if (score >= 40) return "orange";
    return "red";
  };

  const crearIcono = (color) =>
    new L.Icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

  return (
    <MapContainer
      center={[40.4, -3.7]}
      zoom={12}
      style={{ height: "100%", width: "100%" }}
    >
      <FixMapResize /> {/* 👈 fuerza recalculado al montar */}
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pisos.map((p, i) => {
        const score = p.score ?? 0;
        const color = getColorByScore(score);
        const icono = crearIcono(color);
        return (
          <Marker key={i} position={[p.latitude, p.longitude]} icon={icono}>
            <Popup>
              <b>{p.address || "Dirección desconocida"}</b>
              <br />
              {p.price} € — {p.size} m²
              <br />
              🏅 <b>Score:</b> {score}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
