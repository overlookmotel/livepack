/* eslint-disable camelcase */

'use strict';

function createScope1(a) {
	function createScope2(b) {
		function one() {
			return 'one = 1';
		}

		function dep() {
			b += 10;
			return `b = ${b}, ${one()}`;
		}

		function inner1() {
			a++;
			return `a = ${a}, ${dep()}`;
		}

		return [one, dep, inner1];
	}

	return [createScope2];
}

const scope101 = createScope1(3),
	createScope101_2 = scope101[0],
	scope102 = createScope101_2(11),
	inner1 = scope102[2],
	scope103 = createScope101_2(12),
	inner2 = scope103[2];

module.exports = {inner1, inner2};
