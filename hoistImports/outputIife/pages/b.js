'use strict';

(window.__livepack || (window.__livepack = [])).push([ // eslint-disable-line no-sparse-arrays, no-undef
	'pages/b',,
	(abcd, createAb) => {
		const ab = createAb(abcd);
		return () => ab('b');
	}
]);
