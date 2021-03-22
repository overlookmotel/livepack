# Changelog

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
