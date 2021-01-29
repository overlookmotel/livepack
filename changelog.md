# Changelog

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
