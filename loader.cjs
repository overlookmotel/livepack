/* --------------------
 * livepack module
 * NodeJS Loader CommonJS entry point
 * ------------------*/

'use strict';

// Imports
const {createLoader} = require('./lib/loader.js');

// Exports

// Export loader hooks object + `createLoader()` for programmatic use
const loader = createLoader();
loader.createLoader = createLoader;
module.exports = loader;
