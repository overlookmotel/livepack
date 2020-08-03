# TODO

* Prototype inheritance
* Function inheritance
* Classes
* Handle `super` (in class + object methods)
* Tests for ignoring `extends` var in class definitions e.g. ignore `Y` in `class X extends Y {}`
* Tests for computed method keys (`{ [x]() {} }`)
* Fix var name clashes between scope params + function names e.g. `let x = function() { return x; }; const y = x; x = 123; module.exports = y;` - serialized version is `module.exports = (x => function x() { return x; })(123);` - result of `x()` is function, not `123`
* Tests for methods (e.g. `{x() {}})`) not having prototypes
* Tests for protecting `module`, `exports`, `require` etc vars from being overwritten in CJS mode
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
