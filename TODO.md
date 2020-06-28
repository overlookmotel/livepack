# TODO

* Handle destructured parameters in func definitions (`({a, b: {c}}) => {}` / `([a, b, [c]]) => {}`)
* Handle spread parameters in func definitions (`(...args) => {}`)

* Tests for block IDs unique across all files
* Tests for handling `this`
* Tests for handling `arguments`
* Tests for ensuring object keys are valid
* Tests for injecting functions into scopes
* Tests for ensuring var names are valid JS identifiers
* Tests for default params in func definitons (`(a = {}) => {}`)
* Tests for references to own function name (`function x() { return x; }`)
* Tests for references to upper function name (`function x() { return () => x; }`)

* Handle `super`
* Option to strip function names (NB don't where is referenced internally `function x() { return x; }`)
* Ensure correct function names (see below)
* Handle bound functions (created with `.bind()`)

* Symbol-keyed object properties
* Property descriptors
* RegExps etc
* Classes
* Prototypes
* Additional properties

### Function names

Classes can have a static method called `name`. This overwrites the string name given in class definition `class C {}`.

Cannot be set with `C.name = 'X'` but `Object.defineProperty(C, 'name', {value: 'X'})` works.

Solution: Where instances of a class do not all have same value for `.name` property:

* Get most popular string name of all class instances + use as name in class definition.
* Overwrite this with `Object.defineProperty()` for all instances where name differs.

NB Same goes for functions and arrow functions.
