/* --------------------
 * livepack module
 * Live bindings methods
 * ------------------*/

'use strict';

// Imports
const {esmAliases} = require('../shared/internal.js');

// Exports

module.exports = {
	/**
	 * Init live bindings map.
	 * @returns {undefined}
	 */
	initLiveBindings() {
		this.liveBindings = Object.create(null); // Keyed by URL
	},

	/**
	 * Record use of a live binding as import.
	 * @param {string} url - Module URL
	 * @param {string} name - Export name
	 * @returns {Object} - Binding object
	 */
	recordImportBinding(url, name) {
		// If aliased, resolve to ultimate home
		const alias = getAlias(url, name);
		if (alias) ({url, name} = alias);

		// Flag binding as read from
		const binding = this.getOrCreateLiveBinding(url, name);
		binding.isReadFrom = true;

		return binding;
	},

	/**
	 * Record use of a live binding as an export.
	 * @param {string} url - Module URL
	 * @param {string} name - Local var name
	 * @returns {Object} - Binding object of form `{url, name, isReadFrom, isMutable}`
	 */
	recordExportBinding(url, name) {
		return this.getOrCreateLiveBinding(url, name);
	},

	/**
	 * Get or create live binding object for module URL and export name.
	 * @param {string} url - Module URL
	 * @param {string} name - Export name
	 * @returns {Object} - Binding object of form `{url, name, isReadFrom, isMutable}`
	 */
	getOrCreateLiveBinding(url, name) {
		const {liveBindings} = this;
		let moduleBindings = liveBindings[url];
		if (moduleBindings) {
			const binding = moduleBindings[name];
			if (binding) return binding;
		} else {
			moduleBindings = liveBindings[url] = Object.create(null);
		}

		const binding = {url, name, isReadFrom: false, isMutable: false};
		moduleBindings[name] = binding;
		return binding;
	}
};

/**
 * Get alias and resolve to ultimate home.
 * For following input:
 *   `foo.js`: `import {c as d} from './bar.js; export {d as e};'
 *   `bar.js`: `export {b as c} from './qux.js';`
 *   `qux.js`: `let a = 1; export {a as b};`
 * `foo`'s export `e` resolves to `qux`'s export `b`.
 *
 * NB Don't need to worry about circular dependencies as Node's module loader
 * will have already detected any and thrown an error.
 *
 * @param {string} url - Module URL
 * @param {string} name - Export name
 * @returns {Object|undefined} - Alias object if alias exists
 */
function getAlias(url, name) {
	if (name === '*') return undefined;

	const aliases = esmAliases[url];
	if (!aliases) return undefined;

	let alias = aliases[name];
	if (alias) {
		// Direct alias found - if not already resolved, resolve it
		if (!alias.isResolved) {
			// If refers to another alias, update this alias to ultimate home
			const parentAlias = getAlias(alias.url, alias.name);
			if (parentAlias) {
				alias.url = parentAlias.url;
				alias.name = parentAlias.name;
			}

			// Flag alias as resolved
			alias.isResolved = true;
		}
	} else if (name !== 'default') {
		// No direct alias - try star aliases (`export * from '...'`)
		const starAliasUrls = aliases['*'];
		if (starAliasUrls) {
			for (const starAliasUrl of starAliasUrls) {
				alias = getAlias(starAliasUrl, name);
				if (alias) {
					aliases[name] = alias;
					break;
				}
			}
		}
	}

	return alias;
}
