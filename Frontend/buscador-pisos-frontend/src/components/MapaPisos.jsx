import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

export default function MapaPisos() {
  const [pisos, setPisos] = useState([]);

  const iconoPiso = new L.Icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    shadowSize: [41, 41],
  });

  useEffect(() => {
    const dummy = [
      { latitude: 40.39, longitude: -3.65, price: 950, size: 70, address: "Piso ejemplo 1" },
      { latitude: 40.40, longitude: -3.67, price: 1200, size: 80, address: "Piso ejemplo 2" },
    ];
    setPisos(dummy);
  }, []);

  return (
    <MapContainer center={[40.3875, -3.6570]} zoom={13} style={{ height: "100vh", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pisos.map((p, i) => (
        <Marker key={i} position={[p.latitude, p.longitude]} icon={iconoPiso}>
          <Popup>
            <b>{p.address}</b><br />
            {p.price} €<br />
            {p.size} m²
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
