import { Card, Text, Group, ActionIcon, Tooltip } from "@mantine/core";
import {
  Home,
  Euro,
  Ruler,
  Star,
  Bath,
  Bed,
  Building2,
  ExternalLink,
  Heart,
  HeartOff,
} from "lucide-react";

export default function PopupCard({ piso, isDark, favoritos = [], toggleFavorito }) {
  const esFavorito = favoritos.some((f) => f.propertyCode === piso.propertyCode);

  const scoreColor =
    piso.score_intrinseco >= 70
      ? "#2ecc71"
      : piso.score_intrinseco >= 50
      ? "#f1c40f"
      : "#e74c3c";

  const color = isDark ? "white" : "black";
  const bg = isDark ? "#2C2E33" : "white";

  return (
    <Card
      shadow="md"
      padding="sm"
      radius="md"
      onMouseDown={(e) => e.stopPropagation()} // 👈 evita cierre al hacer click dentro
      onClick={(e) => e.stopPropagation()}
      style={{
        backgroundColor: bg,
        color,
        minWidth: 230,
        fontSize: 13,
        lineHeight: 1.5,
        position: "relative",
      }}
    >
      {/* ❤️ Botón de favoritos */}
      <Tooltip
        label={esFavorito ? "Quitar de favoritos" : "Añadir a favoritos"}
        withArrow
      >
        <ActionIcon
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation(); // 👈 evita que el popup se cierre
            toggleFavorito(piso);
          }}
          variant="subtle"
          color={esFavorito ? "red" : "gray"}
          size="lg"
          radius="xl"
          style={{ position: "absolute", top: 8, right: 8 }}
        >
          {esFavorito ? (
            <Heart size={18} fill="red" color="red" />
          ) : (
            <HeartOff size={18} color={isDark ? "#ccc" : "#555"} />
          )}
        </ActionIcon>
      </Tooltip>

      {/* 🏠 Dirección */}
      <Group gap={6} align="center" mt={4}>
        <Home size={16} />
        <Text fw={600}>{piso.address || "Dirección no especificada"}</Text>
      </Group>

      {/* 💶 Precio */}
      <Group gap={6} mt={4}>
        <Euro size={16} />
        <Text>{piso.price ? `${piso.price.toLocaleString()} €` : "Sin precio"}</Text>
      </Group>

      {/* 📏 Tamaño */}
      {piso.size && (
        <Group gap={6} mt={2}>
          <Ruler size={16} />
          <Text>{piso.size} m²</Text>
        </Group>
      )}

      {/* 🛏 Habitaciones */}
      {piso.rooms && (
        <Group gap={6} mt={2}>
          <Bed size={16} />
          <Text>{piso.rooms} habitaciones</Text>
        </Group>
      )}

      {/* 🛁 Baños */}
      {piso.bathrooms && (
        <Group gap={6} mt={2}>
          <Bath size={16} />
          <Text>{piso.bathrooms} baños</Text>
        </Group>
      )}

      {/* 🏢 Ascensor */}
      {piso.hasLift !== undefined && (
        <Group gap={6} mt={2}>
          <Building2 size={16} />
          <Text>{piso.hasLift ? "Con ascensor" : "Sin ascensor"}</Text>
        </Group>
      )}

      {/* ⭐ Score */}
      {piso.score_intrinseco && (
        <Group gap={6} mt={2}>
          <Star size={16} color={scoreColor} />
          <Text>
            <strong style={{ color: scoreColor }}>
              {piso.score_intrinseco.toFixed(1)}
            </strong>{" "}
            / 100
          </Text>
        </Group>
      )}

      {/* 🔗 Enlace a Idealista */}
      {piso.url && (
        <Group gap={6} mt={8}>
          <ExternalLink size={16} />
          <a
            href={piso.url}
            target="_blank"
            rel="noopener noreferrer"
            onMouseDown={(e) => e.stopPropagation()} // 👈 evita cierre
            onClick={(e) => e.stopPropagation()}
            style={{
              color: isDark ? "#4dabf7" : "#1c7ed6",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Ver en Idealista
          </a>
        </Group>
      )}
    </Card>
  );
}
