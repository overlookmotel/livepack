/* --------------------
 * livepack module
 * CLI loader
 * ------------------*/

// Modules
import {join as pathJoin} from 'path';
import {fileURLToPath} from 'url';

// Imports
import loaderModule from '../loader.js';

const {createLoader, urlToOptions} = loaderModule;

// Parse loader options from URL.
// Add `shouldIgnorePath` option to avoid transpiling entry point.
const {url} = import.meta,
	options = urlToOptions(url);

const execPath = pathJoin(fileURLToPath(url), '../exec.js');
options.shouldIgnorePath = path => path === execPath;

// Export loader
export const {resolve, getFormat, transformSource, load} = createLoader(options);
