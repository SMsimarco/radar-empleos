'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decidir, normalizarEmpresaPuesto } = require('../reglas.js');

// Oferta base con todos los campos del esquema en null/vacío — cada test
// pisa solo lo que necesita, así queda claro qué campo dispara la regla.
function ofertaBase(overrides = {}) {
  return {
    empresa: 'Empresa Test',
    puesto: 'Puesto Test',
    modalidad: 'remoto',
    ubicacion_requerida: null,
    tipo_contrato: 'full time',
    horas_semanales: null,
    salario_min: null,
    salario_max: null,
    salario_moneda: null,
    anios_experiencia_min: null,
    anios_excluyente: null,
    titulo_requerido: null,
    titulo_excluyente: null,
    frases_exclusion: [],
    stack: [],
    postulantes: null,
    antiguedad_horas: null,
    postulacion_rapida: null,
    link: null,
    confianza_extraccion: 0.9,
    ...overrides,
  };
}

test('1. encaja en stack pero excluye juniors por años -> DESCARTAR', () => {
  const oferta = ofertaBase({
    stack: ['React', 'Node.js', 'PostgreSQL'],
    anios_experiencia_min: 5,
    anios_excluyente: true,
    postulantes: 10,
  });
  const { estado } = decidir(oferta);
  assert.equal(estado, 'DESCARTAR');
});

test('2. stack ok pero sin ningún dato de competencia -> MIRAR (nunca POSTULAR YA)', () => {
  const oferta = ofertaBase({
    stack: ['React', 'Node.js', 'PostgreSQL'],
    postulantes: null,
    antiguedad_horas: null,
    postulacion_rapida: null,
  });
  const { estado, motivo } = decidir(oferta);
  assert.equal(estado, 'MIRAR');
  assert.match(motivo, /competencia/i);
});

test('3. duplicada por 2 alertas distintas -> misma key de dedup pese a formato distinto', () => {
  const keyA = normalizarEmpresaPuesto('TechNova Solutions S.A.', 'Full Stack Developer');
  const keyB = normalizarEmpresaPuesto('  technova solutions  ', 'full stack developer');
  assert.equal(keyA, keyB);
});

test('4. part time 20hs, stack ok, competencia baja -> POSTULAR YA', () => {
  const oferta = ofertaBase({
    tipo_contrato: 'part time',
    horas_semanales: 20,
    stack: ['Python', 'React', 'Node'],
    postulantes: 8,
  });
  const { estado } = decidir(oferta);
  assert.equal(estado, 'POSTULAR YA');
});

test('5. extracción casi toda null (el modelo no encontró nada) -> MIRAR, no DESCARTAR', () => {
  const oferta = ofertaBase({ confianza_extraccion: 0.2 });
  const { estado, motivo } = decidir(oferta);
  assert.equal(estado, 'MIRAR');
  assert.match(motivo, /stack/i);
});

test('6. ya postulado a esa empresa+puesto -> DESCARTAR', () => {
  const oferta = ofertaBase({
    stack: ['React', 'Node.js', 'PostgreSQL'],
    postulantes: 5,
  });
  const { estado, motivo } = decidir(oferta, { yaPostulado: true });
  assert.equal(estado, 'DESCARTAR');
  assert.match(motivo, /ya te postulaste/i);
});

test('7. título excluyente (maestría) -> DESCARTAR', () => {
  const oferta = ofertaBase({
    stack: ['React', 'Node.js', 'PostgreSQL'],
    titulo_requerido: 'maestría',
    titulo_excluyente: true,
    postulantes: 5,
  });
  const { estado } = decidir(oferta);
  assert.equal(estado, 'DESCARTAR');
});

test('8. frase de exclusión aplica al perfil (junior) sin anios_excluyente explícito -> DESCARTAR', () => {
  const oferta = ofertaBase({
    stack: ['React', 'Node.js', 'PostgreSQL'],
    anios_excluyente: null,
    frases_exclusion: ['Not looking for junior profiles at this time.'],
    postulantes: 5,
  });
  const { estado, motivo } = decidir(oferta);
  assert.equal(estado, 'DESCARTAR');
  assert.match(motivo, /junior/i);
});

test('9. competencia baja pero stack no coincide -> MIRAR', () => {
  const oferta = ofertaBase({
    stack: ['Ruby', 'Rails'],
    postulantes: 3,
  });
  const { estado, motivo } = decidir(oferta);
  assert.equal(estado, 'MIRAR');
  assert.match(motivo, /stack no coincide/i);
});

test('10. publicada hace poco (antiguedad_horas bajo) + stack ok -> POSTULAR YA', () => {
  const oferta = ofertaBase({
    stack: ['React', 'Express', 'PostgreSQL'],
    antiguedad_horas: 2,
  });
  const { estado, motivo } = decidir(oferta);
  assert.equal(estado, 'POSTULAR YA');
  assert.match(motivo, /hace 2hs/i);
});
