# TODO

* De-duplicate imported vars - finish tests
* Tests for `export * from ...`
* Tests: Load fixtures with loader rather than register
* Pass `livepack_esm` into eval (both direct and indirect eval)
* Pass `state.esmImports` and `state.esmExportNames` into eval (direct `eval()` only) - NB Don't need to create temp vars inside eval, can use string literals instead as the resolved URLs are known at time `eval()` is executed
* Direct `eval()` flag `livepack_esm` as needed (`eval()` may include dynamic import)
* Throw if try to serialize function containing `import.meta`?
* Link up dynamic exports - live bindings
* `processBlock()` can no longer assume top-level scopes are singular. These's a bit of code which does assume that at present.
* Remove `topLevelVarNames` hack - no longer needed since not using `@babel/plugin-transform-modules-commonjs` any more. Actually yes it is for `@babel/plugin-transform-react-jsx` in automatic mode which inserts `import {jsx as _jsx} from 'react/jsx-runtime';`.
* Remove `@babel/plugin-transform-modules-commonjs` dependency
* CLI kill child process if exit signal received
