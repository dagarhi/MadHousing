import { createContext, useContext, useState, useEffect } from "react";

const FavoritosContext = createContext();

export function FavoritosProvider({ children }) {
  const [favoritos, setFavoritos] = useState([]);

  // Cargar desde localStorage al iniciar
  useEffect(() => {
    const data = localStorage.getItem("favoritos");
    if (data) setFavoritos(JSON.parse(data));
  }, []);

  // Guardar al cambiar
  useEffect(() => {
    localStorage.setItem("favoritos", JSON.stringify(favoritos));
  }, [favoritos]);

  const toggleFavorito = (piso) => {
    setFavoritos((prev) => {
      const existe = prev.some((f) => f.propertyCode === piso.propertyCode);
      if (existe) return prev.filter((f) => f.propertyCode !== piso.propertyCode);
      return [...prev, piso];
    });
  };

  const borrarTodos = () => setFavoritos([]);

  return (
    <FavoritosContext.Provider value={{ favoritos, toggleFavorito, borrarTodos }}>
      {children}
    </FavoritosContext.Provider>
  );
}

export const useFavoritos = () => useContext(FavoritosContext);
