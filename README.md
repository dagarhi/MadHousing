# TFG
Proyecto personal para mi TFG de ingeniería del software

Hola!
Este es el readme que voy a usar para más o menos dejarme apuntado las cosas importantes que necesito para ejecutar este programa.

Primero necesitamos obviamente generar el entorno virtual con:
    python -m venv venv

una vez creado el entorno lo debemos activar con:
    venv\Scripts\activate

Para poder usar el código necesitarás installar todos los requisitos: 
    pip install -r requirements.txt

Por último, y hasta nuevo aviso, para probar el programa necesitarás ejecutar:
    uvicorn main:app --reload --port 8000

Ahora tendrás toda la configuración hecha, salvo los datos del .env, los cuales los dejo por aquí:

    IDEALISTA_API_KEY=9dj2hej9k8u006jr9rd7mf6eol87fdyy
    IDEALISTA_SECRET=aEQynWzhFo13
    DATABASE_URL=sqlite:///./pisos.db


A razón de que mi app usa una versión limitada de la API de idealista, hay que generar a mano los datos para no llenar las peticiones, se usa este comando:

    # 1. Vallecas alquiler
    Invoke-WebRequest -Uri "http://127.0.0.1:8000/seed-idealista?zona=vallecas&operation=rent" -Method POST | Select-Object -Expand Content
    
    # 2. Vallecas venta
    Invoke-WebRequest -Uri "http://127.0.0.1:8000/seed-idealista?zona=vallecas&operation=sale" -Method POST | Select-Object -Expand Content
    
    # 3. Alcorcón alquiler
    Invoke-WebRequest -Uri "http://127.0.0.1:8000/seed-idealista?zona=alcorcon&operation=rent" -Method POST | Select-Object -Expand Content
    
    # 4. Alcorcón venta
    Invoke-WebRequest -Uri "http://127.0.0.1:8000/seed-idealista?zona=alcorcon&operation=sale" -Method POST | Select-Object -Expand Content


para comprobar que hay datos se usa: 
    Invoke-WebRequest -Uri "http://127.0.0.1:8000/buscar?ciudad=vallecas&operation=rent" | Select-Object -Expand Content
