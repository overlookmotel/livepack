# TODO

* Tests for destructured parameters in func definitions (`({a, b: {c}}) => {}` / `([a, b, [c]]) => {}`)
* Tests for spread parameters in func definitions (`(...args) => {}`)

* Tests for block IDs unique across all files
* Tests for avoiding var names clashing with globals
* Tests for injecting functions into scopes
* Tests for destructured params in func definitions (`({a}) => {}`, `({a: {b}}) => {}`)
* Tests for spread params in func definitions (`(...a) => {}`, `([...a]) => {}`, `({a, ...b}) => {}`)
* Tests for destructured vars in funcs (`() => {const {a} = {a: 123};}`, `() => {const {a: {b}} = {a: {b: 123}};}`)
* Tests for spread vars in funcs (`(...a) => {}`, `([...a]) => {}`, `({a, ...b}) => {}`)
* Tests for references to own function name (`function x() { return x; }`)
* Tests for references to upper function name (`function x() { return () => x; }`)
* Tests for labels not identified as vars

* Handle `super`
* Option to strip function names (NB don't where is referenced internally `function x() { return x; }`)
* Ensure correct function names (see below)
* Handle bound functions (created with `.bind()`)

* Symbol-keyed object properties
* Property descriptors
* RegExps etc
* Maps, Sets, WeakMaps, WeakSets
* Classes
* Prototypes
* Additional properties
* Set strict mode on functions

### Function names

Classes can have a static method called `name`. This overwrites the string name given in class definition `class C {}`.

Cannot be set with `C.name = 'X'` but `Object.defineProperty(C, 'name', {value: 'X'})` works.

Solution: Where instances of a class do not all have same value for `.name` property:

* Get most popular string name of all class instances + use as name in class definition.
* Overwrite this with `Object.defineProperty()` for all instances where name differs.

NB Same goes for functions and arrow functions.
