# TODO

## Before first release:

* Solve problem with created vars (`tracker`, `scopeId`, `temp`) interfering with tracing scope of vars in code / test not a problem
* Tests for classes
* Tests for `super` (in class methods inc constructor + static methods)
* Tests for anonymous class expressions having no name property
* Tests for ignoring `extends` var in class definitions e.g. ignore `Y` in `class X extends Y {}`
* Tests for computed method keys (`{ [x]() {} }`) in classes (inc static methods)
* Tests for ESM input
* Tests for protecting `module`, `exports`, `require` etc vars from being overwritten in CJS mode
* Resolve remaining TODO comments
* Basic CLI

* Delete `id` field from `records`, `blocks`, `scopes`, `functions`
* Remove `@babel/core` dev dependency
* Remove `example` directory
* Remove `working` directory (move some of code into tests or Github issues)

## Raise as Github issues for later resolution:

* Simplify structure of `dependencies` - each member of `dependencies` can be direct reference to `record` rather than `{record}`
* Don't treat `module` + `exports` as globals - treat as vars in top scope of file
* Handle unscoped `this` in top-level arrow functions `() => this` (equals `exports` in Node CJS, `undefined` in Node ESM, `window` in browser script, don't know what in browser ESM)
* Handle `Int16Array` etc
* Handle `TextDecoder` + `TextEncoder`
* Handle `Error`, `TypeError` etc (hide stack trace?)
* Handle `WeakRef` + `FinalizationRegistry`
* Handle class private keys + private methods
* Handle Proxies
* Treat function names differently for function expressions + declarations - in declarations, function name is a local var (acts like `let`) e.g. if function declaration, `function x() { x = 123; }` will redefine `x`; if function expression, `x = 123` error in strict mode, no-op in non-strict mode.
* Fix bug with assignment of props where prototype of superclass has a setter for this class e.g. `class X {set a(v) {}}; const x = new X(); Object.defineProperty(x, 'a', {value: 1, writable: true, enumerable: true, configurable: true})` -> `class X {set a(v) {}}; const x = Object.assign(Object.create(X.prototype), {a: 1});` so obj has no `a` prop (it triggers setter). Need to either (a) use `Object.defineProperties()` instead of `Object.assign()` or (b) define prototype after assignment. Same problem applies when prop value is circular (`x.a === x`).
* Fix bug where prop called `__proto__` is not defined correctly. `const x = {}; Object.defineProperty(x, '__proto__', {value: 1, writable: true, enumerable: true, configurable: true});` -> `{__proto__: 1}`. This defines the prototype of `x` rather than an own property `x.__proto__`. Needs to be defined with `Object.defineProperty(x, '__proto__', ...)` (NB NOT `Object.defineProperties(x, {__proto__: ...)` as this alters prototype on descriptor Object!). Therefore is independent from fix for other bug noted above.
* Reference to class treated as circular var and injected into scope for class methods, when it doesn't need to be
* Substitute globals used in functions for created global vars
* Set strict mode on functions
* `loose` options e.g. option to strip function names (NB don't where is referenced internally `function x() { return x; }`), option to ignore `Object.freeze()` etc, option to ignore descriptors.
