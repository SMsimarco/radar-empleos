'use strict';

// Módulo de seguimiento post-postulación — radar de empleos.
// Función pura de fechas: no llama a Sheets/Gmail/Telegram, solo decide
// qué avisos corresponden HOY dado lo que ya se mandó (avisos_enviados).
// El workflow (Code node espejo en workflow.json) ejecuta la acción real
// y recién ahí agrega el código correspondiente a avisos_enviados —
// este módulo nunca escribe nada, solo calcula.

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const UN_HORA_MS = 60 * 60 * 1000;

const DIAS_AVISO_SEGUIMIENTO = 7;
const DIAS_MARCAR_FRIA = 14;
const VENTANAS_OBLIGACION_HORAS = [72, 24, 6];

function parseAvisos(avisosEnviados) {
  return (avisosEnviados || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

// Trunca a medianoche UTC para que "7 días exactos" no dependa de a qué
// hora corrió el cron ni de a qué hora del día se cargó fecha_postulacion.
function diffDiasCalendario(hoy, fechaPostulacionISO) {
  const inicioHoy = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const [anio, mes, dia] = fechaPostulacionISO.split('-').map(Number);
  const inicioFecha = Date.UTC(anio, mes - 1, dia);
  return Math.round((inicioHoy - inicioFecha) / UN_DIA_MS);
}

/**
 * Avisos ligados a días desde la postulación (seguimiento 7d, fría 14d).
 * @param {object} fila - { fecha_postulacion: 'YYYY-MM-DD'|null|undefined, avisos_enviados: string }
 * @param {Date} hoy
 * @returns {{incompleta: boolean, acciones: string[]}}
 */
function calcularAvisosPostulacion(fila, hoy) {
  if (!fila.fecha_postulacion) {
    // Regla dura: nunca asumir "hoy" si falta la fecha — se marca aparte,
    // no se computan días sobre un dato que no existe.
    return { incompleta: true, acciones: [] };
  }

  const dias = diffDiasCalendario(hoy, fila.fecha_postulacion);
  const avisos = parseAvisos(fila.avisos_enviados);
  const acciones = [];

  if (dias >= DIAS_AVISO_SEGUIMIENTO && !avisos.includes('7d')) {
    acciones.push('draft_seguimiento_7d');
  }
  if (dias >= DIAS_MARCAR_FRIA && !avisos.includes('14d')) {
    acciones.push('marcar_fria_14d');
  }

  return { incompleta: false, acciones };
}

function diffHoras(fechaLimiteISO, ahora) {
  return (new Date(fechaLimiteISO).getTime() - ahora.getTime()) / UN_HORA_MS;
}

/**
 * Avisos ligados a una obligación con fecha límite (entrevista, prueba
 * técnica): ventanas de 72h, 24h y 6h antes.
 * @param {object} fila - { fecha_limite: ISO datetime|null|undefined, avisos_enviados: string }
 * @param {Date} ahora
 * @returns {{incompleta: boolean, acciones: string[]}}
 */
function calcularAvisosObligacion(fila, ahora) {
  if (!fila.fecha_limite) {
    // No toda fila tiene obligación — esto no es un dato faltante, es "no aplica".
    return { incompleta: false, acciones: [] };
  }

  const horasRestantes = diffHoras(fila.fecha_limite, ahora);
  if (horasRestantes < 0) {
    return { incompleta: false, acciones: [] }; // ya venció, no tiene sentido avisar
  }

  const avisos = parseAvisos(fila.avisos_enviados);
  const acciones = [];
  for (const ventana of VENTANAS_OBLIGACION_HORAS) {
    const codigo = `${ventana}h`;
    if (horasRestantes <= ventana && !avisos.includes(codigo)) {
      acciones.push(`deadline_${codigo}`);
    }
  }

  return { incompleta: false, acciones };
}

module.exports = {
  calcularAvisosPostulacion,
  calcularAvisosObligacion,
  parseAvisos,
  DIAS_AVISO_SEGUIMIENTO,
  DIAS_MARCAR_FRIA,
  VENTANAS_OBLIGACION_HORAS,
};
