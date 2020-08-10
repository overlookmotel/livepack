/* --------------------
 * livepack module
 * Tests for built-in modules
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Built-in modules', ({
	expectSerializedEqual, serialize, minify, inline, mangle
}) => {
	describe('top level', () => {
		const pathModule = require('path'); // eslint-disable-line global-require

		describe('single occurance', () => {
			it('JS format', () => { // eslint-disable-line jest/lowercase-name
				expectSerializedEqual(
					pathModule,
					'require("path")',
					res => expect(res).toBe(pathModule)
				);
			});

			it('CJS format', () => { // eslint-disable-line jest/lowercase-name
				expectSerializedEqual(
					pathModule,
					'module.exports=require("path")',
					res => expect(res).toBe(pathModule),
					{format: 'cjs'}
				);
			});

			if (minify) {
				it('ESM format', () => { // eslint-disable-line jest/lowercase-name
					const js = serialize(pathModule, {format: 'esm'});
					expect(js).toBe(
						mangle ? 'import a from"path";export default a'
							: 'import path from"path";export default path'
					);
				});
			}
		});

		describe('multiple occurances', () => {
			it('JS format', () => { // eslint-disable-line jest/lowercase-name
				expectSerializedEqual(
					{path: pathModule, path2: pathModule, path3: pathModule},
					'(()=>{const a=require("path");return{path:a,path2:a,path3:a}})()',
					(res) => {
						expect(res).toBeObject();
						expect(res).toContainAllKeys(['path', 'path2', 'path3']);
						expect(res.path).toBe(pathModule);
						expect(res.path2).toBe(pathModule);
						expect(res.path3).toBe(pathModule);
					}
				);
			});

			it('CJS format', () => { // eslint-disable-line jest/lowercase-name
				expectSerializedEqual(
					{path: pathModule, path2: pathModule, path3: pathModule},
					'const a=require("path");module.exports={path:a,path2:a,path3:a}',
					(res) => {
						expect(res).toBeObject();
						expect(res).toContainAllKeys(['path', 'path2', 'path3']);
						expect(res.path).toBe(pathModule);
						expect(res.path2).toBe(pathModule);
						expect(res.path3).toBe(pathModule);
					},
					{format: 'cjs'}
				);
			});

			if (minify) {
				it('ESM format', () => { // eslint-disable-line jest/lowercase-name
					const js = serialize(
						{path: pathModule, path2: pathModule, path3: pathModule},
						{format: 'esm'}
					);
					expect(js).toBe(
						mangle // eslint-disable-line no-nested-ternary
							? inline
								? 'import a from"path";export default{path:a,path2:a,path3:a}'
								: 'import a from"path";const b={path:a,path2:a,path3:a};export default b'
							: inline
								? 'import path from"path";export default{path,path2:path,path3:path}'
								: 'import path from"path";const exports={path,path2:path,path3:path};export default exports'
					);
				});
			}
		});
	});

	describe('level 1', () => {
		const pathJoin = require('path').join; // eslint-disable-line global-require

		describe('single occurance', () => {
			it('JS format', () => { // eslint-disable-line jest/lowercase-name
				expectSerializedEqual(
					pathJoin,
					'require("path").join',
					res => expect(res).toBe(pathJoin)
				);
			});

			it('CJS format', () => { // eslint-disable-line jest/lowercase-name
				expectSerializedEqual(
					pathJoin,
					'module.exports=require("path").join',
					res => expect(res).toBe(pathJoin),
					{format: 'cjs'}
				);
			});

			if (minify) {
				it('ESM format', () => { // eslint-disable-line jest/lowercase-name
					const js = serialize(pathJoin, {format: 'esm'});
					expect(js).toBe(
						mangle // eslint-disable-line no-nested-ternary
							? inline
								? 'import a from"path";export default a.join'
								: 'import a from"path";const b=a.join;export default b'
							: inline
								? 'import path from"path";export default path.join'
								: 'import path from"path";const pathJoin=path.join;export default pathJoin'
					);
				});
			}
		});

		describe('multiple occurances', () => {
			it('JS format', () => { // eslint-disable-line jest/lowercase-name
				expectSerializedEqual(
					{pathJoin, pathJoin2: pathJoin, pathJoin3: pathJoin},
					'(()=>{const a=require("path").join;return{pathJoin:a,pathJoin2:a,pathJoin3:a}})()',
					(res) => {
						expect(res).toBeObject();
						expect(res).toContainAllKeys(['pathJoin', 'pathJoin2', 'pathJoin3']);
						expect(res.pathJoin).toBe(pathJoin);
						expect(res.pathJoin2).toBe(pathJoin);
						expect(res.pathJoin3).toBe(pathJoin);
					}
				);
			});

			it('CJS format', () => { // eslint-disable-line jest/lowercase-name
				expectSerializedEqual(
					{pathJoin, pathJoin2: pathJoin, pathJoin3: pathJoin},
					'const a=require("path").join;module.exports={pathJoin:a,pathJoin2:a,pathJoin3:a}',
					(res) => {
						expect(res).toBeObject();
						expect(res).toContainAllKeys(['pathJoin', 'pathJoin2', 'pathJoin3']);
						expect(res.pathJoin).toBe(pathJoin);
						expect(res.pathJoin2).toBe(pathJoin);
						expect(res.pathJoin3).toBe(pathJoin);
					},
					{format: 'cjs'}
				);
			});

			if (minify) {
				it('ESM format', () => { // eslint-disable-line jest/lowercase-name
					const js = serialize(
						{pathJoin, pathJoin2: pathJoin, pathJoin3: pathJoin},
						{format: 'esm'}
					);
					expect(js).toBe(
						mangle // eslint-disable-line no-nested-ternary
							? inline
								? 'import a from"path";const b=a.join;export default{pathJoin:b,pathJoin2:b,pathJoin3:b}'
								: 'import a from"path";const b=a.join,c={pathJoin:b,pathJoin2:b,pathJoin3:b};export default c'
							: inline
								? 'import path from"path";const pathJoin=path.join;export default{pathJoin,pathJoin2:pathJoin,pathJoin3:pathJoin}'
								: 'import path from"path";const pathJoin=path.join,exports={pathJoin,pathJoin2:pathJoin,pathJoin3:pathJoin};export default exports'
					);
				});
			}
		});
	});
});
