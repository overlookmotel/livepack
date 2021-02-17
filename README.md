[![NPM version](https://img.shields.io/npm/v/livepack.svg)](https://www.npmjs.com/package/livepack)
[![Build Status](https://img.shields.io/github/workflow/status/overlookmotel/livepack/Test.svg)](https://github.com/overlookmotel/livepack/actions)
[![Dependency Status](https://img.shields.io/david/overlookmotel/livepack.svg)](https://david-dm.org/overlookmotel/livepack)
[![Dev dependency Status](https://img.shields.io/david/dev/overlookmotel/livepack.svg)](https://david-dm.org/overlookmotel/livepack)
[![Coverage Status](https://img.shields.io/coveralls/overlookmotel/livepack/master.svg)](https://coveralls.io/r/overlookmotel/livepack)

# Serialize live running code to Javascript

## Introduction

Most bundlers/transpilers convert Javascript code as *text* to some other form of Javascript code, also in text form.

Livepack is different - it takes a NodeJS app and produces Javascript from the live code *as it's running*. Essentially it's a serializer.

The difference from other serializers like [serialize-javascript](https://www.npmjs.com/package/serialize-javascript) is that Livepack can handle function scopes and closures, so it's capable of serializing entire applications.

If you pack this with Livepack:

```js
const externalVar = 123;
function foo() { return externalVar; }
```

...you get `(externalVar => function foo() {return externalVar;})(123)`. The var in upper scope is captured. This works even with complex nested functions, currying etc.

### What's included in the output?

Everything.

Whatever values are referenced in functions you serialize is included in the output. This includes code and objects that came from packages in `node_modules`.

The entire app is output as a single `.js` file, with no dependencies.

### Why is this a good thing?

#### Faster startup

Many apps do time-consuming "bootstrapping" at startup (reading files from the filesystem, HTTP requests, loading data from a database).

With Livepack, you can run this "bootstrap" code, and then snapshot the state of the app at that point in time.

When you run the built app, the bootstrapping work is already done - it was done at build time instead of run time. Combined with the entire app's code being in a single file, an app built with Livepack should be faster to start.

#### Tree-shaking by default

Livepack doesn't perform tree-shaking exactly, but works more like a garbage collector - any value which is not referenced in the the objects/functions you serialize is omitted from the build.

This is more effective than tree-shaking as it doesn't rely on static analysis of the code, which can miss opportunities to discard unreferenced values.

#### Mix build-time and run-time code

Any values which are calculated before serialization are included in the build pre-calculated. `ONE_GB = 1024 * 1024 * 1024;` is serialized as the result, `1073741824`. This is a trivial example, but any calculation of arbitrary complexity can be performed at build time.

#### Dynamic builds

This is the most compelling advantage, but the hardest to explain.

Javascript is a dynamic language, but our current build tools are static.

Livepack *runs* the code you give it and outputs the *result*. So your app can build itself. Data is code, and code is data - there's no difference between the two.

* Read from the filesystem, and create Express routes pointing to each `.js` file (build your own NextJS)
* Read from a database table and create React components for each row in the table
* Pull data from an API and customize your app accordingly

### Design principles

Livepack has an emphasis on correctness. It will not always output the most compact code, but the output should perfectly reproduce the input (including function names, property descriptors etc, which tools like Babel often do not faithfully translate).

## Usage

### Installation

```sh
npm install -D livepack
```

### CLI

```sh
npx livepack <input> -o <output dir>
```

Input should be the entry point of the app to be packed.

```sh
npx livepack src/index.js -o build
```

The entry point must export a function which will be executed when the built app is run.

This is unlike bundlers like Webpack and Rollup. You must *export* a function including the code you want to run when the built app is launched. Top-level code will be executed *during build*, not at runtime.

```js
module.exports = function() {
  console.log('hello!');
};
```

or (see `esm` option below):

```js
export default function() {
  console.log('hello!');
}
```

#### Promises

If your app needs to do some async work before serializing, export a Promise.

```js
module.exports = (async () => {
  // Do async stuff
  const obj = await Promise.resolve({x: 1, y: 2});

  // Return a function which will be executed at runtime
  return function() {
    console.log(obj.x * obj.y);
  };
})();
```

#### Options

| Option | Usage | Default |
|-|-|-|
| `--output` / `-o` | Output directory (required) | |
| `--format` / `-f` | Output format - either `esm` or `cjs` | `esm` |
| `--esm` | Enable if codebase being serialized contains ECMAScript modules (`import x from 'x'`) | Disabled |
| `--jsx` | Enable if codebase being serialized contains JSX | Disabled |
| `--minify` / `-m` | Minify output | Disabled |
| `--mangle` / `--no-mangle` | Mangle (shorten) var names | Follows `minify` |
| `--comments` / `--no-comments` | Remove comments from source | Follows `minify` |
| `--no-inline` | More verbose output. Only useful for debugging. | Inlining enabled |
| `--source-maps` / `-s` | Output source maps | Disabled |
| `--no-exec` | Output a file which exports the input rather than executes it. | Exec enabled |
| `--babel-config` | By default, Livepack ignores any `babel.config.js` files. Set this option to `pre` to transform code with Babel before running and serializing it. | Disabled |
| `--babelrc` | By default, Livepack ignores any `.babelrc` files. Set this option to `pre` to transform code with Babel before running and serializing it. Follows `babel-config` option by default. | Disabled |
| `--babel-config-file` | Path to Babel config file (optional) | (none) |
| `--no-babel-cache` | Disable Babel's cache | Cache enabled |

#### Config file

You can set options in a `livepack.config.json` file rather than on command line. Config file can be in `.json` or `.js` format in root dir of the app. If `.js`, must be CommonJS.

```json
// livepack.config.json
{
  "input": "./src/index.js",
  "output": "build",
  "format": "esm",
  "esm": true,
  "jsx": true,
  "minify": true,
  "mangle": true,
  "comments": false,
  "inline": true,
  "sourceMaps": true,
  "exec": true,
  "babelConfig": false,
  "babelrc": false,
  "babelConfigFile": null,
  "babelCache": true
}
```

Then run Livepack with:

```js
npx livepack
```

All of the above options are optional except `input` and `output`.

### Programmatic API

There are two parts to the programmatic API.

1. Require hook
2. `serialize()` method

#### Require hook

Livepack instruments the code as it runs, by patching NodeJS's `require()` function. It uses [@babel/register](https://babeljs.io/docs/en/babel-register) internally. This instrumentation is what allows Livepack to capture the value of variables in closures.

Your app must have an entry point which registers the require hook, and then `require()`s the app itself.

```js
// index.js
require('livepack/register');
module.exports = require('./app.js');
```

```js
// app.js
module.exports = function() {
  // App code here...
};
```

You **must** register the require hook before **any** other `require()` calls. The input file should be just be an entry point which `require()`s the app and exports it. Code in the entry point file will not be instrumented and so cannot be serialized.

The entry point file must be CommonJS. The rest of the app can be written in ESM (use `esm` option).

#### Require hook options

You can provide options to the require hook:

```js
require('livepack/register')( {
  // Options...
} )
```

| Option | Type | Usage | Default |
|-|-|-|-|
| `esm` | `boolean` | Set to `true` if codebase being serialized contains ECMAScript modules (`import x from 'x'`) | `false` |
| `jsx` | `boolean` | Set to `true` if codebase being serialized contains JSX | `false` |
| `configFile` | `boolean` or `string` | Babel config file (optional). If a `string`, should be path to Babel config file. | `false` |
| `babelrc` | `boolean` | If `true`, code will be transpiled with Babel `.babelrc` files while loading | `true` if `configFile` option set, otherwise `false` |
| `cache` | `boolean` | If `true`, Babel cache is used to speed up Livepack | `true` |

These options correspond to CLI options, but sometimes named slightly differently.

### Serialization

Use the `serialize` function to serialize.

```js
const { serialize } = require('livepack');
serialize( { x: 1 } ) // => '{x:1}'
```

#### Options

`serialize` can be passed options as 2nd argument.

```js
serialize( {x: 1}, {
  // Options...
} );
```

| Option | Type | Usage | Default |
|-|-|-|-|
| `format` | `string` | Output format. Valid options are `js`, `cjs` or `esm` (see [below](#output-formats)). | `js` |
| `exec` | `boolean` | Set to `true` to treat input as a function which should be executed when the code runs | `false` |
| `minify` | `boolean` | Minify output | `true` |
| `mangle` | `boolean` | Mangle (shorten) variable names | `options.minify` |
| `comments` | `boolean` | Include comments in output | `!options.minify` |
| `inline` | `boolean` | Less verbose output | `true` |
| `files` | `boolean` | `true` to output source maps in separate file not inline (see [below](#files)) | `false` |
| `sourceMaps` | `boolean` | Create source maps | `false` |
| `outputDir` | `string` | Path to dir code would be output to. If provided, source maps will use relative paths (relative to `outputDir`). | `undefined` |

All these options (except `files` and `outputDir`) correspond to CLI options of the same names. Unlike the programmatic API, in the CLI `exec` and `files` options default to `true` and `minify` to `false`.

#### Output formats

* `js` (default) - output an expression which can be inserted into code e.g. `function() {}`
* `cjs` - output a CommonJs module e.g. `module.exports = function() {}`
* `esm` - output an ESM module e.g. `export default function() {}`

#### Files

If the `files` option is set, the return value of `serialize()` will be an array of file objects, each with `filename` and `content` properties.

Use this if you want source maps in a separate file.

```js
serialize(
  {x: 1},
  {files: true, format: 'esm', sourceMaps: true}
)
```

outputs:

```js
[
  {
    filename: 'index.js',
    content: 'export default{x:1}\n//# sourceMappingURL=index.js.map'
  },
  {
    filename: 'index.js.map',
    content: '{"version":3,"sources":[],"names":[],"mappings":""}'
  }
]
```

## What's missing

This is a new and experimental project. There are some major gaps at present.

### JS features

Livepack can serialize pretty much all Javascript Functions and Objects. However, the following cannot yet be serialized:

* Promises
* Proxies
* Error objects
* WeakRefs + FinalizationRegistrys
* Private class methods + properties
* TypedArrays which share an underlying buffer

NB Applications can *use* any of these within functions, just that instances of these classes can't be serialized.

* Supported: `export default Promise;`
* Supported: `const P = Promise; export default function() { return P; };`
* Supported: `export default function() { return Promise.resolve(); };`
* Unsupported: `export default Promise.resolve();` (Promise instance serialized directly)
* Unsupported: `const p = Promise.resolve(); export default function f() { return p; };` (Promise instance in outer scope of exported function)

`with (...) {...}` is also not supported where it alters the scope of a function being serialized.

### Code splitting

Code is always output as a single file. There is no facility for code splitting yet.

### Browser code

This works in part. You can, for example, build a simple React app with Livepack.

However, there are outstanding problems, which mean that Livepack is presently really only suitable for NodeJS server-side code.

* Code size is not typically great (optimizations are possible which will tackle this in future)
* No code splitting
* Tree-shaking doesn't work yet for ESM named exports (tree-shaking CommonJS works fine)
* Difficulties with use of browser globals e.g. `window`
* No understanding of the `browser` field in `package.json`, which some packages like Axios use to provide different code on client and server

## Versioning

This module follows [semver](https://semver.org/). Breaking changes will only be made in major version updates.

All active NodeJS release lines are supported (v10+ at time of writing). After a release line of NodeJS reaches end of life according to [Node's LTS schedule](https://nodejs.org/en/about/releases/), support for that version of Node may be dropped at any time, and this will not be considered a breaking change. Dropping support for a Node version will be made in a minor version update (e.g. 1.2.0 to 1.3.0). If you are using a Node version which is approaching end of life, pin your dependency of this module to patch updates only using tilde (`~`) e.g. `~1.2.3` to avoid breakages.

## Tests

Use `npm test` to run the tests. Use `npm run cover` to check coverage.

## Changelog

See [changelog.md](https://github.com/overlookmotel/livepack/blob/master/changelog.md)

## Issues

If you discover a bug, please raise an issue on Github. https://github.com/overlookmotel/livepack/issues

## Contribution

Pull requests are very welcome. Please:

* ensure all tests pass before submitting PR
* add tests for new features
* document new functionality/API additions in README
* do not add an entry to Changelog (Changelog is created when cutting releases)
