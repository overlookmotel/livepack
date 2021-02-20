# `unwrapScopeWrapper`

`unwrapScopeWrapper` is for dealing with:

* `let` var exported from an ESM module
* Var imported by another ESM module with name changed e.g. `import {x as y} from ...`
* Function in module importing the var contains `eval()`
* Function is being serialized

Please see example dir for input and output.
