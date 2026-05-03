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
    uvicorn main:app --reload 


En el frontend se deberá usar primero

    # npm install
    
para la instalación de dependencias. Una vez hecho esto, para cargar la aplicación, que estará en localhost/4200:

    # ng serve


A razón de que mi app usa una versión limitada de la API de idealista, hay que generar a mano los datos para no llenar las peticiones, se deberá usar el archivo update_all.py de la siguiente forma:

    # python update_all.py
(esto estando en la raíz del fichero de backend)


