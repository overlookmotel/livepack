/* --------------------
 * livepack
 * Tests mock FS to produce virtual fixture files
 * ------------------*/

'use strict';

// Modules
const fs = require('fs'),
	gracefulFs = require('graceful-fs');

// Record fixtures object as global
const fixtures = Object.create(null);
global.__livepack_fixtures__ = fixtures;

// Mock FS operations to write to fixtures
const {readFileSync, statSync} = gracefulFs;

fs.readFileSync = gracefulFs.readFileSync = (path, encoding) => {
	if (Object.prototype.hasOwnProperty.call(fixtures, path)) return Buffer.from(fixtures[path]);
	return readFileSync(path, encoding);
};

let cachedStat;
fs.statSync = gracefulFs.statSync = (path, options) => {
	if (fixtures[path]) {
		if (!cachedStat) cachedStat = statSync(__filename);
		return cachedStat;
	}
	return statSync(path, options);
};
