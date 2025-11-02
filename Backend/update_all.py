import requests, time

zonas = ["vallecas", "arganzuela", "retiro", "moratalaz", "usera", "bellasvistas", "alcorcon"]
operaciones = ["rent", "sale"]

for z in zonas:
    for op in operaciones:
        url = f"http://127.0.0.1:8000/seed-idealista?zona={z}&operation={op}"
        print(f"⏳ Actualizando {z} ({op})...")
        try:
            r = requests.post(url, timeout=60)
            print(f"✅ {z} ({op}) →", r.json().get("mensaje", "OK"))
        except Exception as e:
            print(f"⚠️ Error en {z} ({op}):", e)
        time.sleep(3)
