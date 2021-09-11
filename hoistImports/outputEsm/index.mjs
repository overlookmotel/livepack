import {memoize, importModule, importMany, importValue} from './runtime.mjs';
import _createAb from './common/ab.mjs';
import abcd from './common/abcd.mjs';

const createAb = memoize(_createAb);
const ab = createAb(abcd);

(async () => {
	ab('sync');

	(
		await importModule('pages/a').then(createA => createA(abcd, createAb))
	)();
	(
		await importModule('pages/b').then(createB => createB(abcd, createAb))
	)();
	(
		await importMany('common/cd', 'pages/c')
			.then(([createCd, createC]) => createC(abcd, createCd))
	)();
	// Importing `common/abcd` is unnecessary here.
	// Just for demonstration of importing module which has no dependencies.
	(
		await importMany(1, 'common/abcd', 'common/cd', 'pages/d')
			.then(([abcd, createCd, createD]) => createD(abcd, createCd)) // eslint-disable-line no-shadow
	)();

	(await importValue('common/abcd'))('direct');
})();
