/* --------------------
 * livepack
 * Function to create fixtures from inline definitions
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, dirname} = require('path'),
	{writeFileSync, mkdirsSync} = require('fs-extra'),
	{spawn} = require('child_process'),
	{isString} = require('is-it-type');

// Constants
const TESTS_DIR_PATH = pathJoin(__dirname, '../'),
	TEMP_DIR_PATH = pathJoin(TESTS_DIR_PATH, '_temp'),
	LOADER_PATH = pathJoin(__dirname, '../../loader.mjs'),
	MAIN_PATH_ESM = pathJoin(__dirname, '../../es/index.js'),
	MAIN_PATH_COMMONJS = pathJoin(__dirname, '../../index.js'),
	DEFAULT_FILENAME = 'index.js';

// Exports

let fixtureNum = 0;

/**
 * Create fixtures functions for use in a test file.
 * Takes test file's path as argument and creates a temp dir path which is unique for this test file.
 * This ensures that fixtures paths do not clash when test files are run in parallel.
 * @param {string} testPath - Path to test file
 * @returns {Object} - Fixtures functions
 */
module.exports = function createFixturesFunctions(testPath) {
	// Create temp dir path, incorporating test file's filename
	const tempPath = pathJoin(TEMP_DIR_PATH, testPath.slice(TESTS_DIR_PATH.length));

	// Return fixtures functions
	return {
		createFixtures: files => createFixtures(tempPath, files),
		createFixture: (code, filename) => createFixture(tempPath, code, filename),
		requireFixtures: files => requireFixtures(tempPath, files),
		requireFixture: code => requireFixture(tempPath, code),
		importFixtures: files => importFixtures(tempPath, files),
		serializeInNewProcess: (files, isEsm, loaderOptions) => serializeInNewProcess(
			tempPath, files, isEsm, loaderOptions
		)
	};
};

/**
 * Write fixtures files to unique temp dir.
 * `files` is a Object of form `{'index.js': 'content of index.js'}`.
 * Returns Object mapping filenames to paths
 * e.g. `{'index.js': '/path/to/livepack/test/_temp/testName/0/index.js'}`
 *
 * @param {string} tempPath - Temp dir path
 * @param {Object} files - Files
 * @returns {Object} - Mapping of names to full paths
 */
function createFixtures(tempPath, files) {
	// Create unique temp path
	tempPath = pathJoin(tempPath, `${fixtureNum++}`);

	// Write files to temp dir
	const paths = Object.create(null);
	for (const filename of Object.keys(files)) {
		const filePath = pathJoin(tempPath, filename);

		mkdirsSync(dirname(filePath));
		writeFileSync(filePath, files[filename]);

		paths[filename] = filePath;
	}

	// Return file paths
	return paths;
}

/**
 * Write a single fixture file to temp dir and return path to file.
 * @param {string} tempPath - Temp dir path
 * @param {string} code - File content
 * @param {string} [filename] - Filename
 * @returns {string} - File path
 */
function createFixture(tempPath, code, filename) {
	if (!filename) filename = DEFAULT_FILENAME;
	return createFixtures(tempPath, {[filename]: code})[filename];
}

/**
 * Write fixtures files to unique temp dir and `require()` first file.
 * @param {string} tempPath - Temp dir path
 * @param {Object} files - Files
 * @returns {*} - Result of `require()`-ing first file
 */
function requireFixtures(tempPath, files) {
	const fixturesPaths = createFixtures(tempPath, files);
	const path = fixturesPaths[Object.keys(fixturesPaths)[0]];
	return require(path); // eslint-disable-line global-require, import/no-dynamic-require
}

/**
 * Write a single fixture file to temp dir and `require()` it.
 * @param {string} tempPath - Temp dir path
 * @param {string} code - File content
 * @returns {*} - Result of `require()`-ing file
 */
function requireFixture(tempPath, code) {
	return requireFixtures(tempPath, {[DEFAULT_FILENAME]: code});
}

/**
 * Write fixtures files to unique temp dir and `import()` first file.
 * Return first file's default export.
 * @param {string} tempPath - Temp dir path
 * @param {Object} files - Files
 * @returns {*} - Default export of first file `import()`-ed
 */
async function importFixtures(tempPath, files) {
	const fixturesPaths = createFixtures(tempPath, files);
	const path = fixturesPaths[Object.keys(fixturesPaths)[0]];
	return (await import(path)).default;
}

/**
 * Serialize fixture files in child process using loader.
 * `files` can be a string or an object mapping filename to file content.
 * First file should contain value to serialize on last line.
 *
 * @param {string} tempPath - Temp dir path
 * @param {Object|string} files - Files (if string, will be used as `index.js` file)
 * @param {Object} [options] - Options. Aside from `esm` and `promise`, options passed to loader.
 * @param {boolean} [options.esm] - `true` if entry point is ESM
 * @param {boolean} [options.promise] - `true` if value is promise to await before serializing
 * @returns {string} - Serialized output
 */
async function serializeInNewProcess(tempPath, files, options) {
	// Conform options
	let {esm: isEsm, promise: isPromise, ...loaderOptions} = options || {};
	isEsm = !!isEsm;
	isPromise = !!isPromise;
	loaderOptions = {cache: false, ...loaderOptions};

	// Convert string to object
	if (isString(files)) files = {[DEFAULT_FILENAME]: files};

	// Trim whitespace off start and end of lines and insert serialize code into first file
	const entryFilename = Object.keys(files)[0];
	files = Object.fromEntries(Object.entries(files).map(([filename, content]) => {
		const lines = content.trim().split('\n').map(line => line.trim());

		if (filename === entryFilename) {
			lines.unshift(
				isEsm
					? `import {serialize} from ${JSON.stringify(MAIN_PATH_ESM)};`
					: `const {serialize} = require(${JSON.stringify(MAIN_PATH_COMMONJS)});`
			);
			lines[lines.length - 1] = isPromise
				? `${lines[lines.length - 1]}.then(value => console.log(serialize(value)))`
				: `console.log(serialize(${lines[lines.length - 1]}))`;
		}

		return [filename, lines.join('\n')];
	}));

	// Load entry point file in Node with loader
	const path = createFixtures(tempPath, files)[entryFilename];
	const js = await spawnNode(path, loaderOptions);
	return js.trim();
}

// Create env for child processes.
// Remove `JEST_WORKER_ID` so `lib/init/esm.js` does not disable use of `import()` in the child.
const env = {...process.env};
delete env.JEST_WORKER_ID;

function spawnNode(path, loaderOptions) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [
			'--no-warnings', // Prevent warning about use of experimental features
			'--experimental-loader',
			`${LOADER_PATH}?${JSON.stringify(loaderOptions)}`,
			'--experimental-specifier-resolution=node',
			path
		], {env});

		let stdout = '',
			stderr = '';
		child.stdout.on('data', (chunk) => { stdout += chunk; });
		child.stderr.on('data', (chunk) => { stderr += chunk; });

		child.on('close', () => {
			if (stderr !== '') {
				reject(new Error(`Unexpected stderr output: ${stderr}`));
			} else {
				resolve(stdout);
			}
		});
	});
}
