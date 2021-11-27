# TODO

* De-duplicate imported vars - finish tests
* Tests for `export * from ...`
* Tests: Load fixtures with loader rather than register
* Remove need for `--experimental-import-meta-resolve` + `--experimental-top-level-await` flags (see below)
* Make loader compatible with new loader API in Node v16.12.0
* Pass `livepack_esm` into eval (both direct and indirect eval)
* Pass `state.esmImports` and `state.esmExportNames` into eval (direct `eval()` only) - NB Don't need to create temp vars inside eval, can use string literals instead as the resolved URLs are known at time `eval()` is executed
* Direct `eval()` flag `livepack_esm` as needed (`eval()` may include dynamic import)
* Throw if try to serialize function containing `import.meta`?
* Link up dynamic exports - live bindings
* `processBlock()` can no longer assume top-level scopes are singular. These's a bit of code which does assume that at present.
* Remove `topLevelVarNames` hack - no longer needed since not using `@babel/plugin-transform-modules-commonjs` any more. Actually yes it is for `@babel/plugin-transform-react-jsx` in automatic mode which inserts `import {jsx as _jsx} from 'react/jsx-runtime';`.
* Remove `@babel/plugin-transform-modules-commonjs` dependency
* CLI kill child process if exit signal received

# Notes

## Removing need for `--experimental-import-meta-resolve` + `--experimental-top-level-await` flags

`import.meta.resolve()` is currently used for resolving module URLs from import specifiers. As `import.meta.resolve()` is async, Livepack also requires top-level `await`.

[This article](https://dev.to/giltayar/mock-all-you-want-supporting-es-modules-in-the-testdouble-js-mocking-library-3gh1) describes the loader used in [quibble](https://www.npmjs.com/package/quibble). Its use of the `resolve()` hook could be adopted by Livepack to provide resolution without `import.meta.resolve()`.

The article notes that `resolve()` hook runs *even if the module for URL is already in the module cache*.

Currently Livepack's Babel plugin injects code like:

```js
const livepack_temp_1 = await import.meta.resolve('./imported.js');
```

Instead could inject:

```js
import livepack_temp_1 from 'livepack_resolve://./imported.js';
```

Then a loader like this could make that import result in the resolved path:

```js
const RESOLVE_PREFIX = 'livepack_resolve://',
  RESOLVE_PREFIX_LEN = RESOLVE_PREFIX.length;

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith(RESOLVE_PREFIX)) {
    const {url: resolvedUrl} = await defaultResolve(
      specifier.slice(RESOLVE_PREFIX_LEN), context, defaultResolve
    );
    return {url: `${RESOLVE_PREFIX}${resolvedUrl}`};
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export function load(url, context, defaultLoad) {
  if (url.startsWith(RESOLVE_PREFIX)) {
    return {
      format: 'module',
      source: `export default ${JSON.stringify(url.slice(RESOLVE_PREFIX_LEN))};`
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
```

This would remove the need for top-level await and `import.meta.resolve()`. Top-level await is not supported in Node v12 and so its usage currently makes Livepack incompatible with Node v12. Making this change would restore Node v12 compatibility (>= v12.16.0 which introduced full set of loader hooks).
