# TODO

* Tests
* Test for `"use strict"` directive in function not being moved up to outside `with ()`
* Test for multiple `with ()`s between var and its binding
* Test for `with ()` with no `{}` statement block
* Tests for `with` in `eval()`
* Tests for `this` where implicitly used by `super()` and `super`
* Test for `with` nested in `with` value:
  `with ( (() => { const o = {x: 123}; with ({}) return o; })() ) x;`

* Raise Github issue for getting `eval`:

```js
with ({eval: 123}) {
  return () => eval;
}
```

Instrumentation replaces `eval` with `livepack_tracker.evalIndirect`, and therefore avoids
getting `eval` from the `with ()` object.

* Raise Github issue for interaction with const violations

e.g. How to deal with this? Whether `x = 2` is a const violation depends on whether `obj` has a property called `x` or not.

```js
const x = 1;
with (obj) {
  module.exports = () => { x = 2; };
}
```

Could output a 2nd `with ()` which catches const violations:

```js
x => with$0 => {
  with ({get x() { return x; }, set x(v) { const x = 0; x = 0; }}) with (with$0) return () => { x = 2; };
}
```

Or for a silent const, a setter which does nothing:

```js
x => with$0 => {
  with ({get x() { return x; }, set x(v) {}}) with (with$0) return () => { x = 2; };
}
```

The latter wouldn't work if assignment is in strict mode function and so should throw. e.g.:

```js
function x() {
  with (obj) {
    return () => {
      'use strict';
      x = 2;
    };
  }
}
module.exports = x();
```

If multiple `with` blocks, would need to put the "protector" `with` outside the last `with`.

This same technique could be used to prevent mutating consts in `eval()`.
