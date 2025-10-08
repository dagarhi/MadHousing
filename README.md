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

