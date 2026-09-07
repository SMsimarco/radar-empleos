'use strict';

// Módulo de reglas de decisión — radar de empleos.
// Recibe la oferta ya extraída (esquema en prompts/esquema_oferta.schema.json)
// y devuelve un estado + motivo. No llama a ningún LLM: todo lo que decide
// viene de comparar campos ya extraídos contra estos umbrales, para que sea
// testeable y editable sin tocar el prompt.
//
// Mirror del Code node "Aplicar reglas de decisión" del workflow (v2,
// 2026-09-07) — si cambiás una regla, cambiala primero acá, corré
// `node --test tests/`, y después pegala en el Code node.

const MAX_ANIOS_TOLERADO = 3;
const MAX_POSTULANTES_BAJA_COMPETENCIA = 25;
const MAX_ANTIGUEDAD_HORAS_BAJA_COMPETENCIA = 6;
const MIN_COINCIDENCIAS_STACK = 2;

// Stack real de Simón — mismo valor que en el Code node "Aplicar reglas de
// decisión" del workflow, mantener sincronizados. Editar acá a mano cuando
// cambie el CV.
const CANDIDATO_STACK = [
  'react', 'node', 'express', 'javascript', 'typescript',
  'postgres', 'postgresql', 'supabase', 'n8n', 'docker',
  'python', 'flutter', 'angular', 'html', 'css', 'wordpress',
];

// OJO: antes esta lista tenía 'junior' y 'entry level' sueltos, y como
// alcanzaba con que la palabra apareciera en cualquier frase, descartaba
// justo los avisos que le sirven a Simón ("Junior Developer welcome",
// "entry level ok"). Ahora solo frases que de verdad excluyen.
const TERMINOS_EXCLUYEN_PERFIL = [
  'no junior', 'not junior', 'no juniors', 'not looking for junior', 'sin junior',
  'senior only', 'solo senior', 'only senior', 'no entry level', 'no bootcamp',
  'do not apply if', 'no apliques si', 'must have 5', '5+ years required',
];

// Títulos que Simón NO tiene. Una tecnicatura (en curso o no) no lo excluye
// de un aviso que pide "tecnicatura" — antes descartaba por cualquier
// titulo_excluyente sin importar cuál, aunque fuera uno que sí tiene o está
// cursando.
const TITULOS_QUE_NO_TENES = [
  'grado', 'licenciatura', 'maestria', 'master', 'bachelor',
  'ingenieria', 'ingeniero', 'phd', 'doctorado',
];

// Estado explícito para "no se pudo extraer nada" — distinto de MIRAR
// (MIRAR es "se extrajo bien pero no conviene todavía"; NO_PARSEABLE es
// "no sabemos qué hay ahí, un humano tiene que mirar el mail").
const ESTADO_NO_PARSEABLE = 'NO_PARSEABLE';

function norm(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // saca acentos
}

// Dedup key única (nunca null) para ofertas que no se pudieron parsear —
// si dos usaran la misma key (o null), el appendOrUpdate por dedup_key de
// "Guardar en Sheet" pisaría una fila con la otra. sufijoUnico es param
// para poder testear con un valor fijo; en producción (Code node del
// workflow) el sufijo real suma un contador + random, esto alcanza para
// garantizar la unicidad que testeamos acá.
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
    norm(texto)
      .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|inc\.?|ltd\.?|llc\.?)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${normalizar(empresa)}::${normalizar(puesto)}`;
}

function contarCoincidenciasStack(ofertaStack) {
  const stackOferta = (ofertaStack || []).map(norm).filter((t) => t.length >= 2);
  return CANDIDATO_STACK.filter((tech) =>
    stackOferta.some((t) => t === tech || t.includes(tech))
  ).length;
}

function fraseExcluyePerfil(frasesExclusion) {
  const texto = norm((frasesExclusion || []).join(' '));
  return TERMINOS_EXCLUYEN_PERFIL.find((termino) => texto.includes(termino)) || null;
}

// Solo excluye si el título pedido de forma excluyente es uno que Simón NO
// tiene (grado, maestría, ingeniería...). Un titulo_excluyente=true con un
// título que sí tiene (o no calza en la lista) no lo descarta.
function tituloQueNoTenes(tituloRequerido) {
  const t = norm(tituloRequerido);
  if (!t) return null;
  return TITULOS_QUE_NO_TENES.find((x) => t.includes(x)) || null;
}

/**
 * @param {object} oferta - oferta extraída, esquema en esquema_oferta.schema.json
 * @param {object} contexto
 * @param {boolean} contexto.yaPostulado - si Simón ya se postuló a empresa+puesto (dedup resuelto afuera con normalizarEmpresaPuesto)
 * @returns {{estado: 'DESCARTAR'|'POSTULAR YA'|'MIRAR', motivo: string}}
 */
function decidir(oferta, contexto = {}) {
  const { yaPostulado = false } = contexto;

  if (yaPostulado) {
    return { estado: 'DESCARTAR', motivo: 'Ya te postulaste a este puesto en esta empresa.' };
  }

  if (Number(oferta.anios_experiencia_min) > MAX_ANIOS_TOLERADO && oferta.anios_excluyente === true) {
    return {
      estado: 'DESCARTAR',
      motivo: `Pide ${oferta.anios_experiencia_min}+ años de experiencia de forma excluyente.`,
    };
  }

  if (oferta.titulo_excluyente === true && tituloQueNoTenes(oferta.titulo_requerido)) {
    return {
      estado: 'DESCARTAR',
      motivo: `Pide título (${oferta.titulo_requerido || 'sin especificar'}) de forma excluyente y no lo tenés.`,
    };
  }

  const fraseExcluyente = fraseExcluyePerfil(oferta.frases_exclusion);
  if (fraseExcluyente) {
    const cita = (oferta.frases_exclusion || []).find((f) => norm(f).includes(fraseExcluyente)) || fraseExcluyente;
    return { estado: 'DESCARTAR', motivo: `El aviso excluye tu perfil: "${cita}"` };
  }

  const coincidencias = contarCoincidenciasStack(oferta.stack);
  const coincidenciaReal = coincidencias >= MIN_COINCIDENCIAS_STACK;

  const senialesCompetenciaBaja = [];
  if (oferta.postulantes !== null && oferta.postulantes !== undefined && Number(oferta.postulantes) < MAX_POSTULANTES_BAJA_COMPETENCIA) {
    senialesCompetenciaBaja.push(`${oferta.postulantes} postulantes`);
  }
  if (oferta.antiguedad_horas !== null && oferta.antiguedad_horas !== undefined && Number(oferta.antiguedad_horas) < MAX_ANTIGUEDAD_HORAS_BAJA_COMPETENCIA) {
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
  tituloQueNoTenes,
  generarDedupKeyError,
  ESTADO_NO_PARSEABLE,
};
