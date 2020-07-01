'use strict';

const extA = {extA1: 1};
function outer(extB) {
	return () => [extA, extB];
}

const inner = outer({extB1: 2});
module.exports = inner;
