import { useEffect, useRef, useMemo, useState } from "react";
import { Box, Button, MantineProvider, useComputedColorScheme } from "@mantine/core";
import maplibregl from "maplibre-gl";
import ReactDOM from "react-dom/client";
import PopupCard from "./PopupCard";
import { useFavoritos } from "../context/FavoritosContext";
import "maplibre-gl/dist/maplibre-gl.css";

// 🔹 Normalizador
const norm = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export default function MapaPrincipal({ pisos = [] }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [modo, setModo] = useState("coropletico");
  const colorScheme = useComputedColorScheme("light", { getInitialValueInEffect: true });
  const isDark = colorScheme === "dark";
  const { favoritos, toggleFavorito } = useFavoritos();

  // 🔸 Calcular medias por municipio
  const mediasPorMunicipio = useMemo(() => {
    const acc = new Map();
    for (const p of pisos) {
      const muni = norm(p.city || p.neighborhood || p.district || "desconocido");
      const v = Number(p.score_intrinseco ?? p.score ?? 0);
      if (!Number.isFinite(v)) continue;
      const cur = acc.get(muni) || { total: 0, n: 0 };
      cur.total += v;
      cur.n += 1;
      acc.set(muni, cur);
    }
    const out = {};
    for (const [k, { total, n }] of acc) out[k] = total / n;
    return out;
  }, [pisos]);

  // 🔹 Inicializar mapa
  useEffect(() => {
    if (!mapContainer.current) return;

    const styleUrl =
      colorScheme === "dark"
        ? "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json"
        : "https://tiles.stadiamaps.com/styles/alidade_smooth.json";

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl,
      center: [-3.7038, 40.4168],
      zoom: 9.2,
    });
    mapRef.current = map;

    map.on("load", async () => {
      const res = await fetch("/municipios_cam.geojson");
      const geojson = await res.json();

      // Enriquecer con medias
      for (const f of geojson.features) {
        const nombre = norm(f.properties?.NAMEUNIT);
        f.properties.valor = mediasPorMunicipio[nombre] ?? null;
      }

      map.addSource("muni_cam", { type: "geojson", data: geojson });

      map.addLayer({
        id: "muni-fill",
        type: "fill",
        source: "muni_cam",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "valor"], 0],
            0, "#f1eef6",
            40, "#bdc9e1",
            60, "#74a9cf",
            80, "#2b8cbe",
            100, "#045a8d",
          ],
          "fill-opacity": [
            "case",
            ["==", ["get", "valor"], null],
            0.18,
            0.7,
          ],
        },
      });

      map.addLayer({
        id: "muni-line",
        type: "line",
        source: "muni_cam",
        paint: { "line-color": isDark ? "#aaa" : "#333", "line-width": 0.8 },
      });

      // Tooltip simple
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      map.on("mousemove", "muni-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const nombre = norm(f.properties?.NAMEUNIT);
        const valor = mediasPorMunicipio[nombre];
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:system-ui; font-size:13px;
                        background:${isDark ? "#2C2E33" : "#fff"};
                        color:${isDark ? "#f1f1f1" : "#111"};
                        padding:8px; border-radius:6px;
                        box-shadow:0 2px 4px rgba(0,0,0,0.4);">
              <strong>${nombre}</strong><br/>
              ${valor == null ? "Sin datos" : `Score medio: ${valor.toFixed(1)}`}
            </div>`
          )
          .addTo(map);
      });
      map.on("mouseleave", "muni-fill", () => popup.remove());
    });

    return () => map.remove();
  }, [mediasPorMunicipio, colorScheme, isDark]);

  // 🔸 Crear marcadores (modo "pins")
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    // Borrar marcadores anteriores
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Solo si modo = "pins"
    if (modo !== "pins") return;

    const nuevos = [];
    pisos.forEach((p) => {
      const lat = Number(p.latitude ?? p.lat ?? p.location?.lat);
      const lon = Number(p.longitude ?? p.lng ?? p.location?.lon ?? p.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const color =
        p.score_intrinseco >= 70
          ? "#2ecc71"
          : p.score_intrinseco >= 50
          ? "#f1c40f"
          : "#e74c3c";

      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = color;
      el.style.border = `2px solid ${isDark ? "#fff" : "#000"}`;
      el.style.boxShadow = "0 0 6px rgba(0,0,0,0.5)";

      // 📍 Crear popup con Mantine (sin providers duplicados)
      const popupNode = document.createElement("div");
      ReactDOM.createRoot(popupNode).render(
        <MantineProvider
          defaultColorScheme={isDark ? "dark" : "light"}
          theme={{ colorScheme: isDark ? "dark" : "light" }}
        >
          <PopupCard
            piso={p}
            isDark={isDark}
            favoritos={favoritos}
            toggleFavorito={toggleFavorito}
          />
        </MantineProvider>
      );

      const popup = new maplibregl.Popup({ offset: 12 }).setDOMContent(popupNode);
      const marker = new maplibregl.Marker(el).setLngLat([lon, lat]).setPopup(popup);
      marker.addTo(map);
      nuevos.push(marker);
    });

    markersRef.current = nuevos;
  }, [modo, pisos, isDark, favoritos, toggleFavorito]);

  return (
    <Box style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

      {/* Botón de alternancia */}
      <Button
        variant="filled"
        color={modo === "coropletico" ? "blue" : "teal"}
        radius="xl"
        size="md"
        onClick={() =>
          setModo((prev) => (prev === "coropletico" ? "pins" : "coropletico"))
        }
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          zIndex: 5000,
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
        }}
      >
        {modo === "coropletico"
          ? "Mostrar chinchetas"
          : "Mostrar mapa coroplético"}
      </Button>
    </Box>
  );
}
