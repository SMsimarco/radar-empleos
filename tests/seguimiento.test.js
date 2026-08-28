'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularAvisosPostulacion, calcularAvisosObligacion } = require('../seguimiento.js');

// --- calcularAvisosPostulacion --- los 5 casos pedidos explícitamente ---

test('postulación de hoy -> sin acciones', () => {
  const hoy = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_postulacion: '2026-08-28', avisos_enviados: '' };
  const { incompleta, acciones } = calcularAvisosPostulacion(fila, hoy);
  assert.equal(incompleta, false);
  assert.deepEqual(acciones, []);
});

test('7 días exactos, sin avisos previos -> draft_seguimiento_7d', () => {
  const hoy = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_postulacion: '2026-08-21', avisos_enviados: '' };
  const { acciones } = calcularAvisosPostulacion(fila, hoy);
  assert.deepEqual(acciones, ['draft_seguimiento_7d']);
});

test('8 días con el aviso de 7d ya enviado -> sin acciones (no repite)', () => {
  const hoy = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_postulacion: '2026-08-20', avisos_enviados: '7d' };
  const { acciones } = calcularAvisosPostulacion(fila, hoy);
  assert.deepEqual(acciones, []);
});

test('14 días, 7d ya enviado -> marcar_fria_14d', () => {
  const hoy = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_postulacion: '2026-08-14', avisos_enviados: '7d' };
  const { acciones } = calcularAvisosPostulacion(fila, hoy);
  assert.deepEqual(acciones, ['marcar_fria_14d']);
});

test('sin fecha_postulacion -> incompleta, nunca asume hoy', () => {
  const hoy = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_postulacion: null, avisos_enviados: '' };
  const { incompleta, acciones } = calcularAvisosPostulacion(fila, hoy);
  assert.equal(incompleta, true);
  assert.deepEqual(acciones, []);
});

// --- casos límite extra sobre calcularAvisosPostulacion ---

test('cron se saltea días y llega a 20 sin nada enviado -> dispara 7d y 14d juntos, no se pierde el aviso', () => {
  const hoy = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_postulacion: '2026-08-08', avisos_enviados: '' };
  const { acciones } = calcularAvisosPostulacion(fila, hoy);
  assert.deepEqual(acciones, ['draft_seguimiento_7d', 'marcar_fria_14d']);
});

test('14d ya enviado también -> ninguna acción aunque pasen más días', () => {
  const hoy = new Date('2026-09-15T08:00:00Z');
  const fila = { fecha_postulacion: '2026-08-14', avisos_enviados: '7d,14d' };
  const { acciones } = calcularAvisosPostulacion(fila, hoy);
  assert.deepEqual(acciones, []);
});

// --- calcularAvisosObligacion — ventanas 72h/24h/6h ---

test('obligación a 80hs -> todavía nada', () => {
  const ahora = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_limite: '2026-08-31T16:00:00Z', avisos_enviados: '' };
  const { acciones } = calcularAvisosObligacion(fila, ahora);
  assert.deepEqual(acciones, []);
});

test('obligación a exactamente 72hs, sin avisos previos -> deadline_72h', () => {
  const ahora = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_limite: '2026-08-31T08:00:00Z', avisos_enviados: '' };
  const { acciones } = calcularAvisosObligacion(fila, ahora);
  assert.deepEqual(acciones, ['deadline_72h']);
});

test('obligación a 20hs, 72h ya enviado -> deadline_24h', () => {
  const ahora = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_limite: '2026-08-29T04:00:00Z', avisos_enviados: '72h' };
  const { acciones } = calcularAvisosObligacion(fila, ahora);
  assert.deepEqual(acciones, ['deadline_24h']);
});

test('obligación a 5hs, 72h y 24h ya enviados -> deadline_6h', () => {
  const ahora = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_limite: '2026-08-28T13:00:00Z', avisos_enviados: '72h,24h' };
  const { acciones } = calcularAvisosObligacion(fila, ahora);
  assert.deepEqual(acciones, ['deadline_6h']);
});

test('obligación ya vencida -> sin acciones (no avisar de algo que ya pasó)', () => {
  const ahora = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_limite: '2026-08-27T08:00:00Z', avisos_enviados: '' };
  const { acciones } = calcularAvisosObligacion(fila, ahora);
  assert.deepEqual(acciones, []);
});

test('fila sin fecha_limite -> no aplica, no es error', () => {
  const ahora = new Date('2026-08-28T08:00:00Z');
  const fila = { fecha_limite: null, avisos_enviados: '' };
  const { incompleta, acciones } = calcularAvisosObligacion(fila, ahora);
  assert.equal(incompleta, false);
  assert.deepEqual(acciones, []);
});
