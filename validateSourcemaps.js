/* eslint-disable no-console */

'use strict';

const pathJoin = require('path').join,
	{readFile} = require('fs').promises, // eslint-disable-line node/no-unsupported-features/node-builtins
	readdir = require('recursive-readdir'),
	validate = require('sourcemap-validator');

const dirPath = pathJoin(__dirname, 'example/intermediate/example');
// const dirPath = pathJoin(__dirname, 'node_modules/is-it-type/dist');

(async () => {
	const paths = await readdir(dirPath);

	for (const path of paths) {
		if (!path.match(/\.js$/)) continue;

		const code = await readFile(path, 'utf8');

		let map;
		const mapPath = `${path}.map`;
		try {
			map = await readFile(mapPath, 'utf8');
		} catch (err) {} // eslint-disable-line no-empty

		const pathShort = path.slice(dirPath.length);

		try {
			validate(code, map);
			console.log('VALID:', pathShort);
		} catch (err) {
			if (err.message === 'No map argument provided, and no inline sourcemap found') {
				console.log('NO SOURCE MAP:', pathShort);
			} else {
				console.log('INVALID:', pathShort, err.message);
			}
			// console.log(path, err.message);
		}
	}
})();
