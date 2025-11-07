import { useEffect, useRef, useMemo } from "react";
import { Box } from "@mantine/core";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// 🔹 Normalizador: quita tildes, pasa a minúsculas y recorta
const norm = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

// 🔹 Diccionario de equivalencias manuales
const equivalencias = {
  alcorcon: "alcorcon",
  mostoles: "mostoles",
  madrid: "madrid",
  "las rozas": "las rozas de madrid",
  "san sebastian de los reyes": "san sebastian de los reyes",
  "alcala de henares": "alcala de henares",
  "pozuelo de alarcon": "pozuelo de alarcon",
  "san fernando de henares": "san fernando de henares",
  "torrejon de ardoz": "torrejon de ardoz",
  "fuenlabrada": "fuenlabrada",
  "getafe": "getafe",
  "leganes": "leganes",
};

export default function MapaPisosCoropletico({ pisos = [] }) {
  const mapRef = useRef(null);
  const mapContainer = useRef(null);

  // 1) Agregar score por municipio (usamos p.city)
  const mediasPorMunicipio = useMemo(() => {
    const acc = new Map(); // key = municipio normalizado
    for (const p of pisos) {
      const muni = norm(p.city || p.neighborhood || p.district || "desconocido");
      const v = Number(p.score_intrinseco ?? p.score ?? 0);
      if (!Number.isFinite(v)) continue;
      const cur = acc.get(muni) || { total: 0, n: 0 };
      cur.total += v;
      cur.n += 1;
      acc.set(muni, cur);
    }
    const out = Object.create(null);
    for (const [k, { total, n }] of acc) out[k] = total / n;
    return out; // { "madrid": 63.2, "mostoles": 51.8, ... }
  }, [pisos]);

  useEffect(() => {
    if (!mapContainer.current) return;

    // 2) Mapa base con calles (Stadia, sin clave)
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.stadiamaps.com/styles/alidade_smooth.json",
      center: [-3.7038, 40.4168],
      zoom: 9.2, // vista regional CAM
    });
    mapRef.current = map;

    map.on("load", async () => {
      // 3) Cargamos municipios de la CAM (archivo local que guardaste en /public)
      const res = await fetch("/municipios_cam.geojson");
      const geojson = await res.json();

      // 4) Enriquecer cada municipio con la media (campo NAMEUNIT trae el nombre oficial)
      for (const f of geojson.features) {
        const nombre = norm(f.properties?.NAMEUNIT);
        f.properties.valor = mediasPorMunicipio[nombre] ?? null;
      }

      // 5) Fuente y capas
      if (map.getSource("muni_cam")) map.removeSource("muni_cam");
      map.addSource("muni_cam", { type: "geojson", data: geojson });

      // Relleno coroplético por "valor"
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
            0.18,   // municipios sin datos → semitransparente
            0.7
          ],
        },
      });

      // Borde municipal
      map.addLayer({
        id: "muni-line",
        type: "line",
        source: "muni_cam",
        paint: { "line-color": "#333", "line-width": 0.8 },
      });

      // 6) Tooltip simple (nombre + valor)
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      map.on("mousemove", "muni-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const nombre = norm(f.properties?.NAMEUNIT);
        let valor = mediasPorMunicipio[nombre];

        // Si no coincide exactamente, intenta equivalencias
        if (valor == null) {
        // Buscar alias más parecidos
        const alias = Object.keys(equivalencias).find((k) =>
            nombre.includes(equivalencias[k])
        );
        if (alias && mediasPorMunicipio[alias]) {
            valor = mediasPorMunicipio[alias];
        }
        }

        // Si aún así no hay coincidencia, intenta coincidencia parcial
        if (valor == null) {
        const claveParcial = Object.keys(mediasPorMunicipio).find(
            (b) =>
            nombre.includes(b) || b.includes(nombre)
        );
        if (claveParcial) {
            valor = mediasPorMunicipio[claveParcial];
        }
        }

        f.properties.valor = valor ?? null;

        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:system-ui">
              <strong>${nombre}</strong><br/>
              ${valor == null ? "Sin datos" : `Score medio: ${valor.toFixed(1)}`}
            </div>`
          )
          .addTo(map);
      });
      map.on("mouseleave", "muni-fill", () => popup.remove());

      console.log("✅ Capa coroplética creada (municipios CAM)");
    });

    return () => map.remove();
  }, [mediasPorMunicipio]);

  return (
    <Box ref={mapContainer} style={{ width: "100%", height: "100%", position: "relative" }} />
  );
}
