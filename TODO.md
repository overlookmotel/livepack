# TODO

* Tests for classes
* Tests for `super` (in class methods inc constructor + static methods)
* Tests for anonymous class expressions having no name property
* Tests for ignoring `extends` var in class definitions e.g. ignore `Y` in `class X extends Y {}`
* Tests for computed method keys (`{ [x]() {} }`) in classes (inc static methods)
* Tests for ESM input
* Tests for protecting `module`, `exports`, `require` etc vars from being overwritten in CJS mode

* Solve problem with created vars (`tracker`, `scopeId`, `temp`) interfering with tracing scope of vars in code
* Handle unscoped `this` in top-level arrow functions `() => this` (equals `exports` in Node CJS, `undefined` in Node ESM, `window` in browser script, don't know what in browser ESM)
* Handle `new TextDecoder()` + `new TextEncoder()`
* Handle `Int16Array` etc
* Handle `Error`, `TypeError` etc (hide stack trace?)
* Handle `WeakRef` + `FinalizationRegistry`
* Treat function names differently for function expressions + declarations - in declarations, function name is a local var (acts like `let`) e.g. if function declaration, `function x() { x = 123; }` will redefine `x`; if function expression, `x = 123` error in strict mode, no-op in non-strict mode.

* Reference to class treated as circular var and injected into scope for class methods, when it doesn't need to be
* Don't treat `module` + `exports` as globals - treat as vars in top scope of file
* Substitute globals used in functions for created global vars
* Set strict mode on functions
* Option to strip function names (NB don't where is referenced internally `function x() { return x; }`)

* Delete `id` field from `records`, `blocks`, `scopes`, `functions`
* Remove `@babel/core` dev dependency
