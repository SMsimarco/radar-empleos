# Radar de empleos

Workflow n8n personal (no cliente Velar) que lee tus alertas de empleo de
Gmail, extrae los hechos de cada oferta con Claude, decide con reglas de
código si te conviene postular ya, mirar, o descartar — y te lo manda
resumido. No se postula solo. No scrapea LinkedIn: solo lee los mails de
alerta que vos ya configuraste.

## Qué hace

**Rama principal** (cron diario, 8am):

```mermaid
flowchart TD
    A[Cron diario] --> B[Leer alertas Gmail]
    A --> C[Leer ofertas ya vistas<br/>Sheet]
    A --> M[Leer perfil CV<br/>Sheet]
    B --> D[Parsear ofertas<br/>split por link LinkedIn]
    D --> E[Preparar prompt IA]
    E --> F[Extraer datos con IA<br/>Claude Haiku]
    F --> G[Parsear respuesta IA]
    G --> H[Aplicar reglas de decisión]
    C -.dedup / ya postulado.-> H
    M -.CANDIDATO_STACK dinámico.-> H
    H --> I[Guardar en Sheet<br/>upsert por dedup_key]
    I --> J[Armar mail resumen]
    J --> K[Enviar mail resumen]
    J --> L[Actualizar heartbeat]
```

**Rama CV** (`workflow_rama_cv.json`, dispara sola con cambios en Drive):

```mermaid
flowchart TD
    N[CV modificado<br/>Drive Trigger] --> O[Descargar CV]
    O --> P{¿Es PDF?}
    P -->|sí| Q[Extraer texto PDF]
    P -->|no, Google Doc| R[Texto desde binario]
    Q --> S[Unificar texto CV]
    R --> S
    S --> T[Preparar prompt IA]
    T --> U[Extraer stack con IA<br/>Claude Haiku]
    U --> V[Parsear respuesta IA]
    V --> W[Armar fila de perfil]
    W --> X[Guardar perfil<br/>tab Perfil, upsert por cv_nombre]
```

Igual que con las ofertas: la IA solo extrae la lista de tecnologías que
aparecen literalmente en el CV, no opina sobre nivel. La rama principal
lee el resultado (no reprocesa el CV en cada corrida diaria).

**Error workflow** (`workflow_error.json`): n8n lo dispara solo cuando
cualquier workflow que lo tenga configurado como Error Workflow falla.
Manda un mail: nombre del workflow, nodo que falló, mensaje de error.

**Heartbeat** (`workflow_heartbeat.json`): corre solo, cada hora. Si la
rama principal no escribió su marca de "corrí OK" en las últimas 26hs,
manda un mail. Cubre el caso de que el cron se desactive o el
workflow quede roto sin tirar un error explícito.

**Rama seguimiento** (`workflow_rama_seguimiento.json`, cron diario 9am):

```mermaid
flowchart TD
    Y[Cron diario] --> Z[Leer postulaciones<br/>tab Ofertas]
    Z --> AA[Filtrar y calcular alertas<br/>72h / 24h / 6h]
    AA --> AB[Armar mail seguimiento]
    AB --> AC[Enviar mail seguimiento]
    AC --> AD[Reemitir filas]
    AD --> AE[Actualizar avisado]
```

Lee las filas con `postulado=true` y `obligacion_fecha` cargada (las
llenás vos a mano en el Sheet cuando te confirman entrevista/prueba
técnica). Si falta ≤72hs, ≤24hs, o ≤6hs y ese tramo todavía no se avisó,
lo junta con lo demás urgente del día en UN solo mail (no uno por
oferta) y marca el tramo como avisado. Al ser cron diario (como pedías),
los tramos son aproximados, no exactos a la hora — documentado en el
Sticky Note del workflow.

## El contrato de decisión, en una frase

El LLM (Claude Haiku, temperatura 0) solo extrae hechos del texto y nunca
inventa: todo lo que no está explícito en el mail queda `null`. Un Code
node en n8n (mirror de `reglas.js`, testeado con `node --test`) decide con
reglas legibles — DESCARTAR / POSTULAR YA / MIRAR, siempre con motivo. Un
dato ausente sobre competencia (postulantes, antigüedad del aviso) se trata
como incertidumbre, nunca como buena señal.

## Cómo importar

1. En n8n: Workflows → Import from File → los 5 `.json` de esta carpeta
   (`workflow_rama_principal.json`, `workflow_rama_cv.json`,
   `workflow_rama_seguimiento.json`, `workflow_error.json`,
   `workflow_heartbeat.json`).
2. Cada uno trae un Sticky Note en la esquina superior izquierda con la
   lista puntual de qué reemplazar antes de activarlo — seguí eso primero.
3. En `workflow_rama_principal.json`, después de importar
   `workflow_error.json`, copiá su ID (aparece en la URL al abrirlo) y
   pegalo en Configuración del workflow → Error Workflow.
4. Activá los 3 workflows.

## Credenciales que necesita

Todas se crean en n8n (Credentials), nunca hardcodeadas en el JSON:

| Credencial | Tipo n8n | Para qué |
|---|---|---|
| Gmail | OAuth2 | leer alertas + mandar el mail resumen + avisos de error/heartbeat |
| Google Sheets | OAuth2 | leer/escribir el Sheet de ofertas, perfil y heartbeat |
| Google Drive | OAuth2 | rama CV — detectar cambios y descargar los CVs |
| Anthropic | Header Auth (`x-api-key` = `={{ $env.ANTHROPIC_API_KEY }}`) | extracción con Claude Haiku (ofertas y CVs) |

`ANTHROPIC_API_KEY` tiene que estar como variable de entorno del
contenedor n8n en el Docker Compose del VPS (no en el JSON) — la
credencial Header Auth solo referencia `$env.ANTHROPIC_API_KEY`.

## Esquema de la planilla

Ver [`esquema_planilla.md`](./esquema_planilla.md) — una hoja "Ofertas"
con las columnas que escribe el workflow más las que llenás vos a mano
(postulado, fecha, obligaciones pendientes), y una hoja "Heartbeat" con
2 columnas (`id`, `ultima_corrida`).

## Cómo cambio las reglas de decisión

Las reglas viven en dos lugares que tenés que mantener sincronizados:

1. `reglas.js` — la fuente de verdad, testeable sin n8n:
   ```
   node --test tests/
   ```
   Cambiá el umbral o la condición ahí, corré los tests, confirmá que los
   10 casos siguen pasando (o ajustá los tests si el cambio de
   comportamiento es intencional).
2. El Code node **"Aplicar reglas de decisión"** dentro de
   `workflow_rama_principal.json` — es un mirror manual del mismo código.
   No hay forma de que n8n importe `reglas.js` directamente sin montar el
   repo como volumen en el contenedor y habilitar
   `NODE_FUNCTION_ALLOW_EXTERNAL` en el Docker Compose del VPS. Si en
   algún momento se hace esa migración, este paso desaparece.

Los umbrales que más vas a querer tocar están todos arriba de
`reglas.js`: `MAX_ANIOS_TOLERADO`, `MAX_POSTULANTES_BAJA_COMPETENCIA`,
`MAX_ANTIGUEDAD_HORAS_BAJA_COMPETENCIA`, `MIN_COINCIDENCIAS_STACK`,
`TERMINOS_EXCLUYEN_PERFIL`. `CANDIDATO_STACK` es la excepción: en
producción no se edita a mano, la arma la rama CV a partir de tus 2 CVs
en Drive (tab "Perfil" del Sheet) — para cambiarla, actualizá el CV, no el
código. El valor hardcodeado en `reglas.js` es solo el fallback/referencia
para los tests.

El prompt de extracción (lo que el LLM ve) está en
[`prompts/extraccion_oferta.md`](./prompts/extraccion_oferta.md), también
mirroreado dentro del Code node **"Preparar prompt IA"**. Si lo cambiás,
volvé a resolver a mano los 2 ejemplos de
[`prompts/ejemplos_resueltos.md`](./prompts/ejemplos_resueltos.md) para
tener algo fijo contra qué validar.

## Qué NO detecta

- **Nada que no venga en el mail de alerta.** No scrapea LinkedIn, no
  visita el link de la oferta. Si LinkedIn no incluye "postulantes" o
  "publicado hace X" en el mail, esos campos quedan `null` para siempre en
  ese aviso — las reglas los tratan como incierto, no como "poca
  competencia".
- **El split de "Parsear ofertas" es una asunción sin validar contra un
  mail real.** Separa por links `/jobs/view/` de LinkedIn; si el formato
  de tu alerta es distinto (digest semanal, otro proveedor tipo We Work
  Remotely/Remotive), este nodo hay que reescribirlo.
- **Coincidencia de stack es un conteo simple** (cuántas tecnologías de
  `CANDIDATO_STACK` aparecen en el texto de la oferta, mínimo 2), no un
  análisis semántico. Un aviso que pida "backend" sin nombrar tecnologías
  puntuales no va a matchear aunque sea tu perfil exacto.
- **No arma el CV ni la carta de presentación.** La rama CV solo lee tus
  CVs existentes para saber qué tecnologías tenés, no genera nada.
- **La rama CV solo maneja Google Doc y PDF.** Si guardás el CV como
  `.docx` sin convertir, "¿Es PDF?" lo manda por la rama de Google Doc y
  va a fallar al leer el binario como texto — convertilo a Google Doc o
  PDF antes de subirlo a la carpeta que watchea el trigger.
- **La rama seguimiento es cron diario, no exacta a la hora.** Los tramos
  72/24/6hs son aproximados — si una obligación pasa de "más de 72hs" a
  "menos de 24hs" entre una corrida y la siguiente, se manda el aviso más
  urgente sin avisar y se saltea el de 72hs.
- **Si la fecha de la obligación vence y ya se avisó el tramo de 6hs, no
  vuelve a avisar.** Hay que actualizar el Sheet a mano (marcar el
  resultado, borrar `obligacion_fecha`, lo que corresponda).
- **La rama seguimiento no lee tu calendario ni tu mail para detectar la
  obligación sola** — vos cargás `obligacion_tipo` y `obligacion_fecha` a
  mano en el Sheet cuando te confirman algo.
- **El heartbeat depende de que la rama principal llegue al nodo final**
  ("Actualizar heartbeat"). Si el workflow completo se desactiva en n8n
  (no falla, directamente no corre), no hay error que dispare el Error
  Workflow — el heartbeat es lo único que lo detecta, y tarda hasta 26hs.
