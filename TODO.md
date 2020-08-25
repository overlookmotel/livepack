# TODO

## Before first release:

* Tests for `exec` option
* Tests for ESM input
* Tests for `jsx` option
* Tests for source maps
* Resolve remaining TODO comments
* Basic CLI

* Delete `id` field from `scopes` + `functions`?
* Remove `example` directory
* Remove `working` directory (move some of code into tests or Github issues)

## Raise as Github issues for later resolution:

* Delete and reassign of function `.prototype` fails - output is `delete f.prototype; Object.defineProperties(f, {prototype: {value: f.prototype}});`
* Simplify structure of `dependencies` - each member of `dependencies` can be direct reference to `record` rather than `{record}`
* Handle unscoped `this` in top-level arrow functions `() => this` (equals `exports` in Node CJS, `undefined` in Node ESM, `window` in browser script, don't know what in browser ESM)
* Handle `Int16Array` etc
* Handle `TextDecoder` + `TextEncoder`
* Handle `Error`, `TypeError` etc (hide stack trace?)
* Handle `WeakRef` + `FinalizationRegistry`
* Handle class private keys + private methods
* Handle Proxies
* Treat function names differently for function expressions + declarations - in declarations, function name is a local var (acts like `let`) e.g. if function declaration, `function x() { x = 123; }` will redefine `x`; if function expression, `x = 123` error in strict mode, no-op in non-strict mode.
* Reference to class treated as circular var and injected into scope for class methods, when it doesn't need to be
* Substitute globals used in functions for created global vars
* Set strict mode on functions
* `loose` options e.g. option to strip function names (NB don't where is referenced internally `function x() { return x; }`), option to ignore `Object.freeze()` etc, option to ignore descriptors.
