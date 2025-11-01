import {
  ActionIcon,
  Tooltip,
  useMantineColorScheme,
  useComputedColorScheme,
} from "@mantine/core";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme("light", { getInitialValueInEffect: true });
  const dark = computed === "dark";

  return (
    <Tooltip label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} withArrow>
      <ActionIcon
        variant="filled"
        color={dark ? "yellow" : "blue"}
        onClick={() => setColorScheme(dark ? "light" : "dark")}
        size={60}
        radius="xl"
        aria-label="Alternar modo oscuro"
      >
        {dark ? <Sun size={32} /> : <Moon size={32} />}
      </ActionIcon>
    </Tooltip>
  );
}
