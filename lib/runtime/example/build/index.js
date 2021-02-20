// CommonJS code created from serializing `src/index.mjs`

((scopeWrapper) => {
	const unwrapScopeWrapper = require('livepack/lib/runtime/unwrapScopeWrapper.js');
	const createScope = unwrapScopeWrapper(scopeWrapper, 'x'); // Names of shared vars
	const scope = createScope(1); // `createScope` works as usual
	const getX = scope[0];
	const setX = scope[1];
	const getY = scope[2];
	const getZ = scope[3];
	console.log(getX());
	console.log(getY());
	console.log(getZ());
	setX(2);
	console.log(getX());
	console.log(getY());
	console.log(getZ());
})(
	(x) => [
		// Functions in module in which shared vars live does not need to be wrapped in `with () {}`
		function getX() {
			'use strict';
			return eval('x');
		},
		function setX(v) {
			'use strict';
			eval('x = v');
		},
		// Functions in other modules which reference shared vars by other names are wrapped in `with () {}`
		(() => {
			with (x('y')) {
				return function getY() {
					'use strict';
					return eval('y');
				};
			}
		})(),
		(() => {
			with (x('z')) {
				return function getZ() {
					'use strict';
					return eval('z');
				};
			}
		})(),
		// Setter added for first param only
		a => x = a,
		// Getter added for each param
		() => x
	]
);
