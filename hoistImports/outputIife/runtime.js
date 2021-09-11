'use strict';

// Init runtime
const loaderFunctions = {
	importValue: id => importModule(id, true),
	importGetter: id => importModule(id, false),
	importMany(...ids) {
		const numWithNoDependencies = typeof ids[0] === 'number' ? ids.shift() : 0;
		return Promise.all(
			ids.map((id, index) => importModule(id, index < numWithNoDependencies))
		);
	}
};

const modules = Object.create(null);
const alreadyLoadedModules = window.__livepack; // eslint-disable-line no-undef

function loaded([id, value, getValue, depIds]) {
	if (depIds) {
		// Entry point module - wait for dependencies to load
		let numMissingDeps = 0;
		const completeIfAllDepsLoaded = () => {
			if (numMissingDeps > 0) return;

			const numWithNoDependencies = value;
			// eslint-disable-next-line no-use-before-define
			const deps = depModules.map((mod, index) => getReturnValue(mod, index < numWithNoDependencies));
			getValue(...deps, loaderFunctions);
		};

		// eslint-disable-next-line array-callback-return, consistent-return
		const depModules = depIds.map((depId, index) => {
			const depModule = modules[depId];
			if (depModule) return depModule;

			numMissingDeps++;
			modules[depId] = (depModule) => { // eslint-disable-line no-shadow
				depModules[index] = depModule;
				numMissingDeps--;
				completeIfAllDepsLoaded();
			};
		});

		completeIfAllDepsLoaded();
	} else {
		// Dependent module
		const cb = modules[id];
		const module = modules[id] = {value, getValue};
		if (cb) cb(module);
	}
}
window.__livepack = {push: loaded}; // eslint-disable-line no-undef

if (alreadyLoadedModules) alreadyLoadedModules.forEach(loaded);

function getReturnValue(module, hasNoDependencies) {
	return hasNoDependencies
		? module.value
		// Wrap `getValue()` to cache value
		: (...args) => {
			let {value} = module;
			if (!value) {
				value = module.value = module.getValue(...args);
				module.getValue = undefined;
			}
			return value;
		};
}

function importModule(id, hasNoDependencies) {
	return new Promise((resolve) => {
		const resolver = module => resolve(getReturnValue(module, hasNoDependencies));
		const module = modules[id];
		if (module) {
			// Already loaded
			resolver(module);
		} else {
			// Not yet loaded - register callback for when it is
			modules[id] = resolver;
			load(id);
		}
	});
}

// Loader.
// NB NodeJS version - in browser would load file as script.
const {readFile} = require('fs/promises'),
	pathJoin = require('path').join;

function load(id) {
	(async () => {
		const js = await readFile(pathJoin(__dirname, `${id}.js`), 'utf8');
		(0, eval)(js); // eslint-disable-line no-eval
	})();
}
