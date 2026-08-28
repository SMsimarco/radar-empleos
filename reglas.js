'use strict';

// Módulo de reglas de decisión — radar de empleos.
// Recibe la oferta ya extraída (esquema en prompts/esquema_oferta.schema.json)
// y devuelve un estado + motivo. No llama a ningún LLM: todo lo que decide
// viene de comparar campos ya extraídos contra estos umbrales, para que sea
// testeable y editable sin tocar el prompt.

const MAX_ANIOS_TOLERADO = 3; // tope de años de experiencia excluyente que Marco tolera (tiene 2)
const MAX_POSTULANTES_BAJA_COMPETENCIA = 25;
const MAX_ANTIGUEDAD_HORAS_BAJA_COMPETENCIA = 6;
const MIN_COINCIDENCIAS_STACK = 2;

// Stack real de Marco (perfil Full Stack / Automation Engineer, CLAUDE.md).
// Editar acá a mano cuando cambie el CV — mismo valor que en el Code node
// "Aplicar reglas de decisión" del workflow, mantener sincronizados.
// Un solo término por tecnología: "node" ya matchea "Node.js" via includes(),
// no hace falta (ni conviene) listar sinónimos — cada entrada duplicada
// inflaba el conteo de coincidencias.
const CANDIDATO_STACK = [
  'react', 'node', 'express', 'javascript', 'php',
  'postgres', 'supabase', 'html', 'css', 'n8n',
];

// Términos que, si aparecen en frases_exclusion, excluyen el perfil de Marco
// (junior, 2 años de experiencia, sin título universitario terminado).
const TERMINOS_EXCLUYEN_PERFIL = [
  'junior', 'entry level', 'entry-level', 'recent grad', 'recent graduate',
  'bootcamp', 'no bootcamp',
];

// Estado explícito para "no se pudo extraer nada" — distinto de MIRAR
// (MIRAR es "se extrajo bien pero no conviene todavía"; NO_PARSEABLE es
// "no sabemos qué hay ahí, un humano tiene que mirar el mail").
const ESTADO_NO_PARSEABLE = 'NO_PARSEABLE';

// Dedup key única (nunca null) para ofertas que no se pudieron parsear —
// si dos usaran la misma key (o null), el appendOrUpdate por dedup_key de
// "Guardar en Sheet" pisaría una fila con la otra. sufijoUnico es param
// para poder testear con un valor fijo; en producción (Code node del
// workflow) siempre es Date.now().
function generarDedupKeyError(link, sufijoUnico) {
  const base = link || 'sin-link';
  const sufijo = sufijoUnico !== undefined ? sufijoUnico : Date.now();
  return `no_parseable::${base}::${sufijo}`;
}

/**
 * Se llama cuando "Extraer datos con IA" agotó reintentos, o el modelo
 * devolvió algo que no es JSON válido. La oferta va igual a la planilla,
 * marcada para revisión manual — nunca desaparece en silencio.
 * @param {string|null} link
 * @param {number|string} [sufijoUnico] - para tests; default Date.now()
 */
function decidirError(link, sufijoUnico) {
  return {
    estado: ESTADO_NO_PARSEABLE,
    motivo: 'El modelo no devolvió JSON válido (o la llamada falló tras reintentos) — revisar a mano.',
    dedup_key: generarDedupKeyError(link, sufijoUnico),
  };
}

function normalizarEmpresaPuesto(empresa, puesto) {
  const normalizar = (texto) =>
    (texto || '')
      .toLowerCase()
      .normalize('NFD').replace(new RegExp('[̀-ͯ]', 'g'), '') // saca acentos
      .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|inc\.?|ltd\.?|llc\.?)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${normalizar(empresa)}::${normalizar(puesto)}`;
}

function contarCoincidenciasStack(ofertaStack) {
  const stackOferta = (ofertaStack || []).map((t) => t.toLowerCase());
  return CANDIDATO_STACK.filter((tech) =>
    stackOferta.some((t) => t.includes(tech) || tech.includes(t))
  ).length;
}

function fraseExcluyePerfil(frasesExclusion) {
  const texto = (frasesExclusion || []).join(' ').toLowerCase();
  return TERMINOS_EXCLUYEN_PERFIL.find((termino) => texto.includes(termino)) || null;
}

/**
 * @param {object} oferta - oferta extraída, esquema en esquema_oferta.schema.json
 * @param {object} contexto
 * @param {boolean} contexto.yaPostulado - si Marco ya se postuló a empresa+puesto (dedup resuelto afuera con normalizarEmpresaPuesto)
 * @returns {{estado: 'DESCARTAR'|'POSTULAR YA'|'MIRAR', motivo: string}}
 */
function decidir(oferta, contexto = {}) {
  const { yaPostulado = false } = contexto;

  if (yaPostulado) {
    return { estado: 'DESCARTAR', motivo: 'Ya te postulaste a este puesto en esta empresa.' };
  }

  if (oferta.anios_experiencia_min > MAX_ANIOS_TOLERADO && oferta.anios_excluyente === true) {
    return {
      estado: 'DESCARTAR',
      motivo: `Pide ${oferta.anios_experiencia_min}+ años de experiencia de forma excluyente (tenés ${MAX_ANIOS_TOLERADO - 1}).`,
    };
  }

  if (oferta.titulo_excluyente === true) {
    return {
      estado: 'DESCARTAR',
      motivo: `Pide título (${oferta.titulo_requerido || 'sin especificar'}) de forma excluyente.`,
    };
  }

  const fraseExcluyente = fraseExcluyePerfil(oferta.frases_exclusion);
  if (fraseExcluyente) {
    const cita = oferta.frases_exclusion.find((f) => f.toLowerCase().includes(fraseExcluyente));
    return { estado: 'DESCARTAR', motivo: `El aviso excluye tu perfil: "${cita}"` };
  }

  const coincidencias = contarCoincidenciasStack(oferta.stack);
  const coincidenciaReal = coincidencias >= MIN_COINCIDENCIAS_STACK;

  const senialesCompetenciaBaja = [];
  if (oferta.postulantes !== null && oferta.postulantes < MAX_POSTULANTES_BAJA_COMPETENCIA) {
    senialesCompetenciaBaja.push(`${oferta.postulantes} postulantes`);
  }
  if (oferta.antiguedad_horas !== null && oferta.antiguedad_horas < MAX_ANTIGUEDAD_HORAS_BAJA_COMPETENCIA) {
    senialesCompetenciaBaja.push(`publicada hace ${oferta.antiguedad_horas}hs`);
  }
  if (oferta.postulacion_rapida === true) {
    senialesCompetenciaBaja.push('postulación rápida disponible');
  }
  const competenciaBaja = senialesCompetenciaBaja.length > 0;

  if (coincidenciaReal && competenciaBaja) {
    return {
      estado: 'POSTULAR YA',
      motivo: `Stack coincide (${coincidencias} tecnologías) y competencia baja: ${senialesCompetenciaBaja.join(', ')}.`,
    };
  }

  if (!coincidenciaReal) {
    return {
      estado: 'MIRAR',
      motivo: `Stack no coincide lo suficiente (${coincidencias}/${MIN_COINCIDENCIAS_STACK} tecnologías).`,
    };
  }

  return { estado: 'MIRAR', motivo: 'Sin datos de competencia (postulantes/antigüedad/postulación rápida) — incierto, no se asume baja competencia.' };
}

module.exports = {
  decidir,
  decidirError,
  normalizarEmpresaPuesto,
  contarCoincidenciasStack,
  fraseExcluyePerfil,
  generarDedupKeyError,
  ESTADO_NO_PARSEABLE,
};
