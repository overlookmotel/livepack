# TODO

* Tests
  * Tests for local `eval` var.
  * Tests for local `eval` var accessed within nested `eval()`s, including where internal vars prefix num changes.
  * Test for simple code within eval where accesses local `eval` outside e.g. `let {eval} = global; module.exports = eval('eval');` - to make sure `eval()` code is instrumented even though contains no functions.
  * Ditto but with prefix num change `let {eval} = global; module.exports = eval('let livepack_tracker; eval');`

  * `const livepack_tracker` in indirect `(0, eval)()` doesn't affect behavior.
  * `const eval` top level in direct `eval()` doesn't affect behavior.
  * `const eval` top level in indirect `(0, eval)()` doesn't affect behavior.

  * `var eval;` in code in indirect eval call. `eval` var should not be renamed in this case as is global.
  * Ditto for direct `eval()` inside indirect eval.

  * For serializing function with a local var called `eval` in scope. `const eval = 1; module.exports = () => eval;`.
  * Ditto but where that var used for `eval()` call. Var name needs to be frozen. `const eval = () => {}; module.exports = v => eval(v);`
  * Ditto for internal var used for `eval()` call. Var name needs to be frozen. `module.exports = eval => eval('123');`

  * For local var `eval` which isn't global `eval` called with `eval()`. Should not lookup local var more than once.

```js
let numEvalLookups = 0;
const withObj = { get eval() { numEvalLookups++; return () => 123; } };
with (withObj) {
	eval('456');
}
// `numEvalLookups` should be 1
```

* Handle function declarations called `eval`. They need to be renamed to `livepack_localEval` while maintaining the function's `.name` property. Add call to `livepack_getScopeId.setName()` as 1st statement of block they're defined in. Need to add that in 2nd pass when exiting block.
* Handle function expressions called `eval`. Rename to `livepack_localEval` and wrap in `livepack_getScopeId.setName()` to set name.
* NB classes cannot be named `eval` because entirety of class is strict mode. `class eval {}` is a syntax error.
* Handle function/class expressions which gain name of `eval` implicitly from assignment e.g. `const eval = function() {}`. Wrap in naming object `{eval: ...}.eval`. NB Cannot use `livepack_getScopeId.setName()` because of classes with a static `name()` method or static `name` property. `AssignmentExpression`, `AssignmentPattern`, `VariableDeclarator` all do this. Will need to do this in 2nd pass for the `AssignmentExpression` etc, and avoid renaming `Identifier` first because would screw up `eval = class extends S {}` which causes a wrapper to be added when visiting the class node.
* Somewhere there's an assumption that `eval` is always global. This is no longer true. Find it and fix.
