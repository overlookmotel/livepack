/* --------------------
 * livepack module
 * `register` cache
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	{readFileSync, writeFileSync, mkdirSync} = require('fs'),
	os = require('os'),
	findCacheDir = require('find-cache-dir');

// Imports
const livepackVersion = require('../../package.json').version;

// Exports

module.exports = {openCache, closeCache};

const cacheDirPath = findCacheDir({name: 'livepack'}) || os.homedir() || os.tmpdir();
const cachePath = pathJoin(cacheDirPath, `register-${livepackVersion}.json`);

let cache, cacheContent,
	isDirty = false,
	isAwaitingSave = false;

/**
 * Open cache or get existing cache.
 * @returns {Object} - Cache object
 */
function openCache() {
	if (!cache) createCache();
	return cache;
}

/**
 * Close cache.
 * Write cache to disc and delete from memory.
 * @returns {undefined}
 */
function closeCache() {
	if (!cache) return;

	saveCache();
	cache = undefined;
	cacheContent = undefined;
}

/**
 * Load cache from disc and create cache object.
 * @returns {undefined}
 */
function createCache() {
	// Load cache content from disc
	cacheContent = loadCache();

	// If failed to load, create new cache
	if (!cacheContent) {
		cacheContent = {};
		isDirty = true;
		saveCacheOnNextTick();
	}

	// Create cache object
	cache = {
		getKey(filename, esm, jsx) {
			return JSON.stringify({filename, esm, jsx});
		},

		get(key, lastMod) {
			const cached = cacheContent[key];
			if (cached && cached.lastMod === lastMod) return cached;
			return undefined;
		},

		save(key, lastMod, code, map) {
			cacheContent[key] = {lastMod, code, map};
			isDirty = true;
			saveCacheOnNextTick();
		}
	};
}

/**
 * Load cache from disc.
 * Fail silently if cannot read cache.
 * @returns {Object} - Cache content object
 */
function loadCache() {
	try {
		const buff = readFileSync(cachePath);
		return JSON.parse(buff);
	} catch (e) {
		return undefined;
	}
}

/**
 * Save cache content to disc on next tick.
 * @returns {undefined}
 */
function saveCacheOnNextTick() {
	if (isAwaitingSave) return;
	isAwaitingSave = true;
	process.nextTick(saveCache);
}

/**
 * Save cache content to disc.
 * Fail silently if cannot write cache.
 * @returns {undefined}
 */
function saveCache() {
	if (isAwaitingSave) isAwaitingSave = false;
	if (!isDirty) return;

	isDirty = false;

	let contentStr;
	try {
		contentStr = JSON.stringify(cacheContent);
	} catch (e) {
		return;
	}

	try {
		writeFileSync(cachePath, contentStr);
	} catch (e) {
		try {
			mkdirSync(cacheDirPath, {recursive: true});
			writeFileSync(cachePath, contentStr);
		} catch (e) {} // eslint-disable-line no-empty, no-shadow
	}
}
