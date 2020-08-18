'use strict';

const extA = {extA3: 5};
function outer(extB) {
	return () => [extA, extB];
}

const inner = outer({extB3: 6});
module.exports = inner;
