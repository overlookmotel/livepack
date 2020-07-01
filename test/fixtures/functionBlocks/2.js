'use strict';

const inner3 = require('./3.js');

const extA = {extA2: 3};
function outer(extB) {
	return () => [extA, extB];
}

const inner2 = outer({extB2: 4});

module.exports = {inner2, inner3};
