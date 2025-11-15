import requests, time

# 🔹 Solo dos zonas amplias
zonas = ["madrid", "alcorcon"]
operaciones = ["rent", "sale"]

total_calls = len(zonas) * len(operaciones)
print(f"\n🚀 Iniciando actualización ({total_calls} peticiones totales al backend)\n")

for i, z in enumerate(zonas, start=1):
    for op in operaciones:
        url = f"http://127.0.0.1:8000/seed-idealista?zona={z}&operation={op}"
        print(f"[{i}/{len(zonas)}] ⏳ Actualizando {z.upper()} ({op})...")
        try:
            r = requests.post(url, timeout=300)
            if r.status_code == 200:
                data = r.json()
                print(f"✅ {z} ({op}): {data.get('total_guardadas', 0)} guardadas "
                    f"| {data.get('nuevas', 0)} nuevas "
                    f"| {data.get('actualizadas', 0)} actualizadas")

            else:
                print(f"⚠️ Error HTTP {r.status_code} en {z} ({op})")
        except Exception as e:
            print(f"❌ Error en {z} ({op}): {e}")
        time.sleep(5)  # 🔸 Espera para no saturar Idealista

print("\n🎯 Actualización completada.")
