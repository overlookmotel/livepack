# TODO

* Additional properties
* RegExps etc
* Maps, Sets
* WeakMaps, WeakSets
* Classes
* Handle `super` (in class + object methods)
* Prototypes
* Globals
* Built-in modules
* Set strict mode on functions
* Ensure correct function names (see below)
* Option to strip function names (NB don't where is referenced internally `function x() { return x; }`)

* Delete `id` field from `records`, `blocks`, `scopes`, `functions`
* Remove `@babel/core` dev dependency

### Function names

Classes can have a static method called `name`. This overwrites the string name given in class definition `class C {}`.

Cannot be set with `C.name = 'X'` but `Object.defineProperty(C, 'name', {value: 'X'})` works.

Solution: Where instances of a class do not all have same value for `.name` property:

* Get most popular string name of all class instances + use as name in class definition.
* Overwrite this with `Object.defineProperty()` for all instances where name differs.

NB Same goes for functions and arrow functions.
