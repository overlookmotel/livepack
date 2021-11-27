/* --------------------
 * livepack module
 * Tests for ESM imports/exports
 * ------------------*/

'use strict';

// Modules
const parseNodeVersion = require('parse-node-version');

// Imports
const {itSerializes, createFixturesFunctions} = require('./support/index.js');

const {importFixtures} = createFixturesFunctions(__filename);

const itSerializesIfNode16 = parseNodeVersion(process.version).major >= 16
	? itSerializes
	: itSerializes.skip;

// Tests

describe('ESM', () => {
	describe('imports are tree-shaken', () => {
		describe('default export', () => {
			itSerializes('expression', {
				in: () => importFixtures({
					'index.mjs': `
						import def from './imported.mjs';
						export default (0, () => def);
					`,
					'imported.mjs': `
						export default {dd: 1};
						export const x = {xx: 2}, y = {yy: 3};
					`
				}),
				out: '(a=>()=>a)({dd:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual({dd: 1});
				}
			});

			itSerializes('unnamed function declaration', {
				in: () => importFixtures({
					'index.mjs': `
						import def from './imported.mjs';
						export default (0, () => def);
					`,
					'imported.mjs': `
						export default function() { return 1; };
						export function x() { return 2; };
					`
				}),
				out: '(a=>()=>a)(Object.defineProperties(function(){return 1},{name:{value:"default"}}))',
				validate(outerFn) {
					expect(outerFn).toBeFunction();
					const fn = outerFn();
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('named function declaration', {
				in: () => importFixtures({
					'index.mjs': `
						import def from './imported.mjs';
						export default (0, () => def);
					`,
					'imported.mjs': `
						export default function fn() { return 1; };
						export function x() { return 2; };
					`
				}),
				out: '(a=>()=>a)(function fn(){return 1;})',
				validate(outerFn) {
					expect(outerFn).toBeFunction();
					const fn = outerFn();
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('named var', {
				in: () => importFixtures({
					'index.mjs': `
						import def from './imported.mjs';
						export default (0, () => def);
					`,
					'imported.mjs': `
						const d = {dd: 1}, x = 2, y = 3;
						export {d as default, x, y};
					`
				}),
				out: '(a=>()=>a)({dd:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual({dd: 1});
				}
			});
		});

		describe('named export', () => {
			itSerializes('function declaration', {
				in: () => importFixtures({
					'index.mjs': `
						import {fn} from './imported.mjs';
						export default (0, () => fn);
					`,
					'imported.mjs': `
						export function fn() { return 1; };
						export function fn2() { return 2; };
					`
				}),
				out: '(a=>()=>a)(function fn(){return 1;})',
				validate(outerFn) {
					expect(outerFn).toBeFunction();
					const fn = outerFn();
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('consts', {
				in: () => importFixtures({
					'index.mjs': `
						import {x, y} from './imported.mjs';
						export default (0, () => [x, y]);
					`,
					'imported.mjs': 'export const x = {xx: 1}, y = {yy: 2}, z = {zz: 3};'
				}),
				out: '((a,b)=>()=>[a,b])({xx:1},{yy:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual([{xx: 1}, {yy: 2}]);
				}
			});

			itSerializes('lets', {
				in: () => importFixtures({
					'index.mjs': `
						import {x, y} from './imported.mjs';
						export default (0, () => [x, y]);
					`,
					'imported.mjs': 'export let x = {xx: 1}, y = {yy: 2}, z = {zz: 3};'
				}),
				out: '((a,b)=>()=>[a,b])({xx:1},{yy:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual([{xx: 1}, {yy: 2}]);
				}
			});

			itSerializes('vars', {
				in: () => importFixtures({
					'index.mjs': `
						import {x, y} from './imported.mjs';
						export default (0, () => [x, y]);
					`,
					'imported.mjs': 'export var x = {xx: 1}, y = {yy: 2}, z = {zz: 3};'
				}),
				out: '((a,b)=>()=>[a,b])({xx:1},{yy:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual([{xx: 1}, {yy: 2}]);
				}
			});

			itSerializes('named exports', {
				in: () => importFixtures({
					'index.mjs': `
						import {x, f} from './imported.mjs';
						export default (0, () => [x, f]);
					`,
					'imported.mjs': `
						const x = {xx: 1}, y = {yy: 2}, z = {zz: 3};
						function fn() { return 4; }
						export {x, y, fn as f}
					`
				}),
				out: '((a,b)=>()=>[a,b])({xx:1},function fn(){return 4;})',
				validate(fn) {
					expect(fn).toBeFunction();
					const arr = fn();
					expect(arr).toBeArrayOfSize(2);
					expect(arr[0]).toEqual({xx: 1});
					expect(arr[1]).toBeFunction();
					expect(arr[1]()).toBe(4);
				}
			});

			describe('deconstructed consts', () => {
				itSerializes('array deconstruction', {
					in: () => importFixtures({
						'index.mjs': `
							import {x, y} from './imported.mjs';
							export default (0, () => [x, y]);
						`,
						'imported.mjs': 'export const [x, y, z] = [{xx: 1}, {yy: 2}, {zz: 3}];'
					}),
					out: '((a,b)=>()=>[a,b])({xx:1},{yy:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{xx: 1}, {yy: 2}]);
					}
				});

				itSerializes('object deconstruction', {
					in: () => importFixtures({
						'index.mjs': `
							import {x, y} from './imported.mjs';
							export default (0, () => [x, y]);
						`,
						'imported.mjs': 'export const {x, _y: y, z} = {x: {xx: 1}, _y: {yy: 2}, z: {zz: 3}};'
					}),
					out: '((a,b)=>()=>[a,b])({xx:1},{yy:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{xx: 1}, {yy: 2}]);
					}
				});

				itSerializes('array rest', {
					in: () => importFixtures({
						'index.mjs': `
							import {x, z} from './imported.mjs';
							export default (0, () => [x, z]);
						`,
						'imported.mjs': 'export const [x, y, ...z] = [{xx: 1}, {yy: 2}, {zz: 3}, {zzz: 4}];'
					}),
					out: '((a,b)=>()=>[a,b])({xx:1},[{zz:3},{zzz:4}])',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{xx: 1}, [{zz: 3}, {zzz: 4}]]);
					}
				});

				itSerializes('object rest', {
					in: () => importFixtures({
						'index.mjs': `
							import {x, z} from './imported.mjs';
							export default (0, () => [x, z]);
						`,
						'imported.mjs': `
							export const {x, y, ...z} = {x: {xx: 1}, y: {yy: 2}, z: {zz: 3}, zz: {zzz: 4}};
						`
					}),
					out: '((a,b)=>()=>[a,b])({xx:1},{z:{zz:3},zz:{zzz:4}})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{xx: 1}, {z: {zz: 3}, zz: {zzz: 4}}]);
					}
				});

				itSerializes('nested patterns', {
					in: () => importFixtures({
						'index.mjs': `
							import {w, x, y, z} from './imported.mjs';
							export default (0, () => [w, x, y, z]);
						`,
						'imported.mjs': `
							export const [
								m,
								w,
								{
									xx: {xxx: x, n},
									...y
								},
								o,
								...{
									length: p,
									0: z
								}
							] = [
								{mm: 1},
								{ww: 2},
								{
									xx: {
										xxx: {xx: 3},
										n: {nn: 4}
									},
									y1: {yy1: 5},
									y2: {yy2: 6}
								},
								{oo: 7},
								{zz: 8},
								{qq: 9}
							];
						`
					}),
					out: '((a,b,c,d)=>()=>[a,b,c,d])({ww:2},{xx:3},{y1:{yy1:5},y2:{yy2:6}},{zz:8})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{ww: 2}, {xx: 3}, {y1: {yy1: 5}, y2: {yy2: 6}}, {zz: 8}]);
					}
				});
			});
		});
	});

	describe('assigning to imported var is const violation', () => {
		describe('when imported as', () => {
			itSerializes('default import', {
				in: () => importFixtures({
					'index.mjs': `
						import x from './imported.mjs';
						export default (0, () => { x = 1; });
					`,
					'imported.mjs': `
						let x = {xx: 1};
						export {x as default};
					`
				}),
				out: '()=>{1,(()=>{const a=0;a=0})()}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});

			itSerializes('named import', {
				in: () => importFixtures({
					'index.mjs': `
						import {x} from './imported.mjs';
						export default (0, () => { x = 1; });
					`,
					'imported.mjs': 'export let x = {xx: 1};'
				}),
				out: '()=>{1,(()=>{const a=0;a=0})()}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});

			itSerializes('namespace import', {
				in: () => importFixtures({
					'index.mjs': `
						import * as mod from './imported.mjs';
						export default (0, () => { mod = 1; });
					`,
					'imported.mjs': 'export let x = {xx: 1};'
				}),
				out: '()=>{1,(()=>{const a=0;a=0})()}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});
		});

		describe('when assigned to with', () => {
			itSerializes('=', {
				in: () => importFixtures({
					'index.mjs': `
						import {x} from './imported.mjs';
						export default (0, () => { x = 1; });
					`,
					'imported.mjs': 'export let x = {xx: 1};'
				}),
				out: '()=>{1,(()=>{const a=0;a=0})()}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});

			itSerializes('++', {
				in: () => importFixtures({
					'index.mjs': `
						import {x} from './imported.mjs';
						export default (0, () => { x++; });
					`,
					'imported.mjs': 'export let x = {xx: 1};'
				}),
				out: '(b=>()=>{+b,(()=>{const a=0;a=0})()})({xx:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});

			itSerializes('+=', {
				in: () => importFixtures({
					'index.mjs': `
						import {x} from './imported.mjs';
						export default (0, () => { x += 1; });
					`,
					'imported.mjs': 'export let x = {xx: 1};'
				}),
				out: '(b=>()=>{b+1,(()=>{const a=0;a=0})()})({xx:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});

			itSerializesIfNode16('&&=', {
				in: () => importFixtures({
					'index.mjs': `
						import {x} from './imported.mjs';
						export default (0, () => { x &&= 1; });
					`,
					'imported.mjs': 'export let x = {xx: 1};'
				}),
				out: '(b=>()=>{b&&(1,(()=>{const a=0;a=0})())})({xx:1})',
				validate(fn) {
					/* eslint-disable jest/no-standalone-expect */
					expect(fn).toBeFunction();
					expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					/* eslint-enable jest/no-standalone-expect */
				}
			});
		});
	});

	describe('identical imports/exports are consolidated', () => {
		describe('single module scope', () => {
			itSerializes('direct import', {
				in: () => importFixtures({
					'index.mjs': `
						import def from './imported.mjs';
						import {x, y, z} from './imported.mjs';
						export default (0, () => [def, x, y, z]);
					`,
					'imported.mjs': `
						export const x = {xx: 1};
						export {x as y, x as z, x as default};
					`
				}),
				out: '(a=>()=>[a,a,a,a])({xx:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(4);
					expect(res[0]).toEqual({xx: 1});
					expect(res[1]).toBe(res[0]);
					expect(res[2]).toBe(res[0]);
					expect(res[3]).toBe(res[0]);
				}
			});

			itSerializes('indirect import', {
				in: () => importFixtures({
					'index.mjs': `
						import def, {z as z2} from './imported.mjs';
						import {x2 as x3, y4 as y5} from './intermediate1.mjs';
						export default (0, () => [def, x3, y5, z2]);
					`,
					'intermediate1.mjs': `
						import {x} from './imported.mjs';
						import {y3} from './intermediate2.mjs';
						export {x as x2, y3 as y4};
					`,
					'intermediate2.mjs': `
						export {y2 as y3} from './intermediate3.mjs';
					`,
					'intermediate3.mjs': `
						export {y as y2} from './imported.mjs';
					`,
					'imported.mjs': `
						export const x = {xx: 1};
						export {x as y, x as z, x as default};
					`
				}),
				out: '(a=>()=>[a,a,a,a])({xx:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(4);
					expect(res[0]).toEqual({xx: 1});
					expect(res[1]).toBe(res[0]);
					expect(res[2]).toBe(res[0]);
					expect(res[3]).toBe(res[0]);
				}
			});

			itSerializes('direct import in nested scope', {
				in: () => importFixtures({
					'index.mjs': `
						import def from './imported.mjs';
						import {x, y, z} from './imported.mjs';
						let fn;
						{
							const w = x;
							fn = (0, () => [def, x, y, z, w]);
						}
						export default fn;
					`,
					'imported.mjs': `
						export const x = {xx: 1};
						export {x as y, x as z, x as default};
					`
				}),
				out: '(()=>{const a={xx:1};return(b=>a=>()=>[b,b,b,b,a])(a)(a)})()',
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(5);
					expect(res[0]).toEqual({xx: 1});
					expect(res[1]).toBe(res[0]);
					expect(res[2]).toBe(res[0]);
					expect(res[3]).toBe(res[0]);
					expect(res[4]).toBe(res[0]);
				}
			});
		});

		describe('multiple module scopes', () => {
			itSerializes('with no nested scopes', {
				in: () => importFixtures({
					'index.mjs': `
						import {getX} from './intermediate.mjs?q=1';
						import {getY} from './intermediate.mjs?q=2';
						import {getDef} from './intermediate.mjs?q=3';
						export default {getX, getY, getDef};
					`,
					'intermediate.mjs': `
						import def, {x, y} from './imported.mjs';
						const q = new URL(import.meta.url).searchParams.get('q') * 1;
						export const getX = (0, () => ({x, q})),
							getY = (0, () => ({y, q})),
							getDef = (0, () => ({def, q}));
					`,
					'imported.mjs': `
						export const x = {xx: 1};
						export {x as y, x as default};
					`
				}),
				out: `(()=>{
					const a=(a,b)=>[
							()=>({x:a,q:b}),
							()=>({y:a,q:b}),
							()=>({def:a,q:b})
						],
						b={xx:1};
					return{
						getX:a(b,1)[0],
						getY:a(b,2)[1],
						getDef:a(b,3)[2]
					}
				})()`,
				validate({getX, getY, getDef}) {
					expect(getX).toBeFunction();
					const resX = getX();
					expect(resX).toEqual({x: {xx: 1}, q: 1});

					expect(getY).toBeFunction();
					const resY = getY();
					expect(resY).toEqual({y: {xx: 1}, q: 2});
					expect(resY.y).toBe(resX.x);

					expect(getDef).toBeFunction();
					const resDef = getDef();
					expect(resDef).toEqual({def: {xx: 1}, q: 3});
					expect(resDef.def).toBe(resX.x);
				}
			});

			itSerializes('with nested scopes', {
				in: () => importFixtures({
					'index.mjs': `
						import {getX} from './intermediate.mjs?q=1';
						import {getY} from './intermediate.mjs?q=2';
						import {getDef} from './intermediate.mjs?q=3';
						export default {getX, getY, getDef};
					`,
					'intermediate.mjs': `
						import def, {x, y} from './imported.mjs';
						const q = new URL(import.meta.url).searchParams.get('q') * 1;
						export let getX, getY, getDef;
						{
							const x2 = x;
							getX = (0, () => ({x, x2, q}));
						}
						{
							const y2 = y;
							getY = (0, () => ({y, y2, q}));
						}
						{
							const def2 = def;
							getDef = (0, () => ({def, def2, q}));
						}
					`,
					'imported.mjs': `
						export const x = {xx: 1};
						export {x as y, x as default};
					`
				}),
				out: `(()=>{
					const a=(b,c)=>[
							a=>()=>({x:b,x2:a,q:c}),
							a=>()=>({y:b,y2:a,q:c}),
							a=>()=>({def:b,def2:a,q:c})
						],
						b={xx:1};
					return{
						getX:a(b,1)[0](b),
						getY:a(b,2)[1](b),
						getDef:a(b,3)[2](b)
					}
				})()`,
				validate({getX, getY, getDef}) {
					expect(getX).toBeFunction();
					const resX = getX();
					expect(resX).toEqual({x: {xx: 1}, x2: {xx: 1}, q: 1});
					const {x} = resX;
					expect(resX.x2).toBe(x);

					expect(getY).toBeFunction();
					const resY = getY();
					expect(resY).toEqual({y: {xx: 1}, y2: {xx: 1}, q: 2});
					expect(resY.y).toBe(x);
					expect(resY.y2).toBe(x);

					expect(getDef).toBeFunction();
					const resDef = getDef();
					expect(resDef).toEqual({def: {xx: 1}, def2: {xx: 1}, q: 3});
					expect(resDef.def).toBe(x);
					expect(resDef.def2).toBe(x);
				}
			});
		});

		describe('with exported vars re-imported', () => {
			itSerializes('direct self-import', {
				in: () => importFixtures({
					'index.mjs': `
						export const x = {xx: 1};
						export {x as y, x as z};
						import {x as w, y, z} from './index.mjs';
						export default (0, () => [x, w, y, z]);
					`
				}),
				out: '(a=>()=>[a,a,a,a])({xx:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(4);
					expect(res[0]).toEqual({xx: 1});
					expect(res[1]).toBe(res[0]);
					expect(res[2]).toBe(res[0]);
					expect(res[3]).toBe(res[0]);
				}
			});

			itSerializes('indirect self-import', {
				in: () => importFixtures({
					'index.mjs': `
						export const x = {xx: 1};
						export {x as y};
						import {x as w, y, z} from './imported.mjs';
						export default (0, () => [x, w, y, z]);
					`,
					'imported.mjs': `
						import {x, y} from './index.mjs';
						export {x, y, x as z};
					`
				}),
				out: '(a=>()=>[a,a,a,a])({xx:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(4);
					expect(res[0]).toEqual({xx: 1});
					expect(res[1]).toBe(res[0]);
					expect(res[2]).toBe(res[0]);
					expect(res[3]).toBe(res[0]);
				}
			});

			describe('multiple module scopes', () => {
				itSerializes('exports from different scopes not consolidated with non-matching imports', {
					in: () => importFixtures({
						'index.mjs': `
							import fn1 from './imported.mjs?q=1';
							import fn2 from './imported.mjs?q=2';
							export default {fn1, fn2};
						`,
						'imported.mjs': `
							const q = new URL(import.meta.url).searchParams.get('q') * 1;
							export const x = {xx: q};
							export {x as y, x as z};
							import {x as w, y, z} from './imported.mjs?q=1';
							export default (0, () => [x, w, y, z]);
						`
					}),
					out: `(()=>{
						const a=(a,b)=>()=>[a,b,b,b],
							b={xx:1};
						return{
							fn1:a(b,b),
							fn2:a({xx:2},b)
						}
					})()`,
					validate({fn1, fn2}) {
						expect(fn1).toBeFunction();
						const res1 = fn1();
						expect(res1).toBeArrayOfSize(4);
						const x1 = res1[0];
						expect(x1).toEqual({xx: 1});
						expect(res1[1]).toBe(x1);
						expect(res1[2]).toBe(x1);
						expect(res1[3]).toBe(x1);

						expect(fn2).toBeFunction();
						const res2 = fn2();
						expect(res2).toBeArrayOfSize(4);
						expect(res2[0]).toEqual({xx: 2});
						expect(res2[1]).toBe(x1);
						expect(res2[2]).toBe(x1);
						expect(res2[3]).toBe(x1);
					}
				});

				itSerializes(
					'exports from different scopes consolidated with imports when only scope exports used match imports',
					{
						in: () => importFixtures({
							'index.mjs': `
								import {getImport as getImport1, getExport} from './imported.mjs?q=1';
								import {getImport as getImport2} from './imported.mjs?q=2';
								export default {getImport1, getImport2, getExport};
							`,
							'imported.mjs': `
								const q = new URL(import.meta.url).searchParams.get('q') * 1;
								export const x = {xx: q};
								import {x as y} from './imported.mjs?q=1';
								export const getExport = (0, () => x),
									getImport = (0, () => y);
							`
						}),
						out: `(()=>{
							const a=a=>[
									()=>a,
									()=>a
								],
								b={xx:1},
								c=a(b);
							return{
								getImport1:c[0],
								getImport2:a(b)[0],
								getExport:c[1]
							}
						})()`,
						validate({getImport1, getImport2, getExport}) {
							expect(getImport1).toBeFunction();
							const x = getImport1();
							expect(x).toEqual({xx: 1});
							expect(getImport2).toBeFunction();
							expect(getImport2()).toBe(x);
							expect(getExport).toBeFunction();
							expect(getExport()).toBe(x);
						}
					}
				);

				// This test doesn't work yet as requires a live binding which isn't implemented yet.
				// TODO Enable it once implemented.
				itSerializes.skip(
					'exports from different scopes not consolidated if a scope used for writing export only',
					{
						in: () => importFixtures({
							'index.mjs': `
								import {getImport as getImport1, setExport as setExport1} from './imported.mjs?q=1';
								import {getImport as getImport2, setExport as setExport2} from './imported.mjs?q=2';
								export default {getImport1, getImport2, setExport1, setExport2};
							`,
							'imported.mjs': `
								const q = new URL(import.meta.url).searchParams.get('q') * 1;
								export let x = {xx: q};
								import {x as y} from './imported.mjs?q=1';
								export const getImport = (0, () => y),
									setExport = (0, (v) => { x = v; });
							`
						}),
						out: `(()=>{
							const a=(b,c)=>[
									()=>b,
									a=>{c=a}
								],
								b={xx:1},
								c=a(b),
								d=a(b);
							return{
								getImport1:c[0],
								getImport2:d[0],
								setExport1:c[1],
								setExport2:d[1]
							}
						})()`,
						validate({getImport1, getImport2, setExport1, setExport2}) {
							expect(getImport1).toBeFunction();
							const x = getImport1();
							expect(x).toEqual({xx: 1});
							expect(getImport2).toBeFunction();
							expect(getImport2()).toBe(x);

							// Calling `setExport1()` changes `x` in first scope
							expect(setExport1).toBeFunction();
							const newX = {yy: 2};
							setExport1(newX);
							expect(getImport1()).toBe(newX);
							expect(getImport2()).toBe(newX);

							// Calling `setExport2()` does not change `x` in first scope
							expect(setExport2).toBeFunction();
							setExport2({zz: 3});
							expect(getImport1()).toBe(newX);
							expect(getImport2()).toBe(newX);
						}
					}
				);
			});
		});

		itSerializes('where replacement var name shadowed at location of one of params being replaced', {
			in: () => importFixtures({
				'index.mjs': `
					import def from './imported.mjs';
					import {x, y, z} from './imported.mjs';
					export default (0, () => {
						const out = [def];
						{
							let def;
							out.push(x, y, z);
						}
						return out;
					});
				`,
				'imported.mjs': `
					export const x = {xx: 1};
					export {x as y, x as z, x as default};
				`
			}),
			out: '(c=>()=>{const a=[c];{let b;a.push(c,c,c)}return a})({xx:1})',
			validate(fn) {
				expect(fn).toBeFunction();
				const res = fn();
				expect(res).toBeArrayOfSize(4);
				expect(res[0]).toEqual({xx: 1});
				expect(res[1]).toBe(res[0]);
				expect(res[2]).toBe(res[0]);
				expect(res[3]).toBe(res[0]);
			}
		});

		// TODO Shadow test for nested scopes
		// TODO Tests for consolidating `import * as x from 'foo'; import * as y from 'foo';`
		// TODO Tests for same but where intermediates too e.g. `export * as x from 'foo';`
		// TODO Tests for `export * from 'foo'`

		describe('where vars accessible from `eval()`', () => {
			itSerializes('does not consolidate', {
				in: () => importFixtures({
					'index.mjs': `
						import def from './imported.mjs';
						import {x, y, z} from './imported.mjs';
						export default (0, () => [def, x, y, z, eval('[def, x, y, z]')]);
					`,
					'imported.mjs': `
						export const x = {xx: 1};
						export {x as y, x as z, x as default};
					`
				}),
				out: `(()=>{
					const a={xx:1};
					return(0,eval)("
						\\"use strict\\";
						(def,x,y,z)=>()=>[def,x,y,z,eval(\\"[def, x, y, z]\\")]
					")(a,a,a,a)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(5);
					const x = res[0];
					expect(x).toEqual({xx: 1});
					expect(res[1]).toBe(x);
					expect(res[2]).toBe(x);
					expect(res[3]).toBe(x);
					const evalRes = res[4];
					expect(evalRes).toBeArrayOfSize(4);
					expect(evalRes[0]).toBe(x);
					expect(evalRes[1]).toBe(x);
					expect(evalRes[2]).toBe(x);
					expect(evalRes[3]).toBe(x);
				}
			});

			// This test ensures that any future optimization which might attempt to consolidate vars which
			// are not accessible by `eval()` does not fail where the potential replacement var cannot be
			// accessed somewhere the original is used.
			// In this case, `y` is not accessible by eval so could be consolidated into `x`.
			// However, that doesn't work, as `out.push(y)` is in a position where `x` is shadowed
			// (and that inner `x` declaration cannot be renamed as it's frozen by the 2nd `eval()`).
			itSerializes(
				'does not consolidate where not accessible from `eval()` but replacement is shadowed',
				{
					in: () => importFixtures({
						'index.mjs': `
							import {x, y} from './imported.mjs';
							export default (0, () => {
								let out;
								{
									const y = 1;
									out = eval('[x, y]');
								}
								{
									const x = 2;
									out.push(y);
									{
										const y = 3;
										out.push(eval('[x, y]'))
									}
								}
								return out;
							});
						`,
						'imported.mjs': `
							export const x = {xx: 1};
							export {x as y};
						`
					}),
					out: `(()=>{
						const a={xx:1};
						return(0,eval)("
							\\"use strict\\";
							(x,y)=>()=>{
								let out;
								{
									const y=1;
									out=eval(\\"[x, y]\\")
								}
								{
									const x=2;
									out.push(y);
									{
										const y=3;
										out.push(eval(\\"[x, y]\\"))
									}
								}
								return out
							}
						")(a,a)
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toBeArrayOfSize(4);
						const x = res[0];
						expect(x).toEqual({xx: 1});
						expect(res[1]).toBe(1);
						expect(res[2]).toBe(x);
						expect(res[3]).toEqual([2, 3]);
					}
				}
			);
		});
	});

	describe('module namespace objects', () => {
		// TODO
		// TODO Include test for `export * as x from './imported.js';`
	});
});
