# TODO

* Reference to class treated as circular var and injected into scope for class methods, when it doesn't need to be
* Treat function names differently for function expressions + declarations - in declarations, function name is a local var (acts like `let`) e.g. if function declaration, `function x() { x = 123; }` will redefine `x`; if function expression, `x = 123` error in strict mode, no-op in non-strict mode.
* Tests for function inheritance (inc where also has properties)
* Tests for classes
* Tests for `super` (in class + object methods)
* Tests for anonymous class expressions have no name property
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
