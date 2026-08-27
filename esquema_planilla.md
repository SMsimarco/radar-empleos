# Esquema de la planilla — Google Sheets "Radar Empleos"

Una sola hoja de cálculo, tab **"Ofertas"**. Guarda tanto el log de todo lo
visto (para dedup) como el estado de las postulaciones (para la rama de
seguimiento que viene en un paso posterior) — mismas columnas sirven para
las dos cosas, no hace falta una segunda tab todavía.

Crear el Sheet a mano, poner estos headers en la fila 1 (orden exacto,
las columnas nuevas por comparar con lo que ya conocías del proyecto):

| Columna | Tipo | Quién la escribe |
|---|---|---|
| `fecha_detectada` | fecha | workflow (rama principal) |
| `dedup_key` | texto | workflow — `normalizarEmpresaPuesto(empresa, puesto)` |
| `empresa` | texto | workflow |
| `puesto` | texto | workflow |
| `modalidad` | texto | workflow |
| `tipo_contrato` | texto | workflow |
| `horas_semanales` | número | workflow |
| `salario_min` | número | workflow |
| `salario_max` | número | workflow |
| `salario_moneda` | texto | workflow |
| `anios_experiencia_min` | número | workflow |
| `stack` | texto (join con `, `) | workflow |
| `postulantes` | número | workflow |
| `antiguedad_horas` | número | workflow |
| `confianza_extraccion` | número | workflow |
| `link` | texto | workflow |
| `estado` | texto | workflow — DESCARTAR / POSTULAR YA / MIRAR |
| `motivo` | texto | workflow |
| `postulado` | booleano | **Marco, a mano** — marca true cuando se postula |
| `fecha_postulacion` | fecha | **Marco, a mano** |
| `obligacion_tipo` | texto | **Marco, a mano** — "entrevista", "prueba técnica", "esperando respuesta" |
| `obligacion_fecha` | fecha/hora | **Marco, a mano** — vencimiento de la obligación |
| `avisado_72h` / `avisado_24h` / `avisado_6h` | booleano | rama de seguimiento (paso futuro) — evita avisos duplicados |

`dedup_key` es la columna que lee la rama principal en cada corrida para
saber "esto ya lo vi" y "ya me postulé" (cruzando con `postulado`). El
resto de columnas manuales (`postulado` en adelante) las llena Marco desde
la planilla misma, no el workflow.

**Cómo aplicar:** creá el Sheet, copiá el ID de la URL, reemplazá
`TU_SHEET_ID_AQUI` en `workflow_rama_principal.json` (nodos "Leer ofertas
ya vistas", "Leer perfil CV" y "Guardar en Sheet"), en
`workflow_heartbeat.json` (nodo "Leer última corrida") y en
`workflow_rama_cv.json` (nodo "Guardar perfil") antes de importar.

## Tab "Perfil"

La llena la rama CV, una fila por CV (2 filas normalmente: Automation
Engineer y Full Stack):

| Columna | Tipo | Quién la escribe |
|---|---|---|
| `cv_nombre` | texto | rama CV — nombre del archivo en Drive, es la clave de upsert |
| `tecnologias` | texto (join con `, `) | rama CV — lista que extrajo la IA del texto del CV |
| `fecha_actualizado` | fecha/hora ISO | rama CV |

La rama principal lee esta tab en cada corrida y arma `CANDIDATO_STACK`
como la unión de las tecnologías de todas las filas — no reprocesa los
CVs, solo lee lo que la rama CV ya calculó. Si la tab está vacía (rama CV
nunca corrió), usa una lista fallback hardcodeada en el propio Code node.

## Tab "Heartbeat"

Segunda hoja en el mismo spreadsheet, 2 columnas nada más:

| Columna | Tipo | Quién la escribe |
|---|---|---|
| `id` | texto | fija, siempre `rama_principal` (deja lugar para otras ramas el día que tengan su propio heartbeat) |
| `ultima_corrida` | fecha/hora ISO | la rama principal, al llegar OK al final de la ejecución |

La escribe el nodo "Actualizar heartbeat" de `workflow_rama_principal.json`
(`appendOrUpdate` matcheando por `id`). La lee cada hora
`workflow_heartbeat.json`. Vacía al principio es normal — significa "todavía
no corrió nunca", y el heartbeat va a avisar hasta que corra una vez.
