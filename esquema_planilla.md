# Esquema de la planilla — Google Sheets "Radar Empleos"

Una sola hoja de cálculo, tab **"Ofertas"**. Crear el Sheet a mano, poner
estos headers en la fila 1 (orden exacto):

| Columna | Tipo | Quién la escribe |
|---|---|---|
| `fecha_detectada` | fecha | workflow |
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
| `estado` | texto | workflow — DESCARTAR / POSTULAR YA / MIRAR / NO_PARSEABLE / FRÍA (la rama de seguimiento la marca a los 14 días sin respuesta) |
| `motivo` | texto | workflow |
| `postulado` | booleano | **Marco, a mano** — marcá true cuando te postulás; el workflow lo lee para no proponerte de nuevo lo mismo (regla "ya me postulé") y para activar la rama de seguimiento |
| `fuente` | texto | workflow — `linkedin` / `indeed` / `computrabajo` / `bumeran` / `desconocida` |
| `fecha_postulacion` | fecha (`YYYY-MM-DD`) | **Marco, a mano** — cargala junto con `postulado = true`. Sin esto la fila queda `incompleta` y no se calculan avisos de 7d/14d |
| `fecha_limite` | fecha y hora ISO | **Marco, a mano** — solo si hay una obligación con fecha (entrevista, prueba técnica). Vacío si no aplica |
| `tipo_obligacion` | texto libre | **Marco, a mano** — ej. "Entrevista con RRHH", "Prueba técnica". Se usa en el texto del aviso de Telegram |
| `avisos_enviados` | texto (códigos separados por coma) | workflow — anti-repetición. Códigos posibles: `7d`, `14d`, `incompleta`, `72h`, `24h`, `6h`. Nunca editar a mano salvo que quieras forzar que se reenvíe un aviso (borrando el código correspondiente) |
| `incompleta` | booleano | workflow — true cuando `postulado = true` pero falta `fecha_postulacion` |

`dedup_key` es la columna que el workflow usa tanto para el upsert
(no duplicar la misma oferta si llega por 2 alertas) como para saber "ya
me postulé a esto" cruzando con `postulado`. Para filas `NO_PARSEABLE` la
key es `no_parseable::<link>::<timestamp>` — a propósito nunca coincide
con nada, así cada fallo queda como fila propia y no pisa (ni es pisado
por) otra fila al hacer `appendOrUpdate`.

**Cómo aplicar:** creá el Sheet, copiá el ID de la URL, reemplazá
`TU_SHEET_ID_AQUI` en `workflow.json` (nodos "Leer ofertas ya vistas" y
"Guardar en Sheet") antes de importar.
