/* --------------------
 * livepack module
 * Shim `WeakMap` + `WeakSet` to capture entries
 * ------------------*/

/* global WeakRef, FinalizationRegistry */

'use strict';

// Exports

module.exports = {getWeakSets, getWeakMaps};

const weakRefSupported = typeof WeakRef !== 'undefined' && typeof FinalizationRegistry !== 'undefined';

// Shim `WeakSet` to capture entries
function getWeakSets() {
	if (!weakRefSupported) return undefined;

	const weakSets = new WeakMap();

	WeakSet = function WeakSet(...iterables) { // eslint-disable-line no-global-assign
		const refs = new Set();
		weakSets.set(this, {
			refs,
			mapping: new WeakMap(),
			finalizationRegistry: new FinalizationRegistry(ref => refs.delete(ref))
		});

		const iterable = iterables[0];
		if (iterable) {
			for (const element of iterable) {
				this.add(element);
			}
		}
	};

	addNonEnumProps(WeakSet.prototype, {
		delete(element) {
			const {refs, mapping, finalizationRegistry} = weakSets.get(this);
			const ref = mapping.get(element);
			if (!ref) return false;

			mapping.delete(element);
			ref.deref();
			refs.delete(ref);
			finalizationRegistry.unregister(ref);
			return true;
		},

		has(element) {
			const {mapping} = weakSets.get(this);
			return mapping.has(element);
		},

		add(element) {
			const {refs, mapping, finalizationRegistry} = weakSets.get(this);
			const ref = new WeakRef(element);
			mapping.set(element, ref);
			refs.add(ref);
			finalizationRegistry.register(element, ref, ref);
			return this;
		}
	});

	// eslint-disable-next-line no-extend-native
	Object.defineProperty(WeakSet.prototype, Symbol.toStringTag, {value: 'WeakSet', configurable: true});

	return weakSets;
}

// Shim `WeakMap` to capture entries
// Adpated from https://github.com/tc39/proposal-weakrefs#iterable-weakmaps
function getWeakMaps() {
	if (!weakRefSupported) return undefined;

	const weakMaps = new WeakMap();

	const WeakMapOriginal = WeakMap;
	WeakMap = function WeakMap(...iterables) { // eslint-disable-line no-global-assign
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
	};

	addNonEnumProps(WeakMap.prototype, {
		delete(key) {
			const {refs, mapping, finalizationRegistry} = weakMaps.get(this);
			const entry = mapping.get(key);
			if (!entry) return false;

			mapping.delete(key);
			const {ref} = entry;
			ref.deref();
			refs.delete(ref);
			mapping.delete(key);
			finalizationRegistry.unregister(ref);

			return true;
		},

		get(key) {
			const {mapping} = weakMaps.get(this);
			const entry = mapping.get(key);
			return entry && entry.value;
		},

		set(key, value) {
			const {refs, mapping, finalizationRegistry} = weakMaps.get(this);
			const ref = new WeakRef(key);
			mapping.set(key, {ref, value});
			refs.add(ref);
			finalizationRegistry.register(key, ref, ref);
			return this;
		},

		has(key) {
			const {mapping} = weakMaps.get(this);
			return mapping.has(key);
		}
	});

	// eslint-disable-next-line no-extend-native
	Object.defineProperty(WeakMap.prototype, Symbol.toStringTag, {value: 'WeakMap', configurable: true});

	return weakMaps;
}

function addNonEnumProps(obj, props) {
	for (const [key, value] of Object.entries(props)) {
		Object.defineProperty(obj, key, {
			value,
			writable: true,
			configurable: true
		});
	}
}
