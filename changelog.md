# Changelog

## 0.8.2

Bug fixes:

* Instrument: Link bindings for `arguments` var and function arguments
* Retain `Module.prototype.require.main`
* Freeze vars in function containing `eval()` even if `eval` is local var
* Capture `module` objects when function declaration called `module` at top level
* Register: Better identify ESM require errors
* Rename top level `require` functions in CommonJS

Improvements:

* Instrument: Remove check for CommonJS var declaration clashes
* Instrument: Don't instrument `eval()` call with no arguments
* Register: Better fallback cache dir

Performance:

* Avoid object prop lookup getting function type

Refactor:

* Instrument: Move check for frozen binding when hoisting sloppy functions earlier
* Instrument: Don't flag bindings shared between function param and `var` binding as `isVar`
* Instrument: Define `state.getSourcesNode` upfront
* Remove unnecessary function naming shield
* Shorten code
* Instrument: Refactor `visitEval`
* Use `+` to conform strings to numbers

Dependencies:

* Update `native-type-of` dependency

Tests:

* Test for serializing `module` object from file which failed to load [improve]
* Handle non-error thrown in `validate` function [fix]

No code:

* Correct code comment
* Reformat NB code comments
* Instrument: Code comment
* Instrument: Correct typo in code comment
* Instrument: Correct JSDoc comment
* Instrument: Correct code comment

## 0.8.1

Features:

* Support serializing functions returned by `util.callbackify`

Bug fixes:

* WeakMap + WeakSet shims throw if falsy non-iterable input
* Fix error message when serializing `require.resolve` or `require.resolve.paths`
* Fix error message when serializing `require` created by `Module.createRequire`

Performance:

* WeakMap/WeakSet shims use private class fields
* Avoid Map lookup serializing WeakMap/WeakSet
* Avoid object property lookup
* Instrument: Compile internal vars using Map instead of dictionary object
* Instrument: Replace external vars object with Map
* Instrument: Replace `bindings` object with Map

Improvements:

* Remove support for `Module.createRequireFromPath`

Refactor:

* Simplify patching `util` module
* WeakMap/WeakSet shims shorten code
* WeakMap/WeakSet shims capture `WeakMap` constructor earlier
* Shorten code for serializing Sets + Maps
* Shorten code

Dependencies:

* Update `@babel/generator` dependency
* Update Babel dependencies

Tests:

* Handle validation errors which are not objects [fix]
* Improve tests for promisified functions [improve]
* Remove `transpiledFiles` from tests [improve]
* More tests for internal vars in instrumentation [improve]
* Tests for serializing `require` [improve]
* Replace fixtures dictionary object with Map [perf]
* Simplify fixtures FS shim [refactor]
* Support module don't expose `createFixtures` or `cleanupFixtures` [refactor]

Dev:

* Update dev dependencies

No code:

* Correct code comment
* Correct JSDoc comment

## 0.8.0

Breaking changes:

* Drop support for NodeJS v14, v16, v19
* Remove `inline` option
* Rename `cache` CLI option
* Make `filename` compulsory for `parse()`

Features:

* Support NodeJS v20 + v21

Bug fixes:

* Instrument: Prevent side-effects serializing classes with properties
* Don't transpile `super()` in class constructors
* Fix getting URL Symbols
* `WeakMap` + `WeakSet` shims fix memory leaks
* Convert `WeakSet` + `WeakMap` shims to classes
* Support `super` in `eval()`
* Don't freeze `this` or `super` when `eval` present
* Fix error serializing function with name prop getter which throws
* Fix serializing invalid dates
* Fix mangling function names
* Convert `++` and `--` const violations correctly
* Instrument: Fix parsing source map comments
* Fix source maps where existing source map
* `eval()` only parse `new.target` where legal
* Separate prefix nums in eval contexts
* Instrument: Prevent function info functions in sloppy mode eval being hoisted
* Suppress experimental warnings when cataloging globals
* Throw error if unknown primitive type
* Instrument: Create `arguments` binding for function before visiting function body
* Prevent duplicate var nodes in `internalVars` for read-write const violations

Improvements:

* Only freeze vars in functions where within scope of `eval()`
* Shorter output for zeroed TypeArrays
* Shorter output for zero-length buffers
* Shorter output for buffers containing zeros
* Serialize `WeakSet` + `WeakMap` entries out of order where circular values
* Classes with super-classes extend `null`
* Separate namespace for private vars in mangled var name transform
* Error message for unexpected value type
* Remove workarounds for class name property in Node v14 + v16
* Remove workarounds for NodeJS v14 + v16
* Instrument: Simplify defining temp var for classes containing `super`
* Use `allowNewTargetOutsideFunction` Babel parse option
* Instrument: Correctly set `isVar` for nested function declarations
* Call `eval` function directly
* Create temp vars in `eval`
* Instrument don't record external var trails for frozen vars
* `parseFunction` don't add `super` + `new.target` to frozen var names
* Instrument: Freeze all external vars of functions containing `eval()`
* Ensure `fnInfo.isMethod` is boolean

Performance:

* Reduce property lookups
* Reduce Set lookups
* Replace dictionary object with Map
* Avoid string concatenation in passing assertions

Refactor:

* Instrument: Remove unused function return value
* `firstMapValue` util function
* Instrument: Store bindings in external vars
* Instrument: Create function info functions at end of 2nd pass
* Reduce redundant operations
* Shorten code
* Instrument: Shorten code
* Remove unused code
* Remove unnecessary vars
* Combine var declarations
* Simplify producing frozen `this` in scopes
* Inline function
* Don't write to empty array element
* Rename var
* Eval `compile` function always return object with same shape
* Conform var to boolean
* Remove unnecessary function arg
* Instrument: Record internal var trails on binding objects
* Remove recursion in mangled var name transform
* Instrument: Rename `binding.isFunction` to `isFrozenName`
* Instrument: Remove `fn.hasThisBindingForSuper` property
* Instrumentation flag bindings which should not be internal vars
* Instrumentation create list of frozen function names
* Instrument: `getOrCreateExternalVar` take fn as param
* Instrument: Replace `flagAllAncestorFunctions` function
* Instrument: Remove unnecessary function param
* Instrument: Shorten code
* Instrument: Move creating tracker
* Instrument: Move code to create scopes
* Instrument: Move function to insert tracker into functions

Dependencies:

* Update dependencies
* `parse-node-version` dev dependency only

Tests:

* Fix test for `ImportExpression` AST node type [fix]
* Avoid instrumenting modules used by testing infrastructure [fix]
* More tests for TypedArrays
* Replace `eval` with fixtures
* Run all tests in single pass
* Workaround for bug in `@babel/generator`
* Remove workaround for bug in Jest now fixed
* Correct code comment [nocode]
* Remove out of date code comments [nocode]

Dev:

* Fix coverage
* Don't collect coverage for Jest ESLint config file [fix]
* CI run tests on Node v20
* CI run tests on Node v21
* CI run lint on Node v20
* CI run coverage on Node v18
* Run ESLint in parallel
* Update dev dependencies
* Update `jest-light-runner` dev dependency
* Replace `@overlook/jest-extended` with `jest-extended`
* Remove installing NPM from CI task [improve]

No code:

* Code comments
* Correct JSDoc comments
* Correct code comments
* Correct typo in comment
* Reformat code comments
* Reformat TODO code comments
* Reformat NB code comments
* Instrument: Remove outdated code comment
* Instrument: Code comment formatting
* Instrument: Correct JSDoc comment
* Code comment on instrumentation debugging

Docs:

* Change versioning policy

## 0.7.8

Docs:

* Remove coverage badge

## 0.7.7

Bug fixes:

* Instrumentation preserve class names from `AssignmentPattern`
* Instrument: `eval(...x)` is indirect eval
* Patch `require` functions created with `createRequire()`
* Register restore global module cache if error
* Eagerly catalog `module` module

Improvements:

* Catalog `stream/web` NodeJS internal module
* Catalog more NodeJS internal modules

Performance:

* Lazy catalog NodeJS built-in modules
* Patch `util` module methods only when `util` module loaded
* Record `require` functions in WeakMap
* Record `eval` shim functions in WeakMap

Refactor:

* Instrument: Move creation of program block
* Simplify module cache API
* Refactor determining internal/runtime file paths
* Combine statements

Dependencies:

* Remove `fs-extra` dependency
* Update dependencies

Tests:

* Run tests with `jest-light-runner` and virtual fixtures files
* Simplify use of fixtures
* Remove fallback implementation of `splitAsync`
* Don't share fixtures between tests [improve]
* Delete globals and splits cache after each test [improve]

Dev:

* Rename `LIVEPACK_DEBUG_INSTRUMENT` env
* `LIVEPACK_DEBUG_INSTRUMENT` env log instrumented `eval` code [improve]
* Workaround for Jest bug
* Replace `jest-extended` with `@overlookmotel/jest-extended`
* CI run tests using all cores [improve]
* Update Github Actions scripts
* Update dev dependencies

No code:

* Correct code comments

Docs:

* Fix Github Actions badge [fix]
* Remove David badges from README
* Update license year

## 0.7.6

Bug fixes:

* Handle `new.target` in CommonJS and eval
* Maintain return value of `eval` where statements

Performance:

* More efficient filename placeholder replacement

No code:

* Add JSDoc comments for serialize options

## 0.7.5

Bug fixes:

* Handle `new.target` in functions
* Instrument: Fix insertion of tracker comments

Dependencies:

* Update dependencies

No code:

* Update code comments
* Correct typo in code comment

Tests:

* `LIVEPACK_DEBUG_REGISTER` env [improve]
* Remove duplicate test

Dev:

* Update dev dependencies

## 0.7.4

Minor:

* Drop support for Node v17
* Drop support for Node v12

Dependencies:

* Update `convert-source-map` dependency
* Update dependencies

No code:

* Fix code comment typo

Dev:

* CI run tests on Node v18 + v19
* Update dev dependencies

Docs:

* Clarify lazy loading example
* Fix typo in README
* Fix changelog formatting

## 0.7.3

Bug fixes:

* Instrument: Catch clause `param` is optional

Performance:

* Instrument: Use `switch` + function calls consistent args

Refactor:

* Simplify handling scope vars
* Simplify code adding implicit `this` to functions with `super`
* Shorten code
* Avoid negative var name
* Rename variable

Dev:

* Update dev dependencies

## 0.7.2

Bug fixes:

* Preserve comments attached to removed 'use strict' directives

Dependencies:

* Update dependencies

Dev:

* Fix lint errors
* Update dev dependencies

Docs:

* Update license year

## 0.7.1

Bug fixes:

* Do not move complex params into function body
* ESM entry point import from CommonJS entry point

Refactor:

* Attach `eval` internal methods to `tracker` for each file
* Separate method for extracting scope vars from functions
* Tracker store result in object instead of callback
* Simplify extracting scope from functions
* Refactor and add comments to code handling `eval`

No code:

* Code comment

Tests:

* Avoid use of direct `eval()` [refactor]

## 0.7.0

Breaking changes:

* Remove register options `babelConfig` + `babelrc`
* Remove Babel plugin

Bug fixes:

* Private name identifier is not a variable

Improvements:

* Shimmed `eval` check for actual error after failure to parse code

Performance:

* Faster `traverseAll` implementation

Refactor:

* Code instrumentation re-implementation
* Add `len` arg to `getProp` etc
* Move `getProp` etc to shared functions
* Move `traverseAll` to shared functions
* Move functions out of shared folder
* Code style

Dependencies:

* Update dependencies

No code:

* Code comments

Dev:

* Update dev dependencies

## 0.6.5

Bug fixes:

* Handle functions within function params
* Preserve const violations in assignment patterns
* Escape file path in tracker comments
* Handle vars defined within `switch` statement

Performance:

* Faster lookup of parent node

Refactor:

* Separate scoping blocks for function params and body
* Split Babel plugin visitor into multiple files
* Babel plugin do not enter blocks which cannot hold vars
* Babel plugin split method enter visitor
* Babel plugin `containsUseStrictDirective` receives AST node not path
* Babel plugin reduce property lookups
* Babel plugin export `super` visitor function directly
* Babel plugin re-order visitors
* Move `setAddFrom` util to shared functions

No code:

* Fix line breaks
* Correct code comments

Docs:

* Fix formatting in README

## 0.6.4

Dependencies:

* Move `babel-jest` to dev dependencies

## 0.6.3

Bug fixes:

* Reset tracker callback after failure to extract function vars
* Retain final semicolon in unwrapped function with `exec` + `minify` options where required
* Babel plugin do not lose source location when removing directives

Improvements:

* Class name accessed in constructor is external var

Performance:

* Babel plugin record function ASTs
* Move work of parsing functions into Babel plugin
* Babel plugin `eval` record each scope var only once
* Babel plugin: Speed up serializing function ASTs

Refactor:

* Babel plugin store scopes etc in function info getter functions
* Babel plugin don't convert directives to double quotes
* Reorder `wrapFunctionWithProperties` args
* Rename var
* Code style

Dependencies:

* Update dependencies

No code:

* Correct code comment
* Add JSDoc comment
* Code comment

Tests:

* Tests for self-assigning functions [improve]
* Tests for assignment to class name inside class [improve]
* Tests for `arguments` as function param
* Capitalize test name

Dev:

* Update dev dependencies

## 0.6.2

Bug fixes:

* Fix `super` in arrow functions with getter/setter

Improvements:

* Name temp `this` + `arguments` vars with underscore prefix when within scope of `eval`

Refactor:

* Move code handling `arguments` inside `eval`
* Remove unnecessary code

Dependencies:

* Update `parse-node-version` dependency

No code:

* Correct code comment
* Code style

Tests:

* Functions tests assertion style [improve]

Dev:

* Update dev dependencies

Docs:

* Add class properties to list of unsupported features

## 0.6.1

Bug fixes:

* Super var always called `super`
* Handle `super` in arrow functions
* Babel plugin preserve implicit class name where uses super
* Correct binding location of function declarations in sloppy mode
* Throw error if tracker not called when serializing function
* Fix source maps in object methods in rare cases

Performance:

* Babel plugin avoid duplicate work recording var usage

Refactor:

* Babel plugin use own state object
* Record `argNames` as property of function, not scope

Dependencies:

* Update dependencies

No code:

* Correct code comments
* Code comments

Tests:

* `LIVEPACK_TEST_PROFILE` flag

Dev:

* CI run tests on Node v17
* Update dev dependencies

## 0.6.0

Breaking changes:

* Ignore position of `name` prop on classes

Bug fixes:

* Fix `splitAsync` error message for invalid name

Improvements:

* `splitAsync` avoid data URL import

Dependencies:

* Update dependencies

No code:

* Code comment

Dev:

* Update dev dependencies

## 0.5.5

Bug fixes:

* `eval` only makes external vars mutable if not shadowed locally

Improvements:

* Omit params from scope function where only use of var is const violation

Refactor:

* Replace `for` loop with `.forEach`

## 0.5.4

Bug fixes:

* Globals always accessible within eval
* Create create scope functions only where required
* Optional member expression property identifier is not a variable

No code:

* Correct code comment
* Code comment

Dev:

* Debug utilities
* Update dev dependencies

## 0.5.3

Bug fixes:

* Functions are not scope-internal only if referenced in other scopes
* Freeze shadowed vars in scope containing `eval()`
* Register: Include Livepack version in Babel cache keys
* Register handle files with hashbang
* `import.meta` is not a variable
* Babel plugin not include temp var for `super` in const names list
* Fix error for unexpected global

Performance:

* Move adding block to blocks map out of `createBlock`

Improvements:

* Babel plugin: Throw if run with Babel <7

Refactor:

* Module cache capture global cache at start
* Register use Babel default file extensions
* Share `internalIdentifier` fn between Babel plugin and serializer
* Move init of extra function def properties
* Rename function definition object property
* Refactor tracker comment creation
* Rename var

Dependencies:

* Update dependencies

No code:

* Correct code comments
* Clarify code comment
* Code comments

Tests:

* Additional test for scope-internal functions
* Recreate fixtures for every test [improve]
* Share support functions between Jest + Mocha tests [refactor]
* Use `toBeArguments()` [refactor]
* Fix indentation

Dev:

* `LIVEPACK_DEBUG_BABEL` env [improve]
* Update dev dependencies
* Update deep dependencies

## 0.5.2

Bug fixes:

* Self-referencing function declarations treat self as external var
* Class name used within class separate scope from outside
* Handle `eval` in dynamic method key

Improvements:

* No unnecessary injection of functions into own scopes
* Order scope function params with least used last

Performance:

* Babel plugin: Faster find parent path

Dependencies:

* Update dependencies

No code:

* Remove erroneous code comment
* Clarify code comment

Dev:

* Update dev dependencies

## 0.5.1

Bug fixes:

* Fix hang where functions refer to other functions in same block but different scope in circular pattern

## 0.5.0

Breaking changes:

* `exec` option disallowed for `js` format

Minor:

* Drop support for Node v15

Bug fixes:

* Serialize strict mode of functions
* Move tracker into function params
* Serialize boxed Symbols
* `eval()` in ESM or indirect eval does not access CommonJS vars
* Correctly handle integer object keys above MAX_SAFE_INTEGER
* Fix serialization of negative numbers
* Fix serialization of negative BigInts
* Retain directives in functions
* Do not catalog experimental `stream/web` module
* Remove comment from output for runtime function
* Correct error message
* Babel plugin: Throw unexpected error with location

Improvements:

* Don't wrap named function default export in brackets

Performance:

* Avoid unnecessary `path.get()`
* Avoid sparse array

Refactor:

* Separate trackers functions to separate vars
* Move `tracker.js` + `internal.js` into `lib/shared`
* Simplify `eval` shim
* Simplify module object creation by `splitAsync`
* Simplify logic for removal of trailing semi-colon in output JS
* `addComments` helper function
* Add file ext on require

Dependencies:

* Update dependencies

No code:

* Fix JSDoc comments
* Clarify code comment
* Code comments

Tests:

* Add tests for object methods shorthand output
* Fix error reporting [fix]
* Fix reporting of internal Jest errors [fix]
* Reset split points after tests [fix]
* Improve tests for number primitives [improve]
* Add test for large negative boxed BigInt [improve]
* Test for rendering strings in functions with double quotes [improve]
* Move `resetSplitPoints` helper into own file [refactor]
* Correct indentation [nocode]
* Correct JSDoc comment [nocode]

Dev:

* Use NPM v7 for development
* Fix test NPM scripts [fix]
* Update dev dependencies
* Update Github Actions dependencies
* CI run lint and coverage with Node v16
* Update ESLint configs
* Remove `cross-env` + `coveralls` dev dependencies

Docs:

* Remove indentation from license

Example:

* Update dependencies

## 0.4.0

Breaking changes:

* Drop support for Node v10

Bug fixes:

* Maintain const violation errors in output
* Don't treat object method names as variables
* Fix identifying read-only var assignments in functions
* Fix serialization of boxed primitives with `toString` / `valueOf` methods

Improvements:

* Shorten runtime function for creating bound functions with circular references

Dependencies:

* Update `yargs` dependency
* Update dependencies

No code:

* Remove whitespace

Dev:

* Replace `escape-string-regexp` dev dependency with `lodash/escapeRegExp`
* CI run tests on Node v16
* Update dev dependencies

Docs:

* Fix typos [fix]
* Fix code formatting [fix]
* Code formatting [improve]

## 0.3.7

Bug fixes:

* Prevent anonymous functions getting named by `export default`

## 0.3.6

Docs:

* Formatting

## 0.3.5

Docs:

* Fix formatting [fix]

## 0.3.4

Bug fixes:

* Handle functions/classes with name reserved word

Dependencies:

* Update dependencies

## 0.3.3

Bug fixes:

* Code splitting handle cyclic dependencies
* Functions returned by `splitAsync` are anonymous

Improvements:

* Ensure unique filenames not unique hashes

Performance:

* Avoid property lookup
* Pre-calculate temp filenames

Refactor:

* Init `output.filename` property

Tests:

* `itSerializes` takes entry chunk options [refactor]

## 0.3.2

Features:

* Customizable chunk names
* Stats file

Bug fixes:

* File hashes depend on type of source maps
* CLI: Accept `sourceMaps: true` option in config file

Refactor:

* Split compiling AST into separate function
* Refer to shared chunks as "common"

Tests:

* Move code-splitting source map tests [refactor]

Docs:

* Update License year
* Example: Fix comment typo [nocode]

## 0.3.1

Bug fixes:

* Serializing function containing `import` throws error

Dependencies:

* Update dependencies

No code:

* Correct JSDoc comment

Dev:

* Update dev dependencies

## 0.3.0

Breaking changes:

* ESM entry points

Features:

* `ext` + `mapExp` options

Bug fixes:

* Chunk filenames contain dot before hash in line with ESBuild
* CLI: Error if duplicate entry names

Refactor:

* Serialize: Simplify `reviseOutput`

Tests:

* Fix `format` option test [fix]

No code:

* Correct code comments

## 0.2.1

Docs:

* Fix formatting in README

## 0.2.0

Breaking changes:

* Source maps 'inline' option
* Drop support for Node < v10.4

Features:

* Code splitting

Bug fixes:

* Babel plugin: Handle class extending another class defined inline
* Place tracker comment before function params
* `exec` option only unwrap function body if safe to
* Serialize: Fix removal of tracker comments for functions with directives
* Handle deleted elements in arguments object
* Handle serializing `eval`

Improvements:

* CLI: More helpful error if source file cannot be loaded
* Bugs print message asking user to file issue

Performance:

* Register: Do not transpile modules used internally for handing `eval`
* Store CommonJS vars on `globals`
* Speed up checking if record is a primitive
* Init all props of `internal` object
* Import lodash functions directly

Refactor:

* `Serializer` class `serialize` method always return array of files
* Convert source map sources to relative paths at output
* Move initialization of trace to `Serializer` class ctor
* Re-order initialization in `Serializer` class ctor
* Place tracker comment before function body
* Babel plugin: Avoid use of Babel paths in inserting tracker comments
* Simplify initialization of global var names
* Clarify vars in parsing functions
* Simplify options conform
* Move all `Serializer` class methods to separate files
* Move blocks logic into separate file
* Move blocks initialization to separate method
* Move output file names + exts to constants file
* `serialize` move conforming options to separate function

Dependencies:

* Update `@babel/register` dependency
* Update dependencies

Tests:

* Tests for function param defaults
* Tests for nested functions
* Tests for serializing functions used within Livepack
* Fix ESM to CJS transform [fix]
* Correct test name [fix]
* `LIVEPACK_TEST_QUICK` env option
* Reduce dependencies for source map tests
* `itSerializes.each` helper [refactor]
* `.withOptions()` helper
* Re-implement `itSerializesEqual` using default options [refactor]
* Rename `runExpectation` function [refactor]
* `itSerializes` accept array of formats
* Tweak Node version support check

No code:

* Code comments
* Correct typo in code comment

Dev:

* Add tests temp dir to `.gitignore`
* ESLint rules for `itSerializes.each` tests
* Remove defunct ESLint config
* Update dev dependencies

Docs:

* README update

## 0.1.8

Bug fixes:

* Place tracker comment before key for methods with computed key

Dependencies:

* Update dependencies

Improvements:

* Do not serialize scope var values if not read from

Performance:

* Register: Do not transpile modules used internally
* Shorten code path for multiple instances of same function

Refactor:

* Move runtime functions into separate dir
* Babel plugin: Shorten code
* Babel plugin: Inline var
* Remove old workaround for Babel bug

No code:

* Babel plugin: Code comment
* Code comments
* Fix indentation

Tests:

* Tests for `register`
* Inline fixtures [refactor]
* Refactor [refactor]

Dev:

* CI run tests on Node v15
* Update Dependabot config
* Update dev dependencies

Docs:

* Corrections + clarifications

## 0.1.7

Features:

* Provide Jest transformer `livepack/jest-transform`

Dev:

* Update dev dependencies

## 0.1.6

Bug fixes:

* Serialize functions returned by `require('util').promisify()`
* Fix serialization of `require('util').debuglog()` functions

No code:

* Correct code comments

## 0.1.5

Bug fixes:

* Source mapping failures log not throw

Docs:

* Fix typos

## 0.1.4

Features:

* Support `eval`
* Register: Transpile dynamic `import` to `require` in ESM mode
* Provide trace with untracked function error

Improvements:

* Babel plugin: Remove undocumented `initPath` option

Performance:

* CLI: Import `register` late

Bug fixes:

* Catalog global getters + setters
* Catalog global prototypes and props behind getters
* Handle 'use strict' in functions
* Serialize functions returned by `require('util').debuglog()`
* Catalog V8 `CallSite` class
* CLI: Serialize `null`
* Workaround Babel bug with arrow expression returning object
* Handle extra properties on arguments objects
* CLI: Correct usage string
* CLI: Throw unhandled rejections

Refactor:

* Babel plugin: Create all internal vars with common prefix
* `init` perform imports late
* Babel plugin: Split visitor into multiple files
* Babel plugin: Move internal vars functions into own file
* Split `shared` into multiple files
* Simplify file paths
* Remove duplicate code
* Remove dead code

Dependencies:

* Update `yargs` dependency

Dev:

* Update dev dependencies

No code:

* Babel plugin: Code comment

Docs:

* Update section on unsupported JS features

## 0.1.3

Docs:

* Fix GitHub CI badge [fix]

## 0.1.2

Docs:

* Fix CLI examples

## 0.1.1

Docs:

* Update README

## 0.1.0

* Initial release
