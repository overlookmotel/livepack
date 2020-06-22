/* --------------------
 * livepack module
 * Functions to create unique var names.
 * ------------------*/

'use strict';

// Modules
const checkReservedWord = require('reserved-words').check;

// Exports

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
	NUM_CHARS = CHARS.length;

/**
 * Factory superclass.
 * Extended by `MangledVarNameFactory` and `UnmangledVarNameFactory`.
 * @param {Set} reservedNames - Set of reserved names
 */
class VarNameFactory {
	constructor(reservedNames) {
		this.reservedNames = reservedNames;
	}

	isReserved(name) {
		// Check if reserved name
		const {reservedNames} = this;
		if (reservedNames && reservedNames.has(name)) return true;

		// Check if JS reserved word
		if (isReservedWord(name)) return true;

		// Treat 'arguments' as a reserved word (NB 'this' is already caught by `checkReservedWord()`)
		if (name === 'arguments') return true;

		return false;
	}
}

/**
 * Factory for mangled var names.
 *   - First name is 'a'
 *   - Then 'b', 'c', ...'z', 'A', 'B', 'C', ...'Z'
 *   - Then 'aa', 'ab', ...'aZ'
 *   - Then 'ba', 'bb', ...'bZ', ...'ZZ'
 *   - Then 'aaa', 'aab'...
 *
 * Names present in reserved names set and JS reserved words are avoided.
 *
 * @param {Set} reservedNames - Set of reserved names
 */
class MangledVarNameFactory extends VarNameFactory {
	constructor(reservedNames) {
		super(reservedNames);
		this.counter = 0;
	}

	transform() {
		let remainder = this.counter;
		let name = '';
		while (true) { // eslint-disable-line no-constant-condition
			const code = remainder % NUM_CHARS;

			name = `${CHARS[code]}${name}`;

			remainder = (remainder - code) / NUM_CHARS - 1;
			if (remainder === -1) break;
		}

		this.counter++;

		if (this.isReserved(name)) return this.transform();

		return name;
	}
}

function createMangledVarNameTransform(reservedNames) {
	const factory = new MangledVarNameFactory(reservedNames);
	return factory.transform.bind(factory);
}

/**
 * Factory for unmangled var names.
 * Aims to not change var names if possible, but ensure all names are unique.
 * Where a name has been used before, name is postpended with '$0', '$1', '$2' etc
 *
 * Names present in reserved names set and JS reserved words are avoided.
 *
 * @param {Set} reservedNames - Set of reserved names
 */
const NAME_REGEX = /^(.*?)(?:\$(\d+))?$/;

class UnmangledVarNameFactory extends VarNameFactory {
	constructor(reservedNames) {
		super(reservedNames);
		this.used = {};
	}

	transform(name) {
		const [, nameWithoutPostfix, numStr] = name.match(NAME_REGEX);
		let num = numStr ? numStr * 1 : -1;

		const {used} = this;
		const usedNum = used[nameWithoutPostfix];
		if (usedNum !== undefined && num <= usedNum) num = usedNum + 1;

		let outName = nameWithoutPostfix;
		while (true) { // eslint-disable-line no-constant-condition
			if (num > -1) outName = `${nameWithoutPostfix}$${num}`;
			if (!this.isReserved(outName)) break;
			num++;
		}

		used[nameWithoutPostfix] = num;

		return outName;
	}
}

function createUnmangledVarNameTransform(reservedNames) {
	const factory = new UnmangledVarNameFactory(reservedNames);
	return factory.transform.bind(factory);
}

module.exports = {
	createMangledVarNameTransform,
	createUnmangledVarNameTransform,
	// Classes only exported for unit testing
	MangledVarNameFactory,
	UnmangledVarNameFactory
};

/**
 * Determine if var name is a JS reserved word e.g. 'break', 'class'.
 * @param {string} name - Variable name
 * @returns {boolean} - `true` if reserved word, `false` if not
 */
function isReservedWord(name) {
	return checkReservedWord(name, 'es6', true);
}
