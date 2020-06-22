# TODO

* Name `scope`, `createScope`, `createScope_fn` vars after function/block names
* Tests for ensuring var names are valid JS identifiers
* Tests for ensuring object keys are valid
* Tests for injecting functions into scopes
* Tests for handling `this`
* Tests for handling `arguments`
* Mangle vars within functions
* Make block IDs unique across all files
* Handle destructured parameters in func definitions (`({a, b: {c}}) => {}` / `([a, b, [c]]) => {}`)
* Handle spread parameters in func definitions (`(...args) => {}`)
* Tests for default params in func definitons (`(a = {}) => {}`)
* Tests for references to own function name (`function x() { return x; }`)
* Tests for references to upper function name (`function x() { return () => x; }`)
* Handle `super`
* Option to strip function names (NB don't where is referenced internally `function x() { return x; }`)

* Symbol-keyed properties
* RegExps etc
* Classes
* Prototypes
* Additional properties
