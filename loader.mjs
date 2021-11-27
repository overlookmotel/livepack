/* --------------------
 * livepack module
 * NodeJS Loader ESM entry point
 * ------------------*/

// Imports
import loader from './lib/loader.js';

// Exports

// Export `getFormat()` and `transformSource()` so can be used as loader directly
// e.g. `node --experimental-loader livepack/loader input.js`
// or `node --experimental-loader 'livepack/loader?{"jsx":true}' input.js`
export const {getFormat, transformSource} = loader.createLoaderFromUrl(import.meta.url);

// Export `createLoader()` so can be used programmatically to construct a loader with options
export const {createLoader} = loader;
