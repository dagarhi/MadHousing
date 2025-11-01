import sqlite3
from tabulate import tabulate

# --- Configuración ---
DB_PATH = "pisos.db"

# --- Conexión ---
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM propiedades;")
total = cur.fetchone()[0]
print(f"\n📊 Total de propiedades en la base de datos: {total}\n")
cur.execute("SELECT operation, COUNT(*) FROM propiedades GROUP BY operation;")
rows = cur.fetchall()
print("🏷️  Propiedades por tipo de operación:")
print(tabulate(rows, headers=["Operación", "Cantidad"], tablefmt="pretty"))
cur.execute("""
    SELECT district, COUNT(*)
    FROM propiedades
    GROUP BY district
    ORDER BY COUNT(*) DESC;
""")
rows = cur.fetchall()
print("\n📍 Propiedades por distrito:")
print(tabulate(rows, headers=["Distrito", "Cantidad"], tablefmt="pretty"))
cur.execute("""
    SELECT district,
           ROUND(AVG(price), 0) AS precio_medio,
           ROUND(AVG(size), 1) AS tamano_medio,
           COUNT(*) AS total
    FROM propiedades
    WHERE price > 0 AND size > 0
    GROUP BY district
    ORDER BY total DESC;
""")
rows = cur.fetchall()
print("\n💶 Promedios de precio y tamaño por distrito:")
print(tabulate(rows, headers=["Distrito", "Precio medio (€)", "Tamaño medio (m²)", "Total"], tablefmt="pretty"))

busqueda = input("\n🔎 Introduce una palabra para filtrar (por ejemplo 'alcor', 'vallecas', 'centro') o pulsa ENTER para ver todas: ").strip()

query = """
    SELECT propertyCode, district, price, size, operation, address
    FROM propiedades
"""
if busqueda:
    query += f" WHERE district LIKE '%{busqueda}%' OR neighborhood LIKE '%{busqueda}%'"
query += " LIMIT 20;"

cur.execute(query)
rows = cur.fetchall()
print("\n🏠 Ejemplo de propiedades encontradas:")
print(tabulate(rows, headers=["Código", "Distrito", "Precio (€)", "Tamaño (m²)", "Operación", "Dirección"], tablefmt="pretty"))

cur.execute("PRAGMA table_info(propiedades);")
columns = [row[1] for row in cur.fetchall()]
print("\n🧩 Columnas disponibles en la tabla 'propiedades':")
print(", ".join(columns))

cur.execute("""
    SELECT propertyCode, COUNT(*) AS veces
    FROM propiedades
    GROUP BY propertyCode
    HAVING veces > 1
    ORDER BY veces DESC;
""")
dups = cur.fetchall()
if dups:
    print(f"\n⚠️  Se encontraron {len(dups)} códigos de propiedad duplicados:")
    for d in dups[:10]:
        print(f"   - {d[0]} ({d[1]} veces)")
else:
    print("\n✅ No hay duplicados en los propertyCode.")

conn.close()
print("\n✅ Análisis completado correctamente.")
