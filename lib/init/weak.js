/* --------------------
 * livepack module
 * Shim `WeakMap` + `WeakSet` to capture entries
 * ------------------*/

/* global WeakRef, FinalizationRegistry */

'use strict';

// Exports

module.exports = {getWeakSets, getWeakMaps};

const WeakMapOriginal = WeakMap;

/**
 * Shim `WeakSet` to record all `WeakSet`s created in program.
 * The shimmed `WeakSet` class captures entries, so they can be serialized.
 * Implementation uses `WeakRef` to avoid holding strong references to entries,
 * and allows them to be garbage collected.
 * Adapted from https://github.com/Lunuy/iterable-weak/blob/master/src/IterableWeakSet.ts
 *
 * @returns {WeakMap} - `WeakMap` of all `WeakSet`s.
 *   `WeakMap` returned maps `WeakSet`s to objects with property `.refs`.
 *   `.refs` is a `Set` of `WeakRef`s to the `WeakSet`'s entries.
 */
function getWeakSets() {
	const weakSets = new WeakMapOriginal();

	// Could make `refs`, `mapping` and `finalizationRegistry` private class fields, and that would likely
	// be more performant. However, don't want to do that now as intent is that Livepack can build itself,
	// and currently Livepack can't serialize private fields.
	// TODO: Switch to private fields once Livepack can serialize them.
	WeakSet = class WeakSet { // eslint-disable-line no-global-assign
		constructor(...iterables) {
			const refs = new Set();
			weakSets.set(this, {
				refs,
				mapping: new WeakMapOriginal(),
				finalizationRegistry: new FinalizationRegistry(ref => refs.delete(ref))
			});

			const iterable = iterables[0];
			if (iterable) {
				for (const element of iterable) {
					this.add(element);
				}
			}
		}

		delete(element) {
			const {refs, mapping, finalizationRegistry} = weakSets.get(this);
			const ref = mapping.get(element);
			if (!ref) return false;

			mapping.delete(element);
			refs.delete(ref);
			finalizationRegistry.unregister(ref);
			return true;
		}

		has(element) {
			const {mapping} = weakSets.get(this);
			return mapping.has(element);
		}

		add(element) {
			const {refs, mapping, finalizationRegistry} = weakSets.get(this);
			if (!mapping.has(element)) {
				const ref = new WeakRef(element);
				mapping.set(element, ref);
				refs.add(ref);
				finalizationRegistry.register(element, ref, ref);
			}
			return this;
		}
	};

	// eslint-disable-next-line no-extend-native
	Object.defineProperty(WeakSet.prototype, Symbol.toStringTag, {value: 'WeakSet', configurable: true});

	return weakSets;
}

/**
 * Shim `WeakMap` to record all `WeakMap`s created in program.
 * The shimmed `WeakMap` class captures `WeakMap` keys, so they can be serialized.
 * Implementation uses `WeakRef` to avoid holding strong references to keys,
 * and allows them to be garbage collected.
 *
 * Adapted from https://github.com/tc39/proposal-weakrefs#iterable-weakmaps
 * and https://github.com/Lunuy/iterable-weak/blob/master/src/IterableWeakMap.ts
 *
 * @returns {WeakMap} - `WeakMap` of all `WeakMap`s.
 *   `WeakMap` returned maps `WeakMap`s to objects with properties `.refs` and `.mappings`.
 *   `.refs` is a `Set` of `WeakRef`s to the `WeakMap`'s keys.
 *   `.mappings` is a `WeakMap` of keys to values.
 */
function getWeakMaps() {
	const weakMaps = new WeakMapOriginal();

	// Could make `refs`, `mapping` and `finalizationRegistry` private class fields, and that would likely
	// be more performant. However, don't want to do that now as intent is that Livepack can build itself,
	// and currently Livepack can't serialize private fields.
	// TODO: Switch to private fields once Livepack can serialize them.
	WeakMap = class WeakMap { // eslint-disable-line no-global-assign
		constructor(...iterables) {
			const refs = new Set();
			weakMaps.set(this, {
				refs,
				mapping: new WeakMapOriginal(),
				finalizationRegistry: new FinalizationRegistry(ref => refs.delete(ref))
			});

			const iterable = iterables[0];
			if (iterable) {
				for (const [key, value] of iterable) {
					this.set(key, value);
				}
			}
		}

		delete(key) {
			const {refs, mapping, finalizationRegistry} = weakMaps.get(this);
			const entry = mapping.get(key);
			if (!entry) return false;

			const {ref} = entry;
			refs.delete(ref);
			mapping.delete(key);
			finalizationRegistry.unregister(ref);

			return true;
		}

		get(key) {
			const {mapping} = weakMaps.get(this);
			const entry = mapping.get(key);
			return entry && entry.value;
		}

		set(key, value) {
			const {refs, mapping, finalizationRegistry} = weakMaps.get(this);

			const entry = mapping.get(key);
			if (!entry) {
				const ref = new WeakRef(key);
				mapping.set(key, {ref, value});
				refs.add(ref);
				finalizationRegistry.register(key, ref, ref);
			} else if (entry.value !== value) {
				entry.value = value;
			}

			return this;
		}

		has(key) {
			const {mapping} = weakMaps.get(this);
			return mapping.has(key);
		}
	};

	// eslint-disable-next-line no-extend-native
	Object.defineProperty(WeakMap.prototype, Symbol.toStringTag, {value: 'WeakMap', configurable: true});

	return weakMaps;
}
