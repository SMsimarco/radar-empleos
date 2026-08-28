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
| `estado` | texto | workflow — DESCARTAR / POSTULAR YA / MIRAR |
| `motivo` | texto | workflow |
| `postulado` | booleano | **Marco, a mano** — marcá true cuando te postulás; el workflow lo lee para no proponerte de nuevo lo mismo (regla "ya me postulé") |

`dedup_key` es la columna que el workflow usa tanto para el upsert
(no duplicar la misma oferta si llega por 2 alertas) como para saber "ya
me postulé a esto" cruzando con `postulado`.

**Cómo aplicar:** creá el Sheet, copiá el ID de la URL, reemplazá
`TU_SHEET_ID_AQUI` en `workflow.json` (nodos "Leer ofertas ya vistas" y
"Guardar en Sheet") antes de importar.
