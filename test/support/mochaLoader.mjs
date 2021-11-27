/* --------------------
 * livepack
 * Loader for loading Mocha
 * ------------------*/

// Modules
import {join as pathJoin} from 'path';
import {fileURLToPath} from 'url';

// Imports
import loaderModule from '../../lib/loader.js';

// Export loader

const mochaRunnerPath = pathJoin(fileURLToPath(import.meta.url), '../mocha.js');

export const {getFormat, transformSource} = loaderModule.createLoader({
	shouldIgnorePath: path => path === mochaRunnerPath
});
