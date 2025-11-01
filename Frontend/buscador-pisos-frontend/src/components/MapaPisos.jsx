import { Box, Text, Divider, Stack, Group, useMantineColorScheme } from "@mantine/core";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { renderToString } from "react-dom/server";
import {
  Coins,
  Ruler,
  BedDouble,
  Bath,
  Building2,
  ExternalLink,
  Building,
  ArrowUpNarrowWide,
  Star,
  MapPin,
} from "lucide-react";

// Elimina el icono por defecto de Leaflet (evita warnings)
delete L.Icon.Default.prototype._getIconUrl;

function FixMapResize() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

// 🔴🟢 Escala de color rojo → verde (usando HSL)
function getColorByScore(score) {
  const t = Math.max(0, Math.min(1, score / 100)); // normaliza 0–1
  const hue = 120 * t; // 0 = rojo, 120 = verde
  return `hsl(${hue}, 80%, 45%)`;
}

// Genera el icono SVG coloreado dinámicamente según el score
function crearIcono(score) {
  const color = getColorByScore(score);
  const html = renderToString(
    <MapPin color={color} fill={color} size={32} strokeWidth={1.5} />
  );

  return L.divIcon({
    html,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

export default function MapaPisos({ pisos = [] }) {
  const { colorScheme } = useMantineColorScheme();
  const dark = colorScheme === "dark";

  const tileLayerUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  return (
    <Box w="100%" h="100%">
      {/* Limpieza visual del popup */}
      <style>{`
        .popup-clean.leaflet-popup,
        .popup-clean .leaflet-popup-content-wrapper,
        .popup-clean .leaflet-popup-content,
        .popup-clean .leaflet-popup-tip,
        .popup-clean .leaflet-popup-tip-container {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          outline: none !important;
        }
        .popup-clean .leaflet-popup-content {
          margin: 0 !important;
          padding: 0 !important;
        }
        .popup-clean a.leaflet-popup-close-button {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
      `}</style>

      <MapContainer
        center={[40.4, -3.7]}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
      >
        <FixMapResize />
        <TileLayer url={tileLayerUrl} />

        {pisos.map((p, i) => {
          const score = p.score_intrinseco ?? 0;
          const icono = crearIcono(score);

          return (
            <Marker key={i} position={[p.latitude, p.longitude]} icon={icono}>
              <Popup className="popup-clean" maxWidth={380} minWidth={260}>
                <div
                  style={{
                    maxWidth: 360,
                    fontSize: "0.9rem",
                    lineHeight: "1.3em",
                    backgroundColor: dark ? "#2C2E33" : "#fff",
                    color: dark ? "#f1f1f1" : "#111",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: dark
                      ? "0 2px 6px rgba(0,0,0,0.4)"
                      : "0 2px 6px rgba(0,0,0,0.1)",
                  }}
                >
                  <Stack gap={4} style={{ lineHeight: 1.3 }}>
                    {/* Dirección */}
                    <Group gap={6} align="center" justify="center">
                      <Building2 size={18} />
                      <Text fw={600} size="md" ta="center">
                        {p.address || "Dirección no especificada"}
                      </Text>
                    </Group>

                    <Text size="xs" c="dimmed" ta="center" mb={2}>
                      {p.district || "Distrito desconocido"} —{" "}
                      {p.neighborhood || "Barrio desconocido"}
                    </Text>

                    <Divider my={6} color={dark ? "#444" : "#ccc"} />

                    {/* Información principal */}
                    <Stack gap={0.2}>
                      {[
                        [<Coins size={18} />, `Precio: ${p.price ? `${p.price.toLocaleString()} €` : "N/D"}`],
                        [<Ruler size={18} />, `Tamaño: ${p.size ? `${p.size.toFixed(1)} m²` : "N/D"}`],
                        [<BedDouble size={18} />, `Habitaciones: ${p.rooms ?? "N/D"}`],
                        [<Bath size={18} />, `Baños: ${p.bathrooms ?? "N/D"}`],
                        [<Building size={18} />, `Planta: ${p.floor || "N/D"}`],
                        [<ArrowUpNarrowWide size={18} />, `Ascensor: ${p.hasLift ? "Sí" : "No"}`],
                      ].map(([icono, texto], idx) => (
                        <Group key={idx} gap={6} align="center" justify="center">
                          {icono}
                          <Text size="sm">{texto}</Text>
                        </Group>
                      ))}
                    </Stack>

                    <Divider my={6} color={dark ? "#444" : "#ccc"} />

                    {/* Score */}
                    <Group gap={6} align="center" justify="center">
                      <Star size={18} />
                      <Text size="sm">
                        Score: {Number.isFinite(p.score_intrinseco) ? p.score_intrinseco.toFixed(1) : "N/D"}
                      </Text>
                    </Group>

                    {/* Enlace */}
                    {p.url && (
                      <Group gap={6} mt={6} justify="center">
                        <ExternalLink size={18} />
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: dark ? "#4dabf7" : "#228be6",
                            fontSize: "0.95em",
                            textDecoration: "none",
                          }}
                        >
                          Ver en Idealista
                        </a>
                      </Group>
                    )}
                  </Stack>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </Box>
  );
}
