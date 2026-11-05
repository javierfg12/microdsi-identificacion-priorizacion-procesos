const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createContext({ href = 'https://example.test/feed.html', stored = {} } = {}) {
  const values = { ...stored };
  const listeners = {};
  const window = {
    location: {
      href,
      assigned: null,
      assign(url) { this.assigned = url; },
    },
  };
  const document = {
    addEventListener(type, callback) { listeners[type] = callback; },
    querySelector() { return null; },
    createElement() { return { classList: { toggle() {} }, setAttribute() {}, click() {} }; },
  };
  const localStorage = {
    getItem(key) { return Object.hasOwn(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
  };
  const context = vm.createContext({
    window, document, localStorage, URL, console,
    Blob: class Blob {},
  });
  const source = fs.readFileSync('assets/app.js', 'utf8');
  vm.runInContext(source, context);
  return { context, values, window, listeners };
}

test('reconoce los tres tracks y sus casos guiados', () => {
  const { context } = createContext();
  const result = vm.runInContext(
    'TRACKS.every(t => LESSONS.every(l => Array.isArray(l.examples[t.id]))) && TRACKS.every(t => PISTA_STEPS[t.id].length === 5)',
    context
  );
  assert.equal(result, true);
});

test('el parámetro URL prevalece y el selector persiste el nuevo track', () => {
  const { context, values, window } = createContext({
    href: 'https://example.test/feed.html?track=hr',
    stored: { track: 'itsm' },
  });
  assert.equal(vm.runInContext('getTrack()', context), 'hr');
  vm.runInContext('setTrack("proc")', context);
  assert.equal(values.track, 'proc');
  assert.equal(new URL(window.location.assigned).searchParams.get('track'), 'proc');
});

test('usa el track guardado cuando la URL no especifica uno', () => {
  const { context } = createContext({ stored: { track: 'proc' } });
  assert.equal(vm.runInContext('getTrack()', context), 'proc');
});

test('un JSON de progreso corrupto no bloquea la aplicación', () => {
  const { context } = createContext({ stored: { marks: '{invalid' } });
  assert.equal(vm.runInContext('Object.keys(readStorageJSON("marks")).length', context), 0);
});

test('marcar una lección actualiza persistencia y accesibilidad', () => {
  const { context, values } = createContext();
  const state = { textContent: '', pressed: '', classes: [], classList: {
    toggle(name, enabled) { this.classes = this.classes.filter(x => x !== name); if (enabled) this.classes.push(name); },
  }, setAttribute(name, value) { if (name === 'aria-pressed') this.pressed = value; } };
  context.btn = state;
  vm.runInContext('toggleMark(2, btn)', context);
  assert.equal(JSON.parse(values.marks)['itsm:2'], true);
  assert.equal(state.textContent, 'Marcado');
  assert.equal(state.pressed, 'true');
  vm.runInContext('toggleMark(2, btn)', context);
  assert.equal(JSON.parse(values.marks)['itsm:2'], false);
  assert.equal(state.pressed, 'false');
});
