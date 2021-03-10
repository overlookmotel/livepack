/* --------------------
 * livepack module
 * Tests for built-in modules
 * ------------------*/

'use strict';

// Imports
const {itSerializesEqual, stripSourceMapComment} = require('./support/index.js');

// Tests

describe('Built-in modules', () => {
	describe('top level', () => {
		const pathModule = require('path'); // eslint-disable-line global-require

		describe('single occurance', () => {
			itSerializesEqual('JS format', {
				in: () => pathModule,
				out: 'require("path")',
				validate: res => expect(res).toBe(pathModule)
			});

			itSerializesEqual('CJS format', {
				in: () => pathModule,
				format: 'cjs',
				out: 'module.exports=require("path")',
				validate: res => expect(res).toBe(pathModule)
			});

			itSerializesEqual('ESM format', {
				in: () => pathModule,
				format: 'esm',
				minify: true,
				validateOutput(res, {outputJs, mangle}) {
					expect(stripSourceMapComment(outputJs)).toBe(
						mangle
							? 'import a from"path";export default a'
							: 'import path from"path";export default path'
					);
				}
			});
		});

		describe('multiple occurances', () => {
			itSerializesEqual('JS format', {
				in: () => ({path: pathModule, path2: pathModule, path3: pathModule}),
				out: '(()=>{const a=require("path");return{path:a,path2:a,path3:a}})()',
				validate(res) {
					expect(res).toBeObject();
					expect(res).toContainAllKeys(['path', 'path2', 'path3']);
					expect(res.path).toBe(pathModule);
					expect(res.path2).toBe(pathModule);
					expect(res.path3).toBe(pathModule);
				}
			});

			itSerializesEqual('CJS format', {
				in: () => ({path: pathModule, path2: pathModule, path3: pathModule}),
				format: 'cjs',
				out: 'const a=require("path");module.exports={path:a,path2:a,path3:a}',
				validate(res) {
					expect(res).toBeObject();
					expect(res).toContainAllKeys(['path', 'path2', 'path3']);
					expect(res.path).toBe(pathModule);
					expect(res.path2).toBe(pathModule);
					expect(res.path3).toBe(pathModule);
				}
			});

			itSerializesEqual('ESM format', {
				in: () => ({path: pathModule, path2: pathModule, path3: pathModule}),
				format: 'esm',
				minify: true,
				validateOutput(obj, {outputJs, mangle, inline}) {
					expect(stripSourceMapComment(outputJs)).toBe(
						mangle // eslint-disable-line no-nested-ternary
							? inline
								? 'import a from"path";export default{path:a,path2:a,path3:a}'
								: 'import a from"path";const b={path:a,path2:a,path3:a};export default b'
							: inline
								? 'import path from"path";export default{path,path2:path,path3:path}'
								: 'import path from"path";const index={path,path2:path,path3:path};export default index'
					);
				}
			});
		});
	});

	describe('level 1', () => {
		const pathJoin = require('path').join; // eslint-disable-line global-require

		describe('single occurance', () => {
			itSerializesEqual('JS format', {
				in: () => pathJoin,
				out: 'require("path").join',
				validate: res => expect(res).toBe(pathJoin)
			});

			itSerializesEqual('CJS format', {
				in: () => pathJoin,
				format: 'cjs',
				out: 'module.exports=require("path").join',
				validate: res => expect(res).toBe(pathJoin)
			});

			itSerializesEqual('ESM format', {
				in: () => pathJoin,
				format: 'esm',
				minify: true,
				validateOutput(res, {outputJs, mangle, inline}) {
					expect(stripSourceMapComment(outputJs)).toBe(
						mangle // eslint-disable-line no-nested-ternary
							? inline
								? 'import a from"path";export default a.join'
								: 'import a from"path";const b=a.join;export default b'
							: inline
								? 'import path from"path";export default path.join'
								: 'import path from"path";const pathJoin=path.join;export default pathJoin'
					);
				}
			});
		});

		describe('multiple occurances', () => {
			itSerializesEqual('JS format', {
				in: () => ({pathJoin, pathJoin2: pathJoin, pathJoin3: pathJoin}),
				out: '(()=>{const a=require("path").join;return{pathJoin:a,pathJoin2:a,pathJoin3:a}})()',
				validate(res) {
					expect(res).toBeObject();
					expect(res).toContainAllKeys(['pathJoin', 'pathJoin2', 'pathJoin3']);
					expect(res.pathJoin).toBe(pathJoin);
					expect(res.pathJoin2).toBe(pathJoin);
					expect(res.pathJoin3).toBe(pathJoin);
				}
			});

			itSerializesEqual('CJS format', {
				in: () => ({pathJoin, pathJoin2: pathJoin, pathJoin3: pathJoin}),
				format: 'cjs',
				out: 'const a=require("path").join;module.exports={pathJoin:a,pathJoin2:a,pathJoin3:a}',
				validate(res) {
					expect(res).toBeObject();
					expect(res).toContainAllKeys(['pathJoin', 'pathJoin2', 'pathJoin3']);
					expect(res.pathJoin).toBe(pathJoin);
					expect(res.pathJoin2).toBe(pathJoin);
					expect(res.pathJoin3).toBe(pathJoin);
				}
			});

			itSerializesEqual('ESM format', {
				in: () => ({pathJoin, pathJoin2: pathJoin, pathJoin3: pathJoin}),
				format: 'esm',
				minify: true,
				validateOutput(obj, {outputJs, mangle, inline}) {
					expect(stripSourceMapComment(outputJs)).toBe(
						mangle // eslint-disable-line no-nested-ternary
							? inline
								? 'import a from"path";const b=a.join;export default{pathJoin:b,pathJoin2:b,pathJoin3:b}'
								: 'import a from"path";const b=a.join,c={pathJoin:b,pathJoin2:b,pathJoin3:b};export default c'
							: inline
								? 'import path from"path";const pathJoin=path.join;export default{pathJoin,pathJoin2:pathJoin,pathJoin3:pathJoin}'
								: 'import path from"path";const pathJoin=path.join,index={pathJoin,pathJoin2:pathJoin,pathJoin3:pathJoin};export default index'
					);
				}
			});
		});
	});
});
