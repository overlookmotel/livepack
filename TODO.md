# TODO

* Implement changes to URLs/URLSearchParams on `dev` branch
* Tests for primitives always being inlined
* TODO comments in `objects.js`
* Remove remaining creation of dependencies during serialization
  * Need to remove dependencies from exports and export proxies
  * Idea is that records are not altered by serialization (except for `output` and `usageCount`) so a trace can be re-used afterwards
* Test for deleting existing props and then `Object.freeze()` - make sure `Object.freeze()` happens last. I think this was broken before.
* Test for unwrapping object methods with symbol keys e.g. `{ [Symbol('foo')]() {} }` (need to get functions working first)
