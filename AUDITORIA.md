# Auditoría de coherencia — MadHousing (TFG)

**Fecha:** 2026-05-03
**Alcance:** `/Backend`, `/Frontend_Ang`, `/Memoria` (capítulos, anexos, diagramas).
**Modo:** solo lectura. Ningún archivo se ha modificado.

---

## Resumen ejecutivo

El proyecto está globalmente coherente: las 22 rutas del backend están todas
consumidas por el frontend (excepto `/` y `/auth/me`, ver M-12), el modelo de
datos coincide entre ORM y diagramas, las versiones del stack listadas en la
memoria coinciden con los `requirements.txt` y `package.json`, y los tests
ejercitan cada filtro y cada bug documentado en la bitácora. Sin embargo, hay
**dos hallazgos críticos de seguridad**: la API key real de Idealista está
publicada en el `README.md` versionado en GitHub (rotar inmediatamente), y las
claves de MapTiler y OpenRouteService están hardcodeadas en `environment.ts`
también versionado. Además se han detectado **discrepancias importantes
entre listings de la memoria y el código real** (al menos cuatro snippets
del Cap. 5 y el Apéndice de tests no reflejan la implementación actual), y
varias **inconsistencias numéricas internas** en la memoria (131 vs 132 tests,
22 vs 23 admin tests, 13 vs 16 tests de seguridad, max-instances 5 vs 10,
puerto Supabase 5432 vs 6543).

---

## Leyenda de severidad

- **CRÍTICO** — riesgo de filtración de credenciales, integridad de datos o
  bloqueo de la entrega; resolver antes de subir el TFG.
- **ALTO** — divergencia memoria↔código que un evaluador detectaría leyendo
  el código junto a la memoria.
- **MEDIO** — defectos de calidad, dead code, inconsistencias menores.
- **BAJO** — estilo, nomenclatura, mejoras opcionales.

---

## CRÍTICO

### C-1 · Credenciales reales de Idealista filtradas en `README.md` versionado
- **Ubicación:** [README.md:30-33](README.md#L30-L33)
- **Datos expuestos:**
  - `IDEALISTA_API_KEY=9dj2hej9k8u006jr9rd7mf6eol87fdyy`
  - `IDEALISTA_SECRET=aEQynWzhFo13`
- **Hechos:** El fichero está rastreado por git (`git ls-files` confirma
  `README.md`) y el remoto es `https://github.com/dagarhi/MadHousing.git`
  (público). Hay 3 commits modificando el README. Las credenciales coinciden
  exactamente con las del [.env real](Backend/.env) que sí está en
  `.gitignore`. Cualquiera con acceso al repo puede agotar la cuota mensual
  o suplantar las llamadas.
- **Por qué es un problema:** filtración pública de secretos vivos. Aunque
  rebases o reescribas la historia, el secreto debe considerarse comprometido.
- **Propuesta:**
  1. Rotar de forma inmediata la API key/secret en el panel de Idealista.
  2. Reemplazar las líneas del README por un placeholder y remitir al
     `.env.example`.
  3. (Opcional) Reescribir la historia con `git filter-repo` o BFG para
     borrar el secreto del histórico, después de rotar.

### C-2 · Claves de MapTiler y OpenRouteService hardcodeadas en `environment.ts` versionado
- **Ubicaciones:**
  - [Frontend_Ang/src/environments/environment.ts:1](Frontend_Ang/src/environments/environment.ts#L1) y [Frontend_Ang/src/environments/environment.ts:8](Frontend_Ang/src/environments/environment.ts#L8)
  - [Frontend_Ang/src/environments/environment.development.ts:1](Frontend_Ang/src/environments/environment.development.ts#L1) y [Frontend_Ang/src/environments/environment.development.ts:8](Frontend_Ang/src/environments/environment.development.ts#L8)
- **Datos expuestos:** `maptilerKey = "WLhxOt9suGyNUR0iOfnP"` y un
  `orsApiKey` JWT-base64 de OpenRouteService.
- **Por qué es un problema:** las claves de mapa cliente acaban inevitablemente
  en el bundle JS, pero hay dos matices: (1) la clave de ORS tiene cuota
  mensual y se puede revocar/regenerar; (2) commitearla obliga a buscar y
  reemplazar a mano si caduca, mientras que inyectarla por env-var de Netlify
  (`process.env.ORS_API_KEY` consumido en build) la mantiene fuera del repo.
- **Propuesta:** moverlas a variables de Netlify y leerlas vía
  `fileReplacements` / template en build (o `environment.production.ts` no
  versionado). Documentar la solución en el manual de ejecución.

### C-3 · Credenciales de admin extremadamente débiles en `.env`
- **Ubicación:** [Backend/.env:5-6](Backend/.env#L5-L6)
  - `ADMIN_USERNAME="david"`
  - `ADMIN_PASSWORD="garcia"`
- **Hechos:** El fichero `.env` NO está versionado (✅ está en
  [.gitignore:120](.gitignore#L120) bajo `# Environments → .env`). Pero
  [Backend/main.py:153-176](Backend/main.py#L153-L176) (`seed_admin()`) crea
  un usuario `ADMIN` con esa contraseña en cada arranque si no existe ya.
  Si las mismas credenciales están en el Secret Manager de producción, hay
  un ADMIN sin rate-limit con contraseña adivinable.
- **Por qué es un problema:** la memoria dedica una sección entera a OWASP
  A07 (`auth failures`) y discute la falta de rate-limit en `/auth/login`
  (Cap. 6, sec. 6.4). Una contraseña de admin de 6 caracteres en minúsculas
  contradice esa diligencia.
- **REQUIERE DECISIÓN MÍA:** ¿qué credenciales hay en el Secret Manager
  real de Cloud Run? Si son las mismas que en el `.env` local, rotarlas y
  documentar en la memoria que el `.env` versionado en local solo sirve para
  desarrollo y no refleja producción.

---

## ALTO

### A-1 · `angular.json` usa development como configuración por defecto del build
- **Ubicación:** [Frontend_Ang/angular.json:54](Frontend_Ang/angular.json#L54)
- **Hechos:** `"defaultConfiguration": "development"` dentro de `architect.build`.
  Sin pasar `--configuration production`, `ng build` produce un bundle con
  `apiBaseUrl: 'http://localhost:8000'`.
- **Por qué es un problema:** un despliegue ciego (subiendo `dist/` a Netlify
  sin build pipeline correcto) deja la app de producción apuntando a
  localhost. La memoria (Cap. 7 § 7.x) documenta el comando `ng build
  --configuration production`, así que el procedimiento operativo es
  correcto; pero el `default` engaña.
- **Propuesta:** cambiar a `"defaultConfiguration": "production"` y dejar
  development como opt-in (`ng build --configuration development`).

### A-2 · `fileReplacements` de producción no reemplaza nada
- **Ubicación:** [Frontend_Ang/angular.json:38-43](Frontend_Ang/angular.json#L38-L43)
  ```json
  "production": {
    "fileReplacements": [
      { "replace": "src/environments/environment.ts",
        "with":    "src/environments/environment.ts" }
    ]
  }
  ```
- **Hechos:** el fichero se reemplaza por sí mismo. Funciona porque
  `environment.ts` ya tiene `production: true` y la URL de Cloud Run, pero
  la lógica usual del esquema de Angular es: `environment.ts` = prod,
  `environment.development.ts` = dev (con `fileReplacements` invertidos).
  Aquí está implementado correctamente solo para development; production
  es un no-op.
- **Por qué es un problema:** el día que renombres `environment.ts` a
  `environment.production.ts` (convención más nueva) la app de producción
  se construirá con development sin error visible.
- **Propuesta:** o eliminar el bloque (si production usa `environment.ts`
  por defecto) o invertir el esquema y dejar `environment.production.ts`.

### A-3 · Listing `db_from_request` en la memoria no coincide con el código
- **Ubicación memoria:** [Memoria/capitulos/05_implementacion.tex:170-181](Memoria/capitulos/05_implementacion.tex#L170-L181)
- **Lo que dice la memoria:**
  ```python
  def db_from_request():
      """Yields a SQLAlchemy session and closes it after the request."""
      db = SessionLocal()
      try:
          yield db
      finally:
          db.close()
  ```
- **Lo que dice el código:** [Backend/main.py:125-126](Backend/main.py#L125-L126)
  ```python
  def db_from_request():
      yield from get_db()
  ```
  La función real delega en `get_db()` definida en
  [Backend/database.py:34-40](Backend/database.py#L34-L40).
- **Por qué es un problema:** un evaluador que abra el código por curiosidad
  no encuentra el snippet de la memoria.
- **Propuesta:** sustituir el listing por el real (1-2 líneas) y mostrar
  además `get_db()` o eliminar el ejemplo si solo se quería ilustrar el
  patrón.

### A-4 · Listing `pois_nearby` en la memoria no coincide con el código (afecta análisis de rendimiento)
- **Ubicación memoria:** [Memoria/capitulos/05_implementacion.tex:189-205](Memoria/capitulos/05_implementacion.tex#L189-L205)
- **Lo que dice la memoria:** una única consulta SQL con
  `WHERE ST_DWithin(...) ORDER BY category, dist_m` y el comentario
  *"agrupar por categoría y devolver los `limit` más cercanos de cada una"*
  en un único viaje al servidor.
- **Lo que dice el código:** [Backend/main.py:599-640](Backend/main.py#L599-L640)
  ejecuta una **query distinta por cada categoría** en un bucle Python
  (N+1 queries). Esto es coherente con el análisis de carga del Cap. 6
  § 6.5 que dice *"dominado por seis queries `ST_DWithin`/`ST_Distance`
  consecutivas"*, así que la sección de carga está bien y la sección de
  implementación está mal.
- **Por qué es un problema:** la memoria afirma una optimización (1 query)
  que el código no implementa, y luego en otro capítulo justifica un
  cuello de botella citando lo opuesto (6 queries). Contradicción interna.
- **Propuesta:** corregir el listing del Cap. 5 para que muestre el bucle
  real (`for cat in cats:`), y reusar la frase del Cap. 6 sobre las seis
  queries.

### A-5 · Listing `compute_distances_for_point` en la memoria no maneja `None`
- **Ubicación memoria:** [Memoria/capitulos/05_implementacion.tex:243-251](Memoria/capitulos/05_implementacion.tex#L243-L251)
- **Lo que dice la memoria:**
  ```python
  return {f"dist_{cat}_m": float(d) for cat, d in rows}
  ```
- **Lo que dice el código:** [Backend/services/scoring.py:113-128](Backend/services/scoring.py#L113-L128)
  pre-rellena el dict con `None`, valida que `lat`/`lng` no sean `None`,
  y solo escribe las claves cuyo `category` esté en `CONTEXT_WEIGHTS` y
  cuya `dist` no sea `None`.
- **Severidad:** menor; la memoria simplifica un listing por brevedad.
  Pero un evaluador que copie ese snippet a otro contexto verá errores.
- **Propuesta:** añadir un comentario `# (versión simplificada, ver código)`
  o reproducir el snippet completo.

### A-6 · Listing `get_current_user` (apéndice) usa nombres y firma distintos al código
- **Ubicación memoria:** [Memoria/anexos/listados_tests.tex:333-365](Memoria/anexos/listados_tests.tex#L333-L365)
  ```python
  JWT_SECRET = os.environ["JWT_SECRET_KEY"]
  JWT_ALGO   = "HS256"
  JWT_TTL    = timedelta(hours=1)

  def create_access_token(username: str) -> str:
      payload = {"sub": username, "exp": datetime.now(timezone.utc) + JWT_TTL}
      return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

  def get_current_user(request: Request, db: Session = Depends(db_from_request)) -> User:
      auth = request.headers.get("Authorization", "")
      ...
      user = db.query(User).filter_by(username=payload["sub"]).first()
  ```
- **Lo que dice el código:** [Backend/main.py:23-42](Backend/main.py#L23-L42), [Backend/main.py:128-151](Backend/main.py#L128-L151)
  - Variables se llaman `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES = 60`
    (no `JWT_SECRET`, `JWT_ALGO`, `JWT_TTL`).
  - `create_access_token(data: dict, expires_delta: Optional[timedelta] = None)`
    recibe un dict completo (que incluye `user_id` y `role`), no solo username.
  - `get_current_user` no lee la cabecera a mano: usa `Depends(security)` con
    `HTTPBearer(auto_error=False)`.
  - La búsqueda final es por **`User.id == user_id`** (extraído del payload),
    **no** por `username`. Esto coincide con el texto del Cap. 5 § 5.5.3
    *"resuelve el usuario en la base de datos a partir del `user_id` del
    payload"*, y por tanto el listing del apéndice contradice tanto el
    código como el propio cuerpo de la memoria.
- **Severidad:** alta. Es un listing que ocupa media página de la memoria,
  el evaluador puede compararlo línea a línea con el código.
- **Propuesta:** reemplazar el listing por el código real (manteniendo
  brevedad si hace falta) o anotarlo como *"versión esquemática del
  diseño inicial; la implementación final centraliza la firma con
  `HTTPBearer` y resuelve por `user_id`"*.

### A-7 · Listing `valoracion_intrinseca` simplifica el manejo de `size <= 0`
- **Ubicación memoria:** [Memoria/capitulos/05_implementacion.tex:223-237](Memoria/capitulos/05_implementacion.tex#L223-L237)
- **Memoria:** `precio_base = price if operation == "rent" else price / max(size, 1)`
- **Código:** [Backend/services/scoring.py:41-46](Backend/services/scoring.py#L41-L46)
  ```python
  if operation == "rent":
      precio_base = price
  else:
      if size <= 0:
          return SCORE_MIN
      precio_base = price / size
  ```
- El test `test_sale_with_zero_size_returns_min`
  ([Backend/tests/test_scoring.py:55-58](Backend/tests/test_scoring.py#L55-L58))
  confirma que el código real devuelve `SCORE_MIN` para `size=0`. La versión
  con `max(size, 1)` no produce ese mismo resultado (con price=100000 daría
  100000 → SCORE_MIN igualmente, así que en ese caso concreto coincide,
  pero la lógica documentada no es la implementada).
- **Propuesta:** sincronizar el listing con el código real.

### A-8 · `valoracion_intrinseca` con operation desconocida tiene lógica inconsistente (bug latente)
- **Ubicación:** [Backend/services/scoring.py:39-57](Backend/services/scoring.py#L39-L57)
- **Hechos:** Para `operation` no en `{rent, sale}`:
  - `u = UMBRALES.get(operation, UMBRALES["rent"])` → usa umbrales de **rent**.
  - El `if operation == "rent"` es falso → entra en el branch sale-like:
    `precio_base = price / size`.
  - Compara `precio_base` (€/m², ej. 14.28 para 1000/70) contra umbrales de
    **rent** (700-2000 €/mes). Resulta siempre en SCORE_MAX porque 14.28 < 700.
- **Por qué es un problema:** la lógica mezcla magnitudes (€/m² vs €/mes)
  para operaciones desconocidas. El test
  `test_unknown_operation_does_not_crash` solo verifica que el resultado
  esté en `[SCORE_MIN, SCORE_MAX]`, así que el bug pasa.
- **Propuesta:** o validar `operation in {"rent","sale"}` y devolver
  SCORE_MIN/raise, o documentar explícitamente el comportamiento en el
  fallback. La memoria (test del apéndice) describe este caso como
  "operación desconocida → score en rango", lo que el código cumple
  formalmente; pero es código frágil.

### A-9 · Discrepancia en el conteo total de tests (memoria 131, real 132)
- **Recuento real (a 2026-05-03):**
  | Fichero | Real | Memoria afirma |
  |---|---|---|
  | test_auth.py | 14 | 14 ✅ |
  | test_admin.py | 23 (4+7+4+5+3) | **22** ❌ |
  | test_properties.py | 18 | 18 ✅ |
  | test_favorites.py | 10 | 10 ✅ |
  | test_history.py | 9 | 9 ✅ |
  | test_scoring.py | 45 | 45 ✅ |
  | test_security.py | 13 (3+2+2+6) | **16** (A01=6, A02=2, A03=2, A07=6) ❌ |
  | **Total** | **132** | **131** |
- **Citas de la memoria que repiten "131":** [Memoria/capitulos/01_introduccion.tex:82](Memoria/capitulos/01_introduccion.tex#L82),
  [Memoria/capitulos/06_pruebas.tex:409](Memoria/capitulos/06_pruebas.tex#L409),
  [Memoria/capitulos/06_pruebas.tex:428](Memoria/capitulos/06_pruebas.tex#L428),
  [Memoria/anexos/manual_ejecucion.tex:57](Memoria/anexos/manual_ejecucion.tex#L57)
  (*"131 passed in 1.86s"*).
- **Propuesta:** ejecutar `pytest -v --collect-only -q | wc -l` y actualizar
  todas las menciones a `131` por el número real, o explicar la discrepancia
  (p. ej. "los 6 tests de A01 incluyen los `regular_user_forbidden` de
  `test_admin`"). En particular, [Memoria/capitulos/06_pruebas.tex:409](Memoria/capitulos/06_pruebas.tex#L409)
  y [Memoria/anexos/manual_ejecucion.tex:57](Memoria/anexos/manual_ejecucion.tex#L57)
  ("131 passed in 1.86s") deben coincidir con la salida real.

### A-10 · Apéndice `listados_tests.tex` declara "test_admin.py (13 tests)" pero hay 23
- **Ubicación:** [Memoria/anexos/listados_tests.tex:374](Memoria/anexos/listados_tests.tex#L374)
- **Cita textual:** *"test_admin.py (13 tests sobre los endpoints /admin/users)"*
- **Real:** 23 tests (TestListUsers 4, TestUpdateRole 7, TestDeleteUser 4,
  TestBulkDelete 5, TestStats 3).
- **Propuesta:** reemplazar 13 → 23.

### A-11 · Inconsistencia interna en la memoria sobre `max-instances` (5 vs 10)
- **Ubicación 1:** Cap. 1 (introducción) menciona "autoescalado entre 0 y
  10 instancias" (según extracción del agente; verificar línea exacta en
  [Memoria/capitulos/01_introduccion.tex](Memoria/capitulos/01_introduccion.tex)).
- **Ubicación 2:** [Memoria/capitulos/06_pruebas.tex:352](Memoria/capitulos/06_pruebas.tex#L352)
  *"con `max-instances=5`, el techo teórico es 75 conexiones"*
- **Ubicación 3:** Cap. 7 (despliegue) declara `--max-instances 5` en el
  comando `gcloud run deploy` (verificar línea exacta).
- **Propuesta:** decidir el valor real (probablemente 5, dado el cálculo de
  pool 5×15=75) y unificar.

### A-12 · Inconsistencia interna en la memoria sobre el puerto del pooler de Supabase (6543 vs 5432)
- **Ubicación 1:** Cap. 7 declara puerto **6543** (pooler IPv4 transactional).
- **Ubicación 2:** [Memoria/anexos/manual_ejecucion.tex](Memoria/anexos/manual_ejecucion.tex)
  línea 129 declara `aws-0-eu-west-1.pooler.supabase.com:5432` (session mode).
- **Por qué es un problema:** si un evaluador o un compañero quiere
  reproducir el despliegue, las dos instrucciones se contradicen.
- **Propuesta:** confirmar cuál usa producción real y unificar; añadir nota
  diciendo que 6543 = transaction pooler (recomendado para serverless),
  5432 = session pooler.

### A-13 · El frontend nunca consume `GET /auth/me` (endpoint expuesto y testeado pero no usado por el cliente real)
- **Ubicación backend:** [Backend/main.py:204-211](Backend/main.py#L204-L211),
  testeado en [Backend/tests/test_auth.py:113-128](Backend/tests/test_auth.py#L113-L128).
- **Frontend:** [Frontend_Ang/src/app/core/services/auth.service.ts](Frontend_Ang/src/app/core/services/auth.service.ts)
  reconstruye la sesión decodificando el JWT en local desde `localStorage:tfg_auth_user`,
  sin pegar nunca al servidor para validar.
- **Por qué es un problema:** la memoria documenta `/auth/me` en
  `matriz_endpoints.tex:119` como endpoint del flujo de sesión. Si el
  evaluador inspecciona el tráfico HTTP del frontend no encontrará la
  llamada. Además, si el secret JWT cambia en backend o el usuario es
  borrado, el frontend cree que sigue logueado hasta el primer 401.
- **Propuesta (memoria):** documentar que `/auth/me` existe para validación
  futura y/o herramientas externas pero el cliente actual reconstruye la
  sesión en local.
- **Propuesta (código, opcional):** llamar a `/auth/me` al boot para
  invalidar sesiones obsoletas más rápido.

---

## MEDIO

### M-1 · Endpoint `GET /` (root health-check) sin documentar
- **Ubicación:** [Backend/main.py:341-343](Backend/main.py#L341-L343).
  Devuelve `{"message": "🏠 API Buscador de Pisos dinámica", "status": "active"}`.
- **Memoria:** la matriz de endpoints (`anexos/matriz_endpoints.tex`) no lo
  cita; el Cap. 6 dice "los 22 endpoints HTTP de main.py" — efectivamente
  son 22 contando este, así que el número está bien pero la matriz omite
  uno.
- **Propuesta:** añadir entrada "GET / · health-check informal" a la matriz.

### M-2 · `RegisterRequest` no normaliza username a minúsculas (permite "Alice" y "alice" como usuarios distintos)
- **Ubicación:** [Backend/main.py:55-59](Backend/main.py#L55-L59) y
  [Backend/main.py:218-230](Backend/main.py#L218-L230). El `register` solo
  hace `.strip()`. El `login` también solo hace `.strip()`.
- **Por qué es un problema:** dos usuarios pueden coexistir con
  diferenciación solo por mayúsculas. El test
  `test_register_strips_username_whitespace` verifica el strip pero no la
  no-existencia de duplicados case-insensitive.
- **Propuesta (REQUIERE DECISIÓN MÍA):** ¿se busca este comportamiento o no?
  Si no, normalizar a `.lower().strip()` en register y login y añadir un
  índice único case-insensitive en `models.py:User.username`.

### M-3 · `BulkDeleteRequest.ids` sin tope máximo (DoS potencial para admin malicioso)
- **Ubicación:** [Backend/main.py:64-65](Backend/main.py#L64-L65) y
  [Backend/main.py:280-311](Backend/main.py#L280-L311).
- **Por qué es un problema:** un admin malicioso podría enviar millones de
  IDs en una sola petición. El loop hace una `db.query(User)` por cada uno
  (N queries). Aceptable para 10-100, peligroso para 100k.
- **Propuesta:** `ids: List[int] = Field(..., max_items=500)` y/o
  reescribir el loop con un único `WHERE id IN (...)`.

### M-4 · `Favorite.nota` y `SearchHistory.query` sin límite de longitud
- **Ubicaciones:** [Backend/models.py:106](Backend/models.py#L106) y
  [Backend/models.py:117](Backend/models.py#L117). Ambos son `Text` (sin tope).
- **Por qué es un problema:** un usuario hostil podría guardar notas o
  queries de varios MB cada una y agotar espacio. Riesgo bajo pero real.
- **Propuesta:** añadir validación Pydantic en `FavoriteUpdate.nota` y
  `SearchHistoryCreate.query` (`max_length=2000` o similar).

### M-5 · Typo objetivo en filename: `drawer-historical.component.ts`
- **Ubicación:** [Frontend_Ang/src/app/shared/features/mapa/drawer-historial/drawer-historical.component.ts](Frontend_Ang/src/app/shared/features/mapa/drawer-historial/drawer-historical.component.ts)
- **Hechos:** la carpeta es `drawer-historial` (correcto en español), el
  HTML es `drawer-historial.component.html`, la clase es
  `DrawerHistorialComponent`, pero el `.ts` es `drawer-historical`. El
  import en [Frontend_Ang/src/app/shared/features/mapa/vista-mapa/vista-mapa.component.ts](Frontend_Ang/src/app/shared/features/mapa/vista-mapa/vista-mapa.component.ts)
  funciona porque referencia ese path explícitamente.
- **Propuesta:** renombrar el fichero a `drawer-historial.component.ts`
  y actualizar el único import.

### M-6 · Lógica duplicada y dead code en `MapService` (chinchetas y coroplético legacy)
- **Ubicación:** [Frontend_Ang/src/app/core/services/map.service.ts](Frontend_Ang/src/app/core/services/map.service.ts)
  contiene `dibujarChinchetasMapLibre`, `dibujarMapaCoropletico`,
  `setChoroplethVisible`, `clearChoropleth` (líneas ~52-181 según el
  análisis previo). La nueva arquitectura mueve esa responsabilidad a
  `PinsLayerService` y `ChoroplethLayerService`.
- **Por qué es un problema:** el evaluador encuentra dos implementaciones
  de la misma capa, sin saber cuál es la viva.
- **Propuesta:** eliminar las funciones obsoletas o anotar con una sola
  línea "// legacy, no usado, ver PinsLayerService".

### M-7 · Tres llamadas duplicadas a `assets/municipios_cam.geojson`
- **Ubicaciones:**
  - [Frontend_Ang/src/app/shared/features/mapa/mapa-principal/mapa-principal.component.ts:159](Frontend_Ang/src/app/shared/features/mapa/mapa-principal/mapa-principal.component.ts#L159) (`HttpClient.get`)
  - [Frontend_Ang/src/app/core/services/map.service.ts:61](Frontend_Ang/src/app/core/services/map.service.ts#L61) (`fetch`)
- **Propuesta:** centralizar en un servicio (p. ej. `ZonasService` o un
  nuevo `GeojsonService`) con caché propia.

### M-8 · `drawer-estadisticas` usa `.toPromise()` (deprecado en RxJS 7+, eliminado en 8)
- **Ubicación:** [Frontend_Ang/src/app/shared/features/mapa/drawer-estadisticas/drawer-estadisticas.component.ts:66](Frontend_Ang/src/app/shared/features/mapa/drawer-estadisticas/drawer-estadisticas.component.ts#L66)
- **Otro componente** ([drawer-comparador.component.ts:219](Frontend_Ang/src/app/shared/features/mapa/drawer-comparador/drawer-comparador.component.ts#L219))
  ya usa `firstValueFrom`. Aplicar el mismo patrón.

### M-9 · Errores HTTP del frontend silenciados (sin notificar al usuario)
- **Casos identificados:**
  - [favoritos.service.ts](Frontend_Ang/src/app/core/services/favoritos.service.ts) (líneas 44, 90, 105, 133, 155): `console.error` y nada más.
  - [historial.service.ts](Frontend_Ang/src/app/core/services/historial.service.ts) líneas 62-74: si POST falla, el item nunca aparece sin pista.
  - [drawer-favoritos.component.ts:54](Frontend_Ang/src/app/shared/features/mapa/drawer-favoritos/drawer-favoritos.component.ts#L54): la nota parece guardada pero no lo está.
  - [mapa-principal.component.ts](Frontend_Ang/src/app/shared/features/mapa/mapa-principal/mapa-principal.component.ts) líneas 147, 442, 604: errores de ORS solo logean.
  - [drawer-entorno.component.ts:104-107](Frontend_Ang/src/app/shared/features/mapa/drawer-entorno/drawer-entorno.component.ts#L104-L107): no diferencia "no hay POIs" de "fallo de red".
- **Por qué es un problema:** la memoria (Cap. 5 § *Errores en el frontend*)
  documenta `mapBackendError` + `MatSnackBar` como política unificada. Estos
  servicios incumplen esa política.
- **Propuesta:** unificar usando `mapBackendError` + snackbar.

### M-10 · `BuscadorComponent` usa `alert()` para mostrar errores
- **Ubicación:** [Frontend_Ang/src/app/shared/features/mapa/buscador/buscador.component.ts](Frontend_Ang/src/app/shared/features/mapa/buscador/buscador.component.ts)
  líneas ~208, 237, 282.
- **Por qué es un problema:** UX pobre, no traducible, contradice la
  política de errores documentada.
- **Propuesta:** sustituir por `MatSnackBar` con clave Transloco.

### M-11 · `returnUrl` del `authGuard` se guarda pero nunca se honra
- **Ubicación guard:** [Frontend_Ang/src/app/core/guards/auth.guard.ts:34](Frontend_Ang/src/app/core/guards/auth.guard.ts#L34)
- **Ubicación login:** [Frontend_Ang/src/app/shared/features/inicio/pantalla-inicial/pantalla-inicial.component.ts:84-95](Frontend_Ang/src/app/shared/features/inicio/pantalla-inicial/pantalla-inicial.component.ts#L84-L95)
  siempre navega a `/mapa` ignorando el query param.
- **Propuesta:** leer `returnUrl` y redirigir; o eliminar la lógica del
  guard si no se piensa usar.

### M-12 · Carrera entre `BehaviorSubject` y plantillas en `BuscadorComponent.cargarStatsZona`
- **Ubicación:** [Frontend_Ang/src/app/shared/features/mapa/buscador/buscador.component.ts:158](Frontend_Ang/src/app/shared/features/mapa/buscador/buscador.component.ts#L158)
  hace `this.stats = null as any;`. Combinado con plantillas que acceden
  `stats?.price` provoca ocasionalmente "stats is null" durante la
  transición.
- **Propuesta:** usar `stats: Stats | null = null` con tipado correcto y
  guarda explícita en plantilla.

### M-13 · Listing del apéndice declara variables de JWT con nombres ajenos al código
- (Detalle ya en A-6, pero conviene que aparezca también como ítem
  separable porque varios elementos no coinciden):
  - Memoria: `JWT_SECRET`, `JWT_ALGO`, `JWT_TTL`.
  - Código: `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`.

---

## BAJO

### B-1 · Mezcla español/inglés en nomenclatura de código
- Variables, métodos y enums alternan idiomas: `mostrarTodo`, `cargarStatsZona`,
  `aplicarFiltros` vs `RouteService.getRoute`, `PoiService.getPois`,
  `Modo: 'coropletico'|'heat'|'chinchetas'`. No es un bug, pero un evaluador
  estilista lo notará.
- **Propuesta:** documentar la convención (preferiblemente español en
  features de UI y dominio, inglés solo en wrappers de librerías) o
  unificar.

### B-2 · `@Output()` con prefijo `on` (anti-pattern Angular)
- **Ubicación:** [Frontend_Ang/src/app/shared/components/map-controls/map-controls.component.ts:84-89](Frontend_Ang/src/app/shared/components/map-controls/map-controls.component.ts#L84-L89)
- Outputs llamados `onClear`, `onCenter`, `onRadiusToggle`, etc.
- **Propuesta:** renombrar a `clear`, `center`, `radiusToggle` (Angular
  Style Guide).

### B-3 · Uso sistemático de `any` en handlers de eventos MapLibre
- Servicios afectados: `pins-layer`, `route-layer`, `heat-value-map`,
  `choroplethlayer`, `mapa-principal.component.ts`. Suma fácilmente más
  de 30 ocurrencias. Oculta bugs como `feat?.properties?.summary`.
- **Propuesta:** importar tipos de `maplibre-gl` (`MapMouseEvent`, etc.)
  o definir aliases internos.

### B-4 · Suscripción a `currentUser$` sin `takeUntilDestroyed`
- **Ubicaciones:** [favoritos.service.ts](Frontend_Ang/src/app/core/services/favoritos.service.ts)
  líneas 35-40 y [historial.service.ts](Frontend_Ang/src/app/core/services/historial.service.ts)
  líneas 32-37. Son singletons (`providedIn: 'root'`) por lo que no
  fugan, pero si alguien convierte el servicio a scoped fugará.
- **Propuesta:** añadir `takeUntilDestroyed(inject(DestroyRef))` o
  `destroy$.subscribe`.

### B-5 · Log de debugging dejado en código
- **Ubicación:** [drawer-historial.component.ts:38](Frontend_Ang/src/app/shared/features/mapa/drawer-historial/drawer-historical.component.ts#L38)
  contiene `console.log('[Drawer] eliminar', item.id)`.
- **Propuesta:** eliminar.

### B-6 · `expirationTimer: any` en AuthService
- **Ubicación:** [auth.service.ts:32](Frontend_Ang/src/app/core/services/auth.service.ts#L32)
- **Propuesta:** tipar como `ReturnType<typeof setTimeout>` o `number`.

### B-7 · Decisiones de naming inconsistentes en modelos
- [propiedad.model.ts](Frontend_Ang/src/app/core/models/propiedad.model.ts):
  conviven `score`, `score_intrinseco`, `score_final`, `score_contexto`;
  `tipo` y `operation`; `lat`/`lon`/`lng`. Aceptable como capa de
  compatibilidad pero merece comentario o normalización.

### B-8 · Variable `Legend` importada y no usada en `main.ts`
- **Ubicación:** [Frontend_Ang/src/main.ts:77](Frontend_Ang/src/main.ts#L77)
- **Propuesta:** eliminar.

### B-9 · `DrawerFavoritosComponent` acopla a `PinsLayerService`
- El drawer no debería conocer la capa concreta; idealmente eventúa
  "irAlPiso" y el componente principal del mapa decide.
- **Propuesta (opcional):** refactorizar mediante un `EventEmitter` o un
  servicio mediador.

### B-10 · `pins-layer.service.ts` con doble firma frágil basada en `typeof`
- [pins-layer.service.ts:213-238](Frontend_Ang/src/app/core/services/pins-layer.service.ts#L213-L238)
  hace runtime narrowing por `typeof a === 'object' && a.addLayer`.
- **Propuesta:** dividir en dos funciones tipadas distintas.

### B-11 · `requirements.txt` no fija `geoalchemy2` ni `python-jose[cryptography]`
- **Backend/requirements.txt:27** fija `GeoAlchemy2==0.15.2` ✅. Pero la
  línea 20 declara `python-jose==3.5.0` en lugar de `python-jose[cryptography]==3.5.0`.
  En CPython estándar funciona porque `cryptography==46.0.3` está como
  dependencia separada (línea 8); aceptable pero menos explícito.

### B-12 · `models.py` mezcla `relationship` con `cascade` solo en `User`, no en `Favorite/Propiedad`
- [Backend/models.py:95-96](Backend/models.py#L95-L96) usa
  `cascade="all, delete-orphan"` en User. Borrar una `Propiedad` no borra
  los favoritos asociados (la FK `Favorite.property_code` no tiene
  `ON DELETE CASCADE`). En la práctica las propiedades no se borran (se
  upsertan), así que no es un bug; mencionarlo en la memoria si interesa.

### B-13 · `database.py` deja la PK por defecto en SQLite si `DATABASE_URL` falta
- [Backend/database.py:11](Backend/database.py#L11) cae a SQLite local.
  Útil en dev, pero conviene loguear claramente "Usando SQLite local"
  para evitar confusión cuando se olvida cargar `.env`.

---

## Cruce backend ↔ frontend (consistencia de contratos)

He cruzado las llamadas HTTP del frontend contra los endpoints del backend.
Resultado: **todos los endpoints consumidos existen** y **todos los endpoints
expuestos están consumidos** (con dos excepciones documentadas).

| Endpoint backend | Definido en | Consumido por | Comentario |
|---|---|---|---|
| `POST /auth/register` | main.py:218 | auth.service.ts:127 | OK |
| `POST /auth/login` | main.py:180 | auth.service.ts:77 | OK |
| `GET /auth/me` | main.py:204 | — | **NO consumido** (ver A-13) |
| `GET /` | main.py:341 | — | health-check informal (M-1) |
| `GET /buscar` | main.py:345 | busqueda.service.ts:44,68,79 | OK |
| `GET /buscar-todo` | main.py:481 | busqueda.service.ts:100,112 | OK (auth requerida) |
| `GET /zonas-jerarquicas` | main.py:440 | zonas.service.ts:26 | OK |
| `GET /estadisticas-globales` | main.py:511 | estadisticas.service.ts:19 | OK |
| `GET /pois` | main.py:552 | poi.service.ts:43 | OK |
| `GET /pois/nearby` | main.py:599 | poi.service.ts:63 | OK |
| `GET /favoritos` | main.py:644 | favoritos.service.ts:44 | OK |
| `POST /favoritos` | main.py:671 | favoritos.service.ts:105 | OK |
| `PATCH /favoritos/{id}` | main.py:736 | favoritos.service.ts:133 | OK |
| `DELETE /favoritos/{id}` | main.py:714 | favoritos.service.ts:90,155 | OK |
| `GET /historial` | main.py:770 | historial.service.ts:41 | OK |
| `POST /historial` | main.py:798 | historial.service.ts:62 | OK |
| `DELETE /historial/{id}` | main.py:818 | historial.service.ts:79,101 | OK |
| `GET /admin/users` | main.py:234 | admin.component.ts:78 | OK |
| `PATCH /admin/users/{id}` | main.py:245 | admin.component.ts:108 | OK |
| `DELETE /admin/users/{id}` | main.py:264 | admin.component.ts:130 | OK |
| `POST /admin/users/bulk-delete` | main.py:280 | admin.component.ts:209 | OK |
| `GET /admin/stats` | main.py:314 | admin.component.ts:95 | OK |

**Total: 22 endpoints**, coincide con el "22 endpoints HTTP de main.py" de
[Memoria/capitulos/06_pruebas.tex:36](Memoria/capitulos/06_pruebas.tex#L36) ✅.

**Tipos:** los `interface` TypeScript de `core/models/` son razonables y no
contradicen la respuesta de los endpoints. Único matiz: `Propiedad` declara
muchos campos como opcionales (todo con `?`) lo cual es realista (el
backend devuelve `None` para nulos), pero el frontend luego accede sin
guarda (`as any`). No es bug funcional, sí debilita el tipado.

**Datos `score_intrinseco`/`score_contexto`/`score_final`:** los pesos
(0.4 / 0.6) y umbrales (rent 700-2000, sale 2500-7000) coinciden entre
[Memoria/capitulos/04_diseno.tex](Memoria/capitulos/04_diseno.tex) y
[Backend/services/scoring.py:7-26](Backend/services/scoring.py#L7-L26) ✅.

**Categorías POI:** las 6 categorías (`transport, health, education, park,
commerce, bike`) coinciden entre memoria, backend
[Backend/main.py:550](Backend/main.py#L550) y frontend `PoiService` ✅.

---

## Cruce código ↔ memoria (concordancia técnica)

### Stack: ✅ coincide
| Componente | Memoria (`05_implementacion.tex` tab. stack) | requirements.txt / package.json |
|---|---|---|
| Python | 3.13 | (Dockerfile `python:3.13-slim`) ✅ |
| FastAPI | 0.118 | 0.118.1 ✅ |
| SQLAlchemy | 2.0 | 2.0.43 ✅ |
| GeoAlchemy2 | 0.15 | 0.15.2 ✅ |
| psycopg2-binary | 2.9 | 2.9.12 ✅ |
| python-jose | 3.5 | 3.5.0 ✅ |
| passlib | 1.7 | 1.7.4 ✅ |
| Uvicorn | 0.37 | 0.37.0 ✅ |
| pytest | 8.3 | 8.3.3 ✅ |
| pytest-cov | 5.0 | 5.0.0 ✅ |
| locust | 2.32 | 2.32.4 ✅ |
| httpx | 0.27 | 0.27.2 ✅ |
| Angular | 20.3 | ^20.3.0 ✅ |
| Material | 20.2 | ^20.2.12 ✅ |
| MapLibre | 5.11 | ^5.11.0 ✅ |
| Transloco | 8.3 | ^8.3.0 ✅ |
| Chart.js / ng2-charts | 4.5 / 5.0 | ^4.5.1 / ^5.0.4 ✅ |
| Turf | 7.2 | ^7.2.0 ✅ |

### Modelo de datos: ✅ coincide
- Las 6 entidades del diagrama
  [02_modelo_datos.puml](Memoria/diagramas/02_modelo_datos.puml) (Propiedad,
  POI, User, Favorite, SearchHistory, ScraperState) están todas en
  [Backend/models.py](Backend/models.py).
- Columnas, índices (`floor_num`, `district`, `city`, `operation`, GIST
  sobre `geom`) coinciden con [Backend/scripts/001_postgis_setup.sql](Backend/scripts/001_postgis_setup.sql)
  y [Backend/scripts/002_floor_num.sql](Backend/scripts/002_floor_num.sql).

### Algoritmo de scoring: ✅ coincide
- Curva de subscore por distancia: 100→70 (300-600), 70→40 (600-1000),
  40→0 (1000-2000) — verificado en [Backend/services/scoring.py:93-105](Backend/services/scoring.py#L93-L105)
  y exhaustivamente testeado en `test_scoring.TestSubscoreByDistance`.
- Pesos contextuales: transporte 30, sanidad 20, educación 15, parques 15,
  comercio 10, bici 10 — verificado en [Backend/services/scoring.py:14-22](Backend/services/scoring.py#L14-L22).
- W_INTRINSECO=0.4, W_CONTEXTO=0.6 — verificado en
  [Backend/services/scoring.py:25-26](Backend/services/scoring.py#L25-L26).
- Huella digital MD5 sobre dirección+precio+tamaño+rooms+floor truncado a 10:
  verificado en [Backend/services/scoring.py:60-69](Backend/services/scoring.py#L60-L69).

### Bugs corregidos: ✅ todos verificados
La bitácora ([anexos/bitacora_bugs.tex](Memoria/anexos/bitacora_bugs.tex)) y la
tabla resumen ([06_pruebas.tex tab. bitacora-bugs](Memoria/capitulos/06_pruebas.tex)) están alineadas con el código:
- Bug 1 (`floor_num`): [models.py:24](Backend/models.py#L24) + [scripts/002_floor_num.sql](Backend/scripts/002_floor_num.sql) ✅
- Bug 2 (filtros score): [main.py:387-390](Backend/main.py#L387-L390) ✅
- Bug 4 (login devuelve 401): [main.py:188,191](Backend/main.py#L188) ✅
- Bug 5 (auth en `/buscar-todo`): [main.py:487](Backend/main.py#L487) ✅
- Bug 6 (validación de password): [main.py:55-59](Backend/main.py#L55-L59) ✅
- Bug 7 (CORS regex Netlify): [main.py:112-117](Backend/main.py#L112-L117) ✅
- Bug 8 (dedup POIs): [scripts/fetch_pois.py:299-338](Backend/scripts/fetch_pois.py#L299-L338) ✅

### Discrepancias detectadas (consolidado)
Recogidas arriba en A-3 a A-12. Resumen en una línea:
- 4 listings de código no coinciden con la implementación (db_from_request,
  pois_nearby, compute_distances_for_point simplificado, get_current_user
  apéndice).
- 3 conteos numéricos no coinciden (131 vs 132 tests totales, 22 vs 23
  admin tests, 13 vs 16 security tests).
- 2 inconsistencias internas de la propia memoria (max-instances 5/10,
  puerto Supabase 5432/6543).
- 1 endpoint citado pero no consumido por el cliente (`/auth/me`).
- 1 endpoint en código no citado en la matriz (`GET /`).

---

## Otros hallazgos diversos no clasificados arriba

### Documentación / repo
- **README.md raíz** está en español pero también contiene secretos. Tras
  resolver C-1, conviene rehacerlo (incluir comandos de podman para
  PostGIS, link al manual de ejecución del anexo, etc.).
- **Frontend_Ang/README.md** y **Backend/tests/README.md** existen pero no
  los he auditado por estar fuera del alcance crítico — revisarlos antes
  de la entrega.
- Hay artefactos LaTeX en el repo de la memoria que no son código fuente:
  `pdflatex*.fls`, `report.aux`, `report.fdb_latexmk`. Aceptable si la
  memoria se compila localmente.
- `Backend/.coverage` (binary), `Backend/htmlcov/` y `Backend/pisos.db`
  versionados. La memoria menciona el HTML de cobertura como artefacto;
  aceptable pero pesa.

### Arquitectura / patrones
- El frontend usa `BehaviorSubject` y patron Facade como documenta la
  memoria. Sin store global (NgRx) — coherente con la memoria.
- El backend NO usa `routers/` aunque la carpeta existe vacía
  ([Backend/routers/](Backend/routers/) solo contiene `__init__.py`).
  Todo está en `main.py`. La memoria lo presenta como un único módulo
  por sencillez, así que es coherente, pero la carpeta vacía sugiere
  intención inicial distinta — eliminarla o llenarla.

---

## Orden recomendado de correcciones

Propongo este orden, optimizado para minimizar riesgo de cara a la entrega
y agrupar trabajo similar:

### Bloque 1 — Seguridad (BLOQUEANTE; 30-60 min)
1. **C-1** — Rotar API key de Idealista. Eliminar líneas 30-33 de README.md.
2. **C-2** — Mover `maptilerKey` y `orsApiKey` a env vars de Netlify.
   Reemplazarlos por placeholder en `environment.ts`.
3. **C-3** — Decidir credenciales reales del admin de producción y rotar
   si coinciden con `.env` local.

### Bloque 2 — Coherencia memoria↔código (LO QUE MÁS PUNTÚA EN UN TFG; 1-2 h)
4. **A-3** a **A-7** — Sincronizar los 4 listings de la memoria con el
   código real (`db_from_request`, `pois_nearby`, `compute_distances_for_point`,
   `get_current_user` del apéndice, `valoracion_intrinseca`).
5. **A-9** y **A-10** — Re-contar tests con `pytest --collect-only -q` y
   actualizar todas las menciones a "131" y "13 tests admin".
6. **A-11** y **A-12** — Decidir y unificar `max-instances` y puerto
   Supabase entre capítulos.
7. **A-13** y **M-1** — Aclarar en la matriz por qué `/auth/me` está
   expuesto pero no se consume desde el cliente, y añadir `GET /` como
   health-check.

### Bloque 3 — Configuración del build (15 min)
8. **A-1** — Cambiar `defaultConfiguration: "production"` en `angular.json`.
9. **A-2** — Limpiar el `fileReplacements` de production (no-op).

### Bloque 4 — Calidad de código backend (1 h)
10. **A-8** — Hacer explícita la validación de `operation` en
    `valoracion_intrinseca` (raise o return SCORE_MIN).
11. **M-3** — Tope a `BulkDeleteRequest.ids` y query con `IN`.
12. **M-4** — `max_length` en `Favorite.nota` y `SearchHistory.query`.
13. **M-2** — Decidir y aplicar normalización case-insensitive en username.

### Bloque 5 — Calidad de código frontend (2 h)
14. **M-5** — Renombrar `drawer-historical.component.ts` a `drawer-historial`.
15. **M-6** y **M-7** — Eliminar dead code en `MapService` y centralizar
    `municipios_cam.geojson`.
16. **M-8** — `firstValueFrom` en `drawer-estadisticas`.
17. **M-9** y **M-10** — Notificación unificada de errores con
    `mapBackendError` + `MatSnackBar` (incluyendo eliminar `alert()`).
18. **M-11** — Honrar `returnUrl` o eliminar la lógica del guard.
19. **M-12** — Tipar `stats` correctamente en `BuscadorComponent`.

### Bloque 6 — Pulido (opcional, 1 h)
20. **B-1** a **B-13** — Ajustes de estilo, naming, imports no usados,
    logs de debug, tipado de `any`, etc.

---

## Anexo: Comandos útiles para verificar correcciones

```bash
# Conteo real de tests para A-9 / A-10
cd Backend && pytest --collect-only -q | tail -1

# Verificar que el README no tiene secretos
git grep -nE "(IDEALISTA|JWT_SECRET|API_KEY|orsApiKey)=" -- '*.md' '*.tex' '*.json' '*.ts'

# Buscar todos los TODO/FIXME pendientes
git grep -nE "(TODO|FIXME|XXX|HACK)"

# Verificar que .env no se ha vuelto a versionar
git ls-files | grep -E "\.env$"

# Ver llamadas HTTP del frontend al backend (cruce manual)
grep -RnE "http\.(get|post|put|patch|delete)|environment\.apiBaseUrl" \
  Frontend_Ang/src/app
```
