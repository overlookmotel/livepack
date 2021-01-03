# Scopes

## Structures

### File

```js
{
  blocks: Map(<number>: <Block>) // Keyed by block ID
}
```

TODO If no other props to be added to `File`, could reduce to just the map of `Block`s.

`files` is an object keyed by path.

### Block

```js
{
  variables: Map(<string>: <Variable>) // Keyed by var name
}
```

TODO If no other props to be added to `Block`, could reduce to just the map of `Variable`s.

### Variable

```js
{
  name: <string>,
  values: Map(<number>, <Value>), // Keyed by scope ID
  nodes: [<Node>], // Babel nodes for use of var
  isConst: <boolean>, // Initially starts as `true`
  isCircular: <boolean>, // Initially starts as `false`
  isLockedName: <boolean> // Initially starts as `false`
}
```

### FunctionVariable

```js
{
  variable: <Variable>,
  nodes: [<Node>], // Babel nodes for use of var in function
  isConst: <boolean>,
  isCircular: <boolean>, // Initially starts as `false`
  isLockedName: <boolean>
}
```

### Value

```js
{
  val: <Any>,
  record: <Record>,
  variable: <Variable>,
  isConst: <boolean> // Initially starts as `true`
}
```

### Function

```js
{
  id: <number>,
  functionInstances: [<FunctionInstance>],
  functionVariables: [<FunctionVariable>]
}
```

### FunctionInstance

```js
{
  record: <Record>,
  function: <Function>,
  values: [<Value>] // In same order as `function.functionVariables`
}
```

## Process

### Babel plugin

Unchanged from current except:

* Determine and record if variables are defined with a `const` statement (NB `class {}` declarations are not constants)

### During serialization

As functions are serialized, all of above structures are created.

If function not seen before:

* Create `Function` object
* For each external variable used in function:
  * Locate existing `Variable` from `files[path].blocks.get(blockId).variables.get(varName)`
  * If doesn't exist, create new `Variable` (and create new `File` and `Block` if not existing)
  * Add `{variable, nodes, isConst, isLockedName}` to `function.functionVariables`
    * `nodes` is array of Babel nodes for usages of this var in function
    * `isConst` set depending whether this function may write to the var or not
      * If Babel plugin says var defined as const, is always `true`
      * Otherwise, if function contains `eval()`, is always `false`
      * Otherwise, set depending on whether function contains assignments to var or not
    * `isLockedName` set depending whether this function contains `eval()`

NB If function contains `eval()`, all variables in outer scopes of function are considered as used in function.

Then:

* Create `FunctionInstance` object
* Add functionInstance to `function.functionInstances`
* For each in `function.functionVariables`:
  * Serialize value of var
  * If value is circular, set `functionVariable.isCircular = true`
  * Locate existing `Value` from `variable.values.get(scopeId)`
  * If none existing, create new `Value` and add to `variable.values`
  * If `functionVariable.isConst === false`, set `value.isConst = false`

### Before output

NB At this point, the following properties of `Variable`s are undefined:

* `nodes`
* `isConst`
* `isCircular`
* `isLockedName`

Need to determine these from `functionVariables` of each `Function`.

TODO Loop through functions and construct tree of var dependencies. How?

Step 1: Any function where all function instances use same `Value` and that `Value` is a const" var can be moved to top scope, and function disconnected from that var + value (i.e. value becomes a dependency of the function, lazy dependency if `isCircular` is true).

TODO Split `Variable`s into multiple `Variable`s where are constants and no two functions using it are bound together by another non-const variable.

TODO Ensure functions containing `eval()` only have access to the vars that they originally did.
