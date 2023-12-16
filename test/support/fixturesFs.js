/* --------------------
 * livepack
 * Patch module loading code and filesystem to provide virtual fixture files
 * ------------------*/

'use strict';

// Modules
const fs = require('fs'),
	{join: pathJoin, isAbsolute: pathIsAbsolute} = require('path');

// Imports
const {Module, exposeModuleInternal} = require('../../lib/shared/moduleCache.js');

// Constants
const FIXTURES_DIR_PATH = pathJoin(__dirname, '../_temp/');

// Exports

let fixtures;

module.exports = {
	getFixtures: () => fixtures,
	setFixtures(newFixtures) {
		fixtures = newFixtures;
	},
	clearFixtures() {
		fixtures = undefined;
	},
	FIXTURES_DIR_PATH
};

// Expose this module in internal module cache
exposeModuleInternal(__filename);

// Mock FS operations to use virtual files for fixtures
const {_resolveFilename} = Module;
Module._resolveFilename = function(request, parent) {
	if (pathIsAbsolute(request)) {
		if (fixtureExists(request)) return request;
	} else if (parent && parent.path.startsWith(FIXTURES_DIR_PATH) && /^\.\.?\//.test(request)) {
		const path = pathJoin(parent.path, request);
		if (fixtureExists(path)) return path;
	}

	return _resolveFilename.apply(this, arguments); // eslint-disable-line prefer-rest-params
};

const {readFileSync, statSync} = fs;

fs.readFileSync = (path, encoding) => {
	if (fixtureExists(path)) {
		if (encoding !== 'utf8') throw new Error(`Cannot read fixture file with encoding '${encoding}'`);
		return fixtures.get(path);
	}
	return readFileSync(path, encoding);
};

let cachedStat;
fs.statSync = (path, options) => {
	if (fixtureExists(path)) {
		if (!cachedStat) cachedStat = statSync(__filename);
		return cachedStat;
	}
	return statSync(path, options);
};

function fixtureExists(path) {
	return !!fixtures && fixtures.has(path);
}
