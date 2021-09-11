'use strict';

global.window = {}; // Just to run this code on NodeJS

(window.__livepack || (window.__livepack = [])).push([ // eslint-disable-line no-undef
	'index',
	1,
	(abcd, createAb, {importValue, importGetter, importMany}) => {
		const ab = createAb(abcd);

		(async () => {
			ab('sync');

			(
				await importGetter('pages/a').then(createA => createA(abcd, createAb))
			)();
			(
				await importGetter('pages/b').then(createB => createB(abcd, createAb))
			)();
			(
				await importMany('common/cd', 'pages/c')
					.then(([createCd, createC]) => createC(abcd, createCd))
			)();
			(
				await importMany(1, 'common/abcd', 'common/cd', 'pages/d')
					.then(([abcd, createCd, createD]) => createD(abcd, createCd)) // eslint-disable-line no-shadow
			)();

			(await importValue('common/abcd'))('direct');
		})();
	},
	['common/abcd', 'common/ab']
]);

// In browser, would be included as script tags on HTML page
require('./runtime.js');
require('./common/ab.js');
require('./common/abcd.js');
