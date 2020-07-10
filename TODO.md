# TODO

* Fix descriptor assignments - after `a.x = 1`, `Object.defineProperty(a, 'x', {value: 2})` keeps `writable`, `enumerable`, `configurable` all true, but this code will erroneously be generated at present for when all set to `false`
* Prototypes
* Classes
* Ignore `extends` var in class definitions e.g. ignore `Y` in `class X extends Y {}`
* Handle `super` (in class + object methods)
* Tests for protecting `module`, `exports`, `require` etc vars from being overwritten in CJS mode
* Handle objects (including arrays, functions, etc) which are frozen, sealed, or have extensions prevented
* Handle unscoped `this` e.g. top-level function `() => this`
* Substitute globals used in functions for created global vars
* Built-in modules
* Set strict mode on functions
* Option to strip function names (NB don't where is referenced internally `function x() { return x; }`)

* Delete `id` field from `records`, `blocks`, `scopes`, `functions`
* Remove `@babel/core` dev dependency
