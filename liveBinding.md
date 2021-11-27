# Live bindings example

## Input

```js
// index.js
import {x, getX, setX} from './imported.js';
import * as mod from './imported.js';

export default {
  getX,
  setX,
  getX2: () => x,
  mod
};
```

```js
// imported.js
export let x = {isInitialX: true};
export const getX = () => x;
export const setX = (v) => { x = v; };
```

## Output

```js
const createLiveBinding = /* runtime function */;

const x = {isInitialX: true};

const binding = createLiveBinding(x),
  registerSetter = binding.b;

const createScopeImported = (binding, x) => (
  binding.b(v => x = v),
  [
    () => x,
    (v) = { binding.a = v; }
  ]
);
const scopeImported = createScopeImported(binding);
const getX = scopeImported[0];
const setX = scopeImported[1];

const createScopeIndex = (registerSetter, x) => (
  registerSetter(v => x = v),
  () => x
);
const getX2 = createScopeIndex(registerSetter);

const mod = {x: void 0, getX, setX};
registerSetter(v => mod.x = v);

export default {getX, setX, getX2, mod};
```

## Notes

* Above should be effectively code-splittable with `binding` in separate file from `scopeIndex`, `scopeImported` and `mod`.

## `eval()`

`eval()` in a function where has read-only access to var (i.e. `index.js` in example above) needs no further treatment. Above will work without changes as local var is set with setter.

Exception is it will allow writing to the local var inside `eval()` which should throw a const violation, but that's currently a problem with all constants being writable in `eval()`.

`eval()` in a function which has write access to var (i.e. `imported.js` in example above) can be serialized by using `with () {}` and `createLiveBindingsWith()` runtime function:

Input:

```js
// imported.js
export let x = {isInitialX: true};
export const setX = v => eval('x = v');
```

Output:

```js
const x = {isInitialX: true};
const binding = createLiveBinding(x);

const createScopeImported = (0, eval)(`
  (x) => {
    with (x) {
      (() => {
        'use strict';
        return v => eval('x = v');
      })();
    }
  }
`);

const setX = createScopeImported( createLiveBindingsWith('x', binding) );
```

NB The `x` in scope function params is not accessible inside the `with () {}` block as the with context object contains getter and setter for `x`, so shadows it. Using same var name for function param prevents an additional var entering scope.
