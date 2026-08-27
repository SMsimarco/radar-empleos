# Ejemplos resueltos a mano — validación del prompt v1.0

Dos ofertas de texto de ejemplo (formato aproximado de mail de alerta
LinkedIn — a ajustar cuando tengamos un mail real) con el JSON que el
prompt de `extraccion_oferta.md` DEBERÍA devolver si sigue las reglas al
pie de la letra. Sirven para chequear el prompt corriéndolo contra la API
antes de meterlo en el workflow: si el output de Claude no matchea esto,
el prompt necesita ajuste, no las reglas de decisión.

---

## Ejemplo 1 — encaja perfecto en stack, pero excluye juniors

**Texto de la oferta:**

```
Full Stack Developer (Remote, LATAM)
TechNova Solutions — Buenos Aires, Argentina (Remote)

We're looking for a Full Stack Developer to join our growing team.
Stack: React, Node.js, PostgreSQL, Docker.

Requirements:
- Please only apply if you have 5+ years of professional experience.
- Not a fit for recent bootcamp grads or junior profiles.
- Strong English communication skills.

This is a full-time, fully remote position. Salary: competitive, based on
experience.

127 applicants · Posted 3 days ago
```

**JSON esperado:**

```json
{
  "empresa": "TechNova Solutions",
  "puesto": "Full Stack Developer",
  "modalidad": "remoto",
  "ubicacion_requerida": "LATAM",
  "tipo_contrato": "full time",
  "horas_semanales": null,
  "salario_min": null,
  "salario_max": null,
  "salario_moneda": null,
  "anios_experiencia_min": 5,
  "anios_excluyente": true,
  "titulo_requerido": null,
  "titulo_excluyente": null,
  "frases_exclusion": [
    "Please only apply if you have 5+ years of professional experience.",
    "Not a fit for recent bootcamp grads or junior profiles."
  ],
  "stack": ["React", "Node.js", "PostgreSQL", "Docker"],
  "postulantes": 127,
  "antiguedad_horas": 72,
  "postulacion_rapida": null,
  "link": null,
  "confianza_extraccion": 0.9
}
```

Notas de por qué queda así (no del modelo, para que Marco valide contra
esto):
- `salario_min/max/moneda` en null: "competitive, based on experience" no es
  un número, no se inventa un rango.
- `titulo_requerido` y `titulo_excluyente` en null: el texto no menciona
  título en ningún momento, ni para pedirlo ni para descartarlo.
- `antiguedad_horas` en 72: "Posted 3 days ago" → 3 días = 72hs, es una
  conversión directa de unidad, no una estimación.
- `postulacion_rapida` en null: no hay mención de "Easy Apply" ni similar.
- Este es el caso que la Regla de decisión tiene que mandar a DESCARTAR:
  `anios_experiencia_min = 5 > 3` y `anios_excluyente = true`, aunque el
  stack matchee 100%.

---

## Ejemplo 2 — freelance part-time, sin datos de competencia

**Texto de la oferta:**

```
Freelance Backend Developer — 20hs/week
Bright Path Studio

We need a backend developer for an ongoing freelance engagement, ~20
hours per week, fully remote (any timezone, async-first).

Tech: Python, FastAPI, PostgreSQL.

Rate: $18-25 USD/hour depending on experience. No degree required — we
care about your GitHub more than your diploma.
```

**JSON esperado:**

```json
{
  "empresa": "Bright Path Studio",
  "puesto": "Backend Developer",
  "modalidad": "remoto",
  "ubicacion_requerida": null,
  "tipo_contrato": "freelance",
  "horas_semanales": 20,
  "salario_min": 18,
  "salario_max": 25,
  "salario_moneda": "USD",
  "anios_experiencia_min": null,
  "anios_excluyente": null,
  "titulo_requerido": null,
  "titulo_excluyente": false,
  "frases_exclusion": [],
  "stack": ["Python", "FastAPI", "PostgreSQL"],
  "postulantes": null,
  "antiguedad_horas": null,
  "postulacion_rapida": null,
  "link": null,
  "confianza_extraccion": 0.85
}
```

Notas:
- `salario_min/max` en horas ($/hour), no se convierte a mensual ni se
  mezcla con `horas_semanales` — son campos independientes, la conversión
  (si se quiere) va en el Code node de reglas, no acá.
- `titulo_excluyente` en `false`, no `null`: a diferencia del ejemplo 1,
  acá el texto SÍ toca el tema título y dice explícitamente que no importa
  ("No degree required"). Es un dato presente, no ausente.
- `postulantes` y `antiguedad_horas` en null: el mail no trae esos datos.
  Este es el caso que las reglas tienen que mandar a MIRAR aunque el resto
  encaje perfecto — null en competencia nunca habilita POSTULAR YA.

---

## Qué valida cada ejemplo

| Ejemplo | Qué prueba |
|---|---|
| 1 | Cita textual en `frases_exclusion` (no paráfrasis), distinción entre dato ausente (`titulo_*` → null) y dato presente pero no excluyente, conversión de unidad literal ("3 days ago" → 72hs) |
| 2 | `false` vs `null` en excluyente (ausencia de mención vs mención explícita de "no aplica"), independencia entre `salario_*` y `horas_semanales`, competencia ausente → nunca asumida como buena |

Antes de pasar al módulo de reglas (paso 3): corré estos dos textos contra
la API con el prompt de `extraccion_oferta.md` y confirmá que el output
real matchea esto campo por campo. Si no matchea, avisame en qué difiere
y ajustamos el prompt — no las reglas.
