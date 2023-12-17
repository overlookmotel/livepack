[![NPM version](https://img.shields.io/npm/v/livepack.svg)](https://www.npmjs.com/package/livepack)
[![Build Status](https://img.shields.io/github/actions/workflow/status/overlookmotel/livepack/test.yml?branch=master)](https://github.com/overlookmotel/livepack/actions)
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

#### Value-level code splitting

Most bundlers code split at the level of files. Livepack splits code at a far more granular level - individual Objects or Functions. This makes for smaller bundles. [More details](#code-splitting)

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

### Beware ye!

Livepack is a new and experimental project. It works for NodeJS server-side code, but there are some major gaps for bundling client-side code.

Please see [what's missing](#whats-missing) for more information.

The intention is to overcome the current limitations in future, and make Livepack work fully for client-side code. For now it's a proof of concept of a different approach - dynamic bundling - and what patterns it makes possible. Please [see section on code spitting](#code-splitting) for examples.

## Usage

### Installation

```sh
npm install -D livepack
```

Requires NodeJS v18 or later.

### CLI

```sh
npx livepack <input path(s)..> -o <output dir>
```

Inputs should be the entry point(s) of the app to be packed.

```sh
npx livepack src/index.js -o build
```

```sh
npx livepack src/index.js src/another_entry.js -o build
```

Entry points must export a function which will be executed when the built app is run.

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

Resulting output:

```js
console.log('hello!');
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
| `--ext` | JS file extension | `js` |
| `--map-ext` | Source map files extension | `map` |
| `--esm` | Enable if codebase being serialized contains ECMAScript modules (`import x from 'x'`) | Disabled |
| `--jsx` | Enable if codebase being serialized contains JSX | Disabled |
| `--minify` / `-m` | Minify output | Disabled |
| `--mangle` / `--no-mangle` | Mangle (shorten) var names | Follows `minify` |
| `--comments` / `--no-comments` | Remove comments from source | Follows `minify` |
| `--entry-chunk-name` | Template for entry point chunk names ([more info](#customizing-chunk-names)) | `[name]` |
| `--split-chunk-name` | Template for split chunk names ([more info](#customizing-chunk-names)) | `[name].[hash]` |
| `--common-chunk-name` | Template for common chunk names ([more info](#customizing-chunk-names)) | `common.[hash]` |
| `--source-maps` / `-s` | Output source maps. `--source-maps inline` for inline source maps. | Disabled |
| `--no-exec` | Output a file which exports the input rather than executes it. | Exec enabled |
| `--stats` | Output stats file.<br />Provide filename or `true` for `livepack-stats.json`. | Disabled |
| `--no-cache` | Disable instrumentation cache | Cache enabled |

#### Config file

You can set options in a `livepack.config.json` file rather than on command line. Config file can be in `.json` or `.js` format, in root dir of the app. If `.js`, must be CommonJS.

```json
// livepack.config.json
{
  "input": "src/index.js",
  "output": "build",
  "format": "esm",
  "ext": "js",
  "mapExt": "map",
  "esm": true,
  "jsx": true,
  "minify": true,
  "mangle": true,
  "comments": false,
  "entryChunkName": "[name]",
  "splitChunkName": "[name].[hash]",
  "commonChunkName": "common.[hash]",
  "sourceMaps": true,
  "exec": true,
  "stats": false,
  "cache": true
}
```

`input` can be:

* File path - absolute or relative to current directory
* Array of file paths - outputs will be named same as the inputs
* Object mapping output names to input paths

```
input: "src/index.js"
input: ["src/index.js", "src/other.js"]
input: {"index": "src/index.js", "another": "src/other.js"}
```

Then run Livepack with:

```js
npx livepack
```

All of the above options are optional except `input` and `output`.

### Programmatic API

There are two parts to the programmatic API.

1. Require hook
2. `serialize()` / `serializeEntries()` functions

#### Require hook

Livepack instruments the code as it runs, by patching NodeJS's `require()` function. This instrumentation is what allows Livepack to capture the value of variables in closures.

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

The entry point file *must* `require()` the app, not `import` it. The app can be written in CommonJS or ESM (use `esm` option).

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
| `cache` | `boolean` | If `true`, instrumentation cache is used to speed up Livepack | `true` |

These options correspond to CLI options, but sometimes named slightly differently.

### Serialization

Use the `serialize()` or `serializeEntries()` functions to serialize. `serializeEntries()` is used if you have multiple entry points.

```js
const { serialize } = require('livepack');
const js = serialize( { x: 1 } );
// js = '{x:1}'
```

```js
const { serializeEntries } = require('livepack');
const files = serializeEntries( {
  index: { x: 1 },
  other: { y: 2 }
} );
// files = [
//   { type: 'entry', name: 'index', filename: 'index.js', content: '{x:1}' },
//   { type: 'entry', name: 'other', filename: 'other.js', content: '{y:1}' }
// ]
```

or ESM:

```js
import { serialize } from 'livepack';
const js = serialize( { x: 1 } );
// js = '{x:1}'
```

#### Options

`serialize()` and `serializeEntries()` can be passed options as 2nd argument.

```js
serialize( {x: 1}, {
  // Options...
} );
```

| Option | Type | Usage | Default |
|-|-|-|-|
| `format` | `string` | Output format. Valid options are `js`, `cjs` or `esm` (see [below](#output-formats)). | `'js'` |
| `ext` | `string` | JS file extension | `'js'` |
| `mapExt` | `string` | Source maps file extension | `'map'` |
| `exec` | `boolean` | Set to `true` to treat input as a function which should be executed when the code runs (as with CLI). Only for `cjs` or `esm` format. | `false` |
| `minify` | `boolean` | Minify output | `true` |
| `mangle` | `boolean` | Mangle (shorten) variable names | `options.minify` |
| `comments` | `boolean` | Include comments in output | `!options.minify` |
| `files` | `boolean` | `true` to output array of files (see [below](#files)) | `false` for `serialize()`,<br />`true` for `serializeEntries()` |
| `strictEnv` | `boolean` | `true` if environment code will execute in is strict mode (only relevant for `js` format) | `false` for `js` or `cjs` format, `true` for `esm` |
| `entryChunkName` | `string` | Template for entry point chunk names ([more info](#customizing-chunk-names)) | `'[name]'` |
| `splitChunkName` | `string` | Template for split chunk names ([more info](#customizing-chunk-names)) | `'[name].[hash]'` |
| `commonChunkName` | `string` | Template for common chunk names ([more info](#customizing-chunk-names)) | `'common.[hash]'` |
| `sourceMaps` | `boolean` or `'inline'` | Create source maps. `'inline'` adds source maps inline, `true` in separate `.map` files.<br />If `true`, `files` option must also be `true`. | `false` |
| `outputDir` | `string` | Path to dir code would be output to. If provided, source maps will use relative paths (relative to `outputDir`). | `undefined` |

All these options (except `files`, `outputDir` and `strictEnv`) correspond to CLI options of the same names. Unlike the CLI, in the programmatic API `exec` and `files` options default to `false` and `minify` to `true`.

#### Output formats

* `js` (default) - output an expression which can be inserted into code e.g. `function() {}`
* `cjs` - output a CommonJS module e.g. `module.exports = function() {}`
* `esm` - output an ESM module e.g. `export default function() {}`

#### Files

If the `files` option is set, the return value of `serialize()` will be an array of file objects, each with `type`, `name`, `filename` and `content` properties.

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
    type: 'entry',
    name: 'index',
    filename: 'index.js',
    content: 'export default{x:1}\n//# sourceMappingURL=index.js.map'
  },
  {
    type: 'source map',
    name: null,
    filename: 'index.js.map',
    content: '{"version":3,"sources":[],"names":[],"mappings":""}'
  }
]
```

## Code splitting

Code splitting works differently in Livepack from other bundlers.

Livepack pays no attention to what files code originates in, and *splits the output at the level of values, rather than at the level of files*.

This produces an optimal split of the app, where each entry point only includes exactly the code it needs, and nothing more. It's more efficient than Webpack or Rollup's file-level code splitting.

Any values shared between entry points are placed in common chunks. By default, these are named `common.XXXXXXXX.js`, where `XXXXXXXX` is a hash of the file's content.

For example, if your input is:

```js
// src/entry1.js
const { double, timesTen } = require('./shared.js');
module.exports = () => double( timesTen(10) );

// src/entry2.js
const { triple, timesTen } = require('./shared.js');
module.exports = () => triple( timesTen(20) );

// src/shared.js
module.exports = {
  double: function double(n) { return n * 2; },
  triple: function triple(n) { return n * 3; },
  timesTen: function timesTen(n) { return n * 10; }
};
```

Livepack will bundle this as:

```js
// build/entry1.js
import timesTen from "./common.6N2RIGAZ.js";
export default ((double,timesTen)=>()=>double(timesTen(10)))(function double(n){return n*2},timesTen)

// build/entry2.js
import timesTen from "./common.6N2RIGAZ.js";
export default ((triple,timesTen)=>()=>triple(timesTen(20)))(function triple(n){return n*3},timesTen)

// build/common.6N2RIGAZ.js
export default function timesTen(n){return n*10}
```

`src/shared.js` has been split up. `timesTen` is used by both entry points, so has been placed in a common chunk. But `double` and `triple` are inlined into the entry points that use them, since they're not shared. So each entry point doesn't need to import any code it doesn't use.

You can customize how code is split to optimize caching (see [below](#split)).

You may notice this output could be shorter - values are injected into a closure, when they could be accessed directly from outer scope. This is a current shortcoming of Livepack. It will be improved in a future release.

#### No `import()`

The other big difference from other bundlers is that Livepack doesn't at present support `import()`. It does, however, provide [another mechanism](#splitAsync) to achieve the same goal.

### Multiple entry points

If you have multiple entry points, use `serializeEntries()` or provide multiple input files to the [CLI](#CLI).

### `split()`

You can customize how code is split with `split()`. Split will cause the value provided to be placed in a separate file and other files will import it.

This can be advantageous for caching - you may want to split off parts of your app which change infrequently.

```js
const { split } = require('livepack');

const obj = { iAmABigObjectWhichChangesInfrequently: true, x: 123 };
split( obj );

module.exports = function getX() { return obj.x; };
```

Bundled output:

```js
// index.js
import obj from "./split.V4ULTFDU.js";
export default(obj=>function getX(){return obj.x;})(obj)

// split.V4ULTFDU.js
export default {iAmABigObjectWhichChangesInfrequently:true,x:123}
```

If you want to specify the name of split point files, pass name as 2nd argument to `split()`.

```js
// Split off in a file called `my-big-object.XXXXXXXX.js`
split( obj, 'my-big-object' );
```

### `splitAsync()`

`splitAsync()` is Livepack's version of `import()`.

`splitAsync()` takes a value and returns an import function. Just like `import()`, this import function returns a Promise of a module object. The `.default` property of the module object is the value `splitAsync()` was called with.

When Livepack serializes an import function, it puts the value into a separate file and outputs `() => import('./split.XXXXXXXX.js')`.

Example input:

```js
const { splitAsync } = require('livepack');

const importDouble = splitAsync(
  function double(n) { return n * 2; }
);

module.exports = async function quadruple(n) {
  const double = (await importDouble()).default;
  return double( double(n) );
};
```

Output:

```js
// index.js
export default(importDouble=>(
  async function quadruple(n){
    const double=(await importDouble()).default;
    return double(double(n))
  }
)(
  ()=>import("./split.LKCG7RVO.js")
)

// split.LKCG7RVO.js
export default function double(n){return n*2}
```

There's a few things to notice here:

1. `double` has been split into a separate file
2. `importDouble` is output as a dynamic import `()=>import("./split.LKCG7RVO.js")`
3. `double` didn't need to be defined in a separate file to be split off

All looks very weird? Maybe. But it does open up some patterns which usually aren't possible.

For example, you can dynamically create functions to be async imported.

#### Example with React

`splitAsync()` works well with `React.lazy()`:

```js
const people = [
  { firstName: 'Harrison', lastName: 'Ford', lotsMoreData: { /* ... */ } },
  { firstName: 'Marlon', lastName: 'Brando', lotsMoreData: { /* ... */ } },
  { firstName: 'Peewee', lastName: 'Herman', lotsMoreData: { /* ... */ } }
];

const lazyComponents = people.map(
  person => React.lazy(
    splitAsync(
      () => <PersonPage person={person} />
    )
  )
);
```

NB See [here](./example/react-splitAsync) for a full runnable example expanding on this.

`lazyComponents` is an array of lazy-loaded components. Each will be output in a separate file, with the data for each individual bundled in. `people` isn't accessed from inside the function being split off, so it won't be included in the bundles, only each individual `person` object will be included in the file for that person.

Where it gets really interesting is that data passed in to each lazy component isn't limited to just data - it can also include functions.

So you could, for example, provide customized components for each person. e.g. include a Google Maps component only for the pages where you know the person's address, by adding a `.MapComponent` property to some of the `person` objects. Only pages where a map is needed would include the code for displaying a map.

More broadly, components can be created at build time however you like - create code according to data. It's far more flexible than the usual model.

### Customizing chunk names

There are 3 options for customizing chunk names:

* `entryChunkName` - entry point chunks
* `splitChunkName` - split chunks (`split()` or `splitAsync()`)
* `commonChunkName` - common chunks (code in common between entry points)

For each you can use placeholders `[name]` or `[hash]` within the name. e.g.:

* `entryChunkName: '[name].[hash]'` will add hashes to the end of all entry point chunks.
* `commonChunkName: 'shared/[hash]'` will place all common chunks in a subfolder `shared`.

`commonChunkName` must include `[hash]`. `splitChunkName` must include `[hash]` if any split points are not named.

These options should not include the file extension. Use `ext` option if you want to alter file extensions from the default `.js`.

If you include `[hash]` in `entryChunkName`, you may need to consult the `files` object returned by `serialize()` / `serializeEntries()` to get the eventual filenames of the entry points. If using the CLI, you can use the `--stats` option to output a stats file including this information.

## What's missing

This is a new and experimental project. There are some major gaps at present.

### JS features

Livepack can serialize pretty much all Javascript Functions and Objects. However, the following cannot yet be serialized:

* Promises
* Proxies
* Error objects
* WeakRefs + FinalizationRegistrys
* Class properties defined inline (e.g. `class X { x = 1; }`)
* Private class methods + properties
* TypedArrays which share an underlying buffer

NB Applications can *use* any of these within functions, just that instances of these classes can't be serialized.

* Supported: `export default Promise;`
* Supported: `const P = Promise; export default function() { return P; };`
* Supported: `export default function() { return Promise.resolve(); };`
* Unsupported: `export default Promise.resolve();` (Promise instance serialized directly)
* Unsupported: `const p = Promise.resolve(); export default function f() { return p; };` (Promise instance in outer scope of exported function)

### Browser code

This works in part. You can, for example, build a simple React app with Livepack.

However, there are outstanding problems, which mean that Livepack is presently really only suitable for NodeJS server-side code.

* Code size is not typically great (optimizations are possible which will tackle this in future)
* Tree-shaking doesn't work yet for ESM named exports (tree-shaking CommonJS works fine)
* Difficulties with use of browser globals e.g. `window`
* No understanding of the `browser` field in `package.json`, which some packages like Axios use to provide different code on client and server

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
