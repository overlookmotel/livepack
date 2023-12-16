/* --------------------
 * livepack module
 * Shim `WeakMap` + `WeakSet` to capture entries
 * ------------------*/

/* global WeakRef, FinalizationRegistry */

'use strict';

// Exports

module.exports = {shimWeakSet, shimWeakMap};

const WeakMapOriginal = WeakMap;

/**
 * Shim `WeakSet` with implementation which allow getting entries for serializing.
 * Uses `WeakRef` to avoid holding strong references to entries,
 * and allows them to be garbage collected.
 * Adapted from https://github.com/Lunuy/iterable-weak/blob/master/src/IterableWeakSet.ts
 *
 * @returns {Function} - Function which returns entries of a `WeakSet`
 */
function shimWeakSet() {
	let getWeakSetEntries;

	WeakSet = class WeakSet { // eslint-disable-line no-global-assign
		// Set of `WeakRefs` to entries
		#refs = new Set();
		// Mapping from entries to `WeakRef`s to those entries
		#mapping = new WeakMapOriginal();
		// FinalizationRegistry to delete `WeakRef`s from `#refs` when entries are garbage collected
		#finalizationRegistry = new FinalizationRegistry(ref => this.#refs.delete(ref));

		constructor(iterable = undefined) { // `= undefined` so `WeakSet.length === 0`
			if (iterable != null) {
				for (const element of iterable) {
					// NB: Original calls `WeakSet.prototype.add` even if it's been overwritten by user
					this.add(element);
				}
			}
		}

		delete(element) {
			const ref = this.#mapping.get(element);
			if (!ref) return false;

			this.#mapping.delete(element);
			this.#refs.delete(ref);
			this.#finalizationRegistry.unregister(ref);
			return true;
		}

		has(element) {
			return this.#mapping.has(element);
		}

		add(element) {
			if (!this.#mapping.has(element)) {
				const ref = new WeakRef(element);
				this.#mapping.set(element, ref);
				this.#refs.add(ref);
				this.#finalizationRegistry.register(element, ref, ref);
			}
			return this;
		}

		static {
			getWeakSetEntries = (weakSet) => {
				const entries = [];
				for (const ref of weakSet.#refs) {
					const value = ref.deref();
					if (value) entries.push(value);
				}
				return entries;
			};
		}
	};

	// eslint-disable-next-line no-extend-native
	Object.defineProperty(WeakSet.prototype, Symbol.toStringTag, {value: 'WeakSet', configurable: true});

	return getWeakSetEntries;
}

/**
 * Shim `WeakMap` with implementation which allow getting entries for serializing.
 * Uses `WeakRef` to avoid holding strong references to keys,
 * and allows them to be garbage collected.
 *
 * Adapted from https://github.com/tc39/proposal-weakrefs#iterable-weakmaps
 * and https://github.com/Lunuy/iterable-weak/blob/master/src/IterableWeakMap.ts
 *
 * @returns {Function} - Function which returns entries of a `WeakMap`
 */
function shimWeakMap() {
	let getWeakMapEntries;

	WeakMap = class WeakMap { // eslint-disable-line no-global-assign
		// Set of `WeakRefs` to keys
		#refs = new Set();
		// Mapping from keys to objects containing `WeakRef` to key, and value
		#mapping = new WeakMapOriginal();
		// FinalizationRegistry to delete `WeakRef`s from `#refs` when entries are garbage collected
		#finalizationRegistry = new FinalizationRegistry(ref => this.#refs.delete(ref));

		constructor(iterable = undefined) { // `= undefined` so `WeakMap.length === 0`
			if (iterable != null) {
				for (const [key, value] of iterable) {
					// NB: Original calls `WeakMap.prototype.set` even if it's been overwritten by user
					this.set(key, value);
				}
			}
		}

		delete(key) {
			const entry = this.#mapping.get(key);
			if (!entry) return false;

			const {ref} = entry;
			this.#refs.delete(ref);
			this.#mapping.delete(key);
			this.#finalizationRegistry.unregister(ref);

			return true;
		}

		get(key) {
			return this.#mapping.get(key)?.value;
		}

		set(key, value) {
			const entry = this.#mapping.get(key);
			if (!entry) {
				const ref = new WeakRef(key);
				this.#mapping.set(key, {ref, value});
				this.#refs.add(ref);
				this.#finalizationRegistry.register(key, ref, ref);
			} else if (entry.value !== value) {
				entry.value = value;
			}

			return this;
		}

		has(key) {
			return this.#mapping.has(key);
		}

		static {
			getWeakMapEntries = (weakMap) => {
				const mapping = weakMap.#mapping,
					entries = [];
				for (const ref of weakMap.#refs) {
					const key = ref.deref();
					if (key) entries.push([key, mapping.get(key).value]);
				}
				return entries;
			};
		}
	};

	// eslint-disable-next-line no-extend-native
	Object.defineProperty(WeakMap.prototype, Symbol.toStringTag, {value: 'WeakMap', configurable: true});

	return getWeakMapEntries;
}
