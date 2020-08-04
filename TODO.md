# TODO

* Anonymous class expressions have no name property
* Tests for prototype inheritance
* Tests for function inheritance
* Tests for classes
* Handle `super` (in class + object methods)
* Tests for ignoring `extends` var in class definitions e.g. ignore `Y` in `class X extends Y {}`
* Tests for computed method keys (`{ [x]() {} }`)
* Tests for methods (e.g. `{x() {}})`) not having prototypes
* Tests for protecting `module`, `exports`, `require` etc vars from being overwritten in CJS mode
* Solve problem with created vars (`tracker`, `scopeId`, `temp`) interfering with tracing scope of vars in code
* Don't treat `module` + `exports` as globals - treat as vars in top scope of file
* Handle objects (including arrays, functions, etc) which are frozen, sealed, or have extensions prevented
* Boxed primitives (e.g. `new String('x')`)
* Handle unscoped `this` e.g. top-level function `() => this`
* Built-in modules
* Substitute globals used in functions for created global vars
* Set strict mode on functions
* Option to strip function names (NB don't where is referenced internally `function x() { return x; }`)

* Delete `id` field from `records`, `blocks`, `scopes`, `functions`
* Remove `@babel/core` dev dependency
