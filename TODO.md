# TODO

* Implement changes to URLs/URLSearchParams on `dev` branch
* Add new tests for Objects and Arrays to `dev` branch (if tests fail, comment them out with a TODO comment)
* Tests for primitives always being inlined - add to `dev` branch
* Test for deleting existing props and then `Object.freeze()` - make sure `Object.freeze()` happens last. Worked before, but may not have a test. e.g. `function f() {}; delete f.name; Object.freeze(f)`. Add tests to `dev` branch.
* Test for unwrapping object methods with symbol keys e.g. `{ [Symbol('foo')]() {} }`. Add tests on `dev` branch - not sure if this works at present.
* TODO comments in `objects.js`
* Implement serializing functions
* Remove remaining creation of dependencies during serialization
  * Need to remove dependencies from exports and export proxies
  * Idea is that records are not altered by serialization (except for `output` and `usageCount`) so a trace can be re-used afterwards
