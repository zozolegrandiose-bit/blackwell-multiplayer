// Minimal DOM shim for exercising the client-side render functions under Node,
// without a real browser. Usage pattern (see past patch test scripts in git history):
//   require("./test_dom_shim");
//   const combined = [...file paths...].map(p => fs.readFileSync(p, "utf8")).join("\n;\n") + testCode;
//   (0, eval)(combined);
// Concatenating files into ONE eval call (rather than one eval per file) matters:
// top-level const/let declarations are only shared with later code inside the SAME
// eval call, exactly like multiple <script> tags sharing one page's global scope.
function makeStubEl() {
  const el = {
    innerHTML: "",
    value: "",
    textContent: "",
    style: {},
    addEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
  };
  return el;
}

const elCache = {};
global.document = {
  getElementById(id) {
    if (!elCache[id]) elCache[id] = makeStubEl();
    return elCache[id];
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return makeStubEl(); }
};
global.window = {};
global.socket = { emit() {}, on() {} };

const fs = require("fs");

function loadAll(paths) {
  const combined = paths.map(p => fs.readFileSync(p, "utf8")).join("\n;\n");
  (0, eval)(combined);
}

module.exports = { loadAll, makeStubEl };
