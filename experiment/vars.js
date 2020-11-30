'use strict';

// Exports

let varCounter = 1;

module.exports = class Var {
	constructor(val) {
		this.id = varCounter++;
		this.val = val;
	}
};
