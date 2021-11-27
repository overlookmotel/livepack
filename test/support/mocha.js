/* --------------------
 * livepack
 * Wrapper for Mocha CLI.
 * Purpose is to load Mocha within internal module cache
 * to avoid transpiling Mocha's internal modules with Babel.
 * ------------------*/

/* eslint-disable import/order, import/newline-after-import */

'use strict';

// Use internal module cache
const {useInternalModuleCache, exposeModule} = require('../../lib/shared/moduleCache.js');
const revertModuleCache = useInternalModuleCache();

// Modules
const pathJoin = require('path').join,
	mocha = require('mocha/lib/cli/cli.js'),
	expect = require('expect');

// Init `expect()`
global.expect = expect;
require('jest-extended/all');
require('jest-expect-arguments');
require('./expect.js');

// Pre-load and expose mocha internal module which is lazily required
const commonPath = require.resolve('mocha/lib/interfaces/common.js');
require(commonPath); // eslint-disable-line import/no-dynamic-require
exposeModule(commonPath);

// Pre-load and expose tests support module
const supportPath = pathJoin(__dirname, 'index.js');
require(supportPath); // eslint-disable-line import/no-dynamic-require
exposeModule(supportPath);

// Revert module cache
revertModuleCache();

// Run Mocha
mocha.main();
