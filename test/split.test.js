/* --------------------
 * livepack module
 * Tests for code splitting
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, basename} = require('path'),
	{serializeEntries, split, splitAsync} = require('livepack'),
	mapValues = require('lodash/mapValues');

// Imports
const {itSerializes, stripSourceMapComment, stripLineBreaks} = require('./support/index.js'),
	internalSplitPoints = require('../lib/internal.js').splitPoints;

// Tests

const itSerializesEntries = itSerializes.withOptions({entries: true, format: ['cjs', 'esm', 'js']}),
	itSerializesEntriesEqual = itSerializesEntries.withOptions({equal: true});

describe('Code splitting', () => {
	describe('serializeEntries()', () => {
		itSerializesEntriesEqual('outputs primitives in separate files', {
			in: () => ({
				one: 123,
				two: 456
			}),
			outCjs: {
				'one.js': 'module.exports=123',
				'two.js': 'module.exports=456'
			},
			outEsm: {
				'one.js': 'export default 123',
				'two.js': 'export default 456'
			},
			outJs: {
				'one.js': '123',
				'two.js': '456'
			}
		});

		describe('outputs independent values in separate files', () => {
			itSerializesEntriesEqual('where values appear once in each file', {
				in: () => ({
					one: {x: 1},
					two: {y: 2}
				}),
				outCjs: {
					'one.js': 'module.exports={x:1}',
					'two.js': 'module.exports={y:2}'
				},
				outEsm: {
					'one.js': 'export default{x:1}',
					'two.js': 'export default{y:2}'
				},
				outJs: {
					'one.js': '{x:1}',
					'two.js': '{y:2}'
				}
			});

			itSerializesEntriesEqual('where values repeated in each file', {
				in() {
					const obj1 = {isObj1: true},
						obj2 = {isObj2: true};
					return {
						one: [obj1, obj1],
						two: [obj2, obj2]
					};
				},
				outCjs: {
					'one.js': 'const a={isObj1:true};module.exports=[a,a]',
					'two.js': 'const a={isObj2:true};module.exports=[a,a]'
				},
				outEsm: {
					'one.js': 'const a={isObj1:true};export default[a,a]',
					'two.js': 'const a={isObj2:true};export default[a,a]'
				},
				outJs: {
					'one.js': '(()=>{const a={isObj1:true};return[a,a]})()',
					'two.js': '(()=>{const a={isObj2:true};return[a,a]})()'
				},
				validate({one, two}) {
					expect(one[0]).toBe(one[1]);
					expect(two[0]).toBe(two[1]);
				}
			});
		});

		describe('splits shared values into separate files', () => {
			itSerializesEntriesEqual('where one value exported by multiple entry points', {
				in() {
					const shared = {isShared: true};
					return {
						one: shared,
						two: shared
					};
				},
				outCjs: {
					'one.js': 'module.exports={isShared:true}',
					'two.js': 'module.exports=require("./one.js")'
				},
				outEsm: {
					'one.js': 'export default{isShared:true}',
					'two.js': 'import a from"./one.js";export default a'
				},
				outJs: {
					'one.js': 'require("./chunk.7ANF66YZ.js")',
					'two.js': 'require("./chunk.7ANF66YZ.js")',
					'chunk.7ANF66YZ.js': 'module.exports={isShared:true}'
				},
				validate(entries) {
					expect(entries.one).toBe(entries.two);
				}
			});

			describe('where one entry point references value of another entry point', () => {
				itSerializesEntriesEqual('unnested first', {
					in() {
						const shared = {isShared: true};
						return {
							one: shared,
							two: {x: shared}
						};
					},
					outCjs: {
						'one.js': 'module.exports={isShared:true}',
						'two.js': 'module.exports={x:require("./one.js")}'
					},
					outEsm: {
						'one.js': 'export default{isShared:true}',
						'two.js': 'import a from"./one.js";export default{x:a}'
					},
					outJs: {
						'one.js': 'require("./chunk.7ANF66YZ.js")',
						'two.js': '{x:require("./chunk.7ANF66YZ.js")}',
						'chunk.7ANF66YZ.js': 'module.exports={isShared:true}'
					},
					validate(entries) {
						expect(entries.two.x).toBe(entries.one);
					}
				});

				itSerializesEntriesEqual('nested first', {
					in() {
						const shared = {isShared: true};
						return {
							one: {x: shared},
							two: shared
						};
					},
					outCjs: {
						'one.js': 'module.exports={x:require("./two.js")}',
						'two.js': 'module.exports={isShared:true}'
					},
					outEsm: {
						'one.js': 'import a from"./two.js";export default{x:a}',
						'two.js': 'export default{isShared:true}'
					},
					outJs: {
						'one.js': '{x:require("./chunk.7ANF66YZ.js")}',
						'two.js': 'require("./chunk.7ANF66YZ.js")',
						'chunk.7ANF66YZ.js': 'module.exports={isShared:true}'
					},
					validate(entries) {
						expect(entries.one.x).toBe(entries.two);
					}
				});
			});

			itSerializesEntriesEqual('where one value shared', {
				in() {
					const shared = {isShared: true};
					return {
						one: {x: shared},
						two: {y: shared}
					};
				},
				outCjs: {
					'one.js': 'module.exports={x:require("./chunk.7ANF66YZ.js")}',
					'two.js': 'module.exports={y:require("./chunk.7ANF66YZ.js")}',
					'chunk.7ANF66YZ.js': 'module.exports={isShared:true}'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.KOPFAARQ.js";export default{x:a}',
					'two.js': 'import a from"./chunk.KOPFAARQ.js";export default{y:a}',
					'chunk.KOPFAARQ.js': 'export default{isShared:true}'
				},
				outJs: {
					'one.js': '{x:require("./chunk.7ANF66YZ.js")}',
					'two.js': '{y:require("./chunk.7ANF66YZ.js")}',
					'chunk.7ANF66YZ.js': 'module.exports={isShared:true}'
				},
				validate(entries) {
					expect(entries.one.x).toBe(entries.two.y);
				}
			});

			itSerializesEntriesEqual('where multiple values shared', {
				in() {
					const shared1 = {isShared1: true},
						shared2 = {isShared2: true},
						shared3 = {isShared3: true};
					return {
						one: {x: shared1, y: shared2, z: shared3},
						two: {e: shared1, f: shared2, g: shared3}
					};
				},
				outCjs: {
					'one.js': 'const a=require("./chunk.2KBRAFUH.js");module.exports={x:a[0],y:a[1],z:a[2]}',
					'two.js': 'const a=require("./chunk.2KBRAFUH.js");module.exports={e:a[0],f:a[1],g:a[2]}',
					'chunk.2KBRAFUH.js': 'module.exports=[{isShared1:true},{isShared2:true},{isShared3:true}]'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.CUEPQVIZ.js";export default{x:a[0],y:a[1],z:a[2]}',
					'two.js': 'import a from"./chunk.CUEPQVIZ.js";export default{e:a[0],f:a[1],g:a[2]}',
					'chunk.CUEPQVIZ.js': 'export default[{isShared1:true},{isShared2:true},{isShared3:true}]'
				},
				outJs: {
					'one.js': '(()=>{const a=require("./chunk.2KBRAFUH.js");return{x:a[0],y:a[1],z:a[2]}})()',
					'two.js': '(()=>{const a=require("./chunk.2KBRAFUH.js");return{e:a[0],f:a[1],g:a[2]}})()',
					'chunk.2KBRAFUH.js': 'module.exports=[{isShared1:true},{isShared2:true},{isShared3:true}]'
				},
				validate({one, two}) {
					expect(one.x).toBe(two.e);
					expect(one.y).toBe(two.f);
					expect(one.z).toBe(two.g);
				}
			});

			itSerializesEntriesEqual('where object and nested object both shared', {
				in() {
					const sharedInner = {isSharedInner: true},
						sharedOuter = {isSharedOuter: true, sharedInner};
					return {
						one: {x: sharedOuter},
						two: {y: sharedOuter, z: sharedInner}
					};
				},
				outCjs: {
					'one.js': 'module.exports={x:require("./chunk.UDJMERLJ.js")[0]}',
					'two.js': 'const a=require("./chunk.UDJMERLJ.js");module.exports={y:a[0],z:a[1]}',
					'chunk.UDJMERLJ.js': `const a={isSharedInner:true};
						module.exports=[{isSharedOuter:true,sharedInner:a},a]`
				},
				outEsm: {
					'one.js': 'import a from"./chunk.WSDEFBGJ.js";export default{x:a[0]}',
					'two.js': 'import a from"./chunk.WSDEFBGJ.js";export default{y:a[0],z:a[1]}',
					'chunk.WSDEFBGJ.js': `const a={isSharedInner:true};
						export default[{isSharedOuter:true,sharedInner:a},a]`
				},
				outJs: {
					'one.js': '{x:require("./chunk.UDJMERLJ.js")[0]}',
					'two.js': '(()=>{const a=require("./chunk.UDJMERLJ.js");return{y:a[0],z:a[1]}})()',
					'chunk.UDJMERLJ.js': `const a={isSharedInner:true};
						module.exports=[{isSharedOuter:true,sharedInner:a},a]`
				},
				validate({one, two}) {
					expect(one.x).toBe(two.y);
					expect(two.z).toBe(two.y.sharedInner);
				}
			});
		});

		describe('creates hierarchy of nested imports', () => {
			itSerializesEntriesEqual('where shared value references a deeper shared value', {
				in() {
					const sharedInner = {isSharedInner: true},
						sharedOuter = {isSharedOuter: true, sharedInner};
					return {
						one: {sharedOuter},
						two: {sharedOuter},
						three: {sharedInner}
					};
				},
				outCjs: {
					'one.js': 'module.exports={sharedOuter:require("./chunk.2F26RNNB.js")}',
					'two.js': 'module.exports={sharedOuter:require("./chunk.2F26RNNB.js")}',
					'three.js': 'module.exports={sharedInner:require("./chunk.BWXH2ONA.js")}',
					'chunk.2F26RNNB.js': 'module.exports={isSharedOuter:true,sharedInner:require("./chunk.BWXH2ONA.js")}',
					'chunk.BWXH2ONA.js': 'module.exports={isSharedInner:true}'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.HQTOG46M.js";export default{sharedOuter:a}',
					'two.js': 'import a from"./chunk.HQTOG46M.js";export default{sharedOuter:a}',
					'three.js': 'import a from"./chunk.A3RNHI7M.js";export default{sharedInner:a}',
					'chunk.HQTOG46M.js': 'import a from"./chunk.A3RNHI7M.js";export default{isSharedOuter:true,sharedInner:a}',
					'chunk.A3RNHI7M.js': 'export default{isSharedInner:true}'
				},
				outJs: {
					'one.js': '{sharedOuter:require("./chunk.2F26RNNB.js")}',
					'two.js': '{sharedOuter:require("./chunk.2F26RNNB.js")}',
					'three.js': '{sharedInner:require("./chunk.BWXH2ONA.js")}',
					'chunk.2F26RNNB.js': 'module.exports={isSharedOuter:true,sharedInner:require("./chunk.BWXH2ONA.js")}',
					'chunk.BWXH2ONA.js': 'module.exports={isSharedInner:true}'
				},
				validate({one, two, three}) {
					expect(two.sharedOuter).toBe(one.sharedOuter);
					expect(three.sharedInner).toBe(one.sharedOuter.sharedInner);
				}
			});

			itSerializesEntriesEqual('where 2 shared values references a deeper shared value', {
				in() {
					const sharedInner = {isSharedInner: true},
						sharedOuter1 = {isSharedOuter1: true, sharedInner},
						sharedOuter2 = {isSharedOuter2: true, sharedInner};
					return {
						one: {sharedOuter1},
						two: {sharedOuter1},
						three: {sharedOuter2},
						four: {sharedOuter2}
					};
				},
				outCjs: {
					'one.js': 'module.exports={sharedOuter1:require("./chunk.XUNONUKD.js")}',
					'two.js': 'module.exports={sharedOuter1:require("./chunk.XUNONUKD.js")}',
					'three.js': 'module.exports={sharedOuter2:require("./chunk.W6O2SXGV.js")}',
					'four.js': 'module.exports={sharedOuter2:require("./chunk.W6O2SXGV.js")}',
					'chunk.XUNONUKD.js': 'module.exports={isSharedOuter1:true,sharedInner:require("./chunk.BWXH2ONA.js")}',
					'chunk.W6O2SXGV.js': 'module.exports={isSharedOuter2:true,sharedInner:require("./chunk.BWXH2ONA.js")}',
					'chunk.BWXH2ONA.js': 'module.exports={isSharedInner:true}'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.OMSDVWTN.js";export default{sharedOuter1:a}',
					'two.js': 'import a from"./chunk.OMSDVWTN.js";export default{sharedOuter1:a}',
					'three.js': 'import a from"./chunk.QGRH6COR.js";export default{sharedOuter2:a}',
					'four.js': 'import a from"./chunk.QGRH6COR.js";export default{sharedOuter2:a}',
					'chunk.OMSDVWTN.js': 'import a from"./chunk.A3RNHI7M.js";export default{isSharedOuter1:true,sharedInner:a}',
					'chunk.QGRH6COR.js': 'import a from"./chunk.A3RNHI7M.js";export default{isSharedOuter2:true,sharedInner:a}',
					'chunk.A3RNHI7M.js': 'export default{isSharedInner:true}'
				},
				outJs: {
					'one.js': '{sharedOuter1:require("./chunk.XUNONUKD.js")}',
					'two.js': '{sharedOuter1:require("./chunk.XUNONUKD.js")}',
					'three.js': '{sharedOuter2:require("./chunk.W6O2SXGV.js")}',
					'four.js': '{sharedOuter2:require("./chunk.W6O2SXGV.js")}',
					'chunk.XUNONUKD.js': 'module.exports={isSharedOuter1:true,sharedInner:require("./chunk.BWXH2ONA.js")}',
					'chunk.W6O2SXGV.js': 'module.exports={isSharedOuter2:true,sharedInner:require("./chunk.BWXH2ONA.js")}',
					'chunk.BWXH2ONA.js': 'module.exports={isSharedInner:true}'
				},
				validate({one, two, three, four}) {
					expect(two.sharedOuter1).toBe(one.sharedOuter1);
					expect(four.sharedOuter2).toBe(three.sharedOuter2);
					expect(three.sharedOuter2.sharedInner).toBe(one.sharedOuter1.sharedInner);
				}
			});
		});

		describe('splits shared functions into separate files', () => {
			itSerializesEntries('where function shared', {
				in() {
					const fn = (0, () => 1);
					return {
						one: fn,
						two: fn
					};
				},
				outCjs: {
					'one.js': 'module.exports=()=>1',
					'two.js': 'module.exports=require("./one.js")'
				},
				outEsm: {
					'one.js': 'export default(()=>1)',
					'two.js': 'import a from"./one.js";export default a'
				},
				outJs: {
					'one.js': 'require("./chunk.IJDQ3VBR.js")',
					'two.js': 'require("./chunk.IJDQ3VBR.js")',
					'chunk.IJDQ3VBR.js': 'module.exports=()=>1'
				},
				validate({one, two}) {
					expect(one).toBeFunction();
					expect(two).toBe(one);
					expect(one()).toBe(1);
				}
			});

			itSerializesEntries('where functions not shared and have no external scope', {
				in: () => ({
					one: (0, () => 1),
					two: (0, () => 2)
				}),
				outCjs: {
					'one.js': 'module.exports=()=>1',
					'two.js': 'module.exports=()=>2'
				},
				outEsm: {
					'one.js': 'export default(()=>1)',
					'two.js': 'export default(()=>2)'
				},
				outJs: {
					'one.js': '()=>1',
					'two.js': '()=>2'
				},
				validate({one, two}) {
					expect(one).toBeFunction();
					expect(one()).toBe(1);
					expect(two).toBeFunction();
					expect(two()).toBe(2);
				}
			});

			itSerializesEntries('where functions not shared and have independent external scope', {
				in() {
					function outer1(ext) {
						return () => ext;
					}
					function outer2(ext) {
						return () => ext;
					}
					return {
						one: outer1(1),
						two: outer2(2)
					};
				},
				outCjs: {
					'one.js': 'module.exports=(a=>()=>a)(1)',
					'two.js': 'module.exports=(a=>()=>a)(2)'
				},
				outEsm: {
					'one.js': 'export default(a=>()=>a)(1)',
					'two.js': 'export default(a=>()=>a)(2)'
				},
				outJs: {
					'one.js': '(a=>()=>a)(1)',
					'two.js': '(a=>()=>a)(2)'
				},
				validate({one, two}) {
					expect(one).toBeFunction();
					expect(one()).toBe(1);
					expect(two).toBeFunction();
					expect(two()).toBe(2);
				}
			});

			itSerializesEntries('where functions have shared scope', {
				in() {
					const ext = {ext: 1};
					return {
						one: (0, () => ext),
						two: (0, () => ext)
					};
				},
				outCjs: {
					'one.js': 'module.exports=require("./chunk.2JJDZNGZ.js")[0]',
					'two.js': 'module.exports=require("./chunk.2JJDZNGZ.js")[1]',
					'chunk.2JJDZNGZ.js': 'module.exports=(a=>[()=>a,()=>a])({ext:1})'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.JQX2KVJO.js";export default a[0]',
					'two.js': 'import a from"./chunk.JQX2KVJO.js";export default a[1]',
					'chunk.JQX2KVJO.js': 'export default(a=>[()=>a,()=>a])({ext:1})'
				},
				outJs: {
					'one.js': 'require("./chunk.2JJDZNGZ.js")[0]',
					'two.js': 'require("./chunk.2JJDZNGZ.js")[1]',
					'chunk.2JJDZNGZ.js': 'module.exports=(a=>[()=>a,()=>a])({ext:1})'
				},
				validate({one, two}) {
					expect(one).toBeFunction();
					expect(two).toBeFunction();
					expect(two).not.toBe(one);
					const res = one();
					expect(res).toEqual({ext: 1});
					expect(two()).toBe(res);
				}
			});

			itSerializesEntries('where function shared with function instances having independent scope', {
				in() {
					function outer(ext) {
						return () => ext;
					}
					return {
						one: outer(1),
						two: outer(2)
					};
				},
				outCjs: {
					'one.js': 'module.exports=require("./chunk.SR3RUJRV.js")(1)',
					'two.js': 'module.exports=require("./chunk.SR3RUJRV.js")(2)',
					'chunk.SR3RUJRV.js': 'module.exports=a=>()=>a'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.54QNI3XL.js";export default a(1)',
					'two.js': 'import a from"./chunk.54QNI3XL.js";export default a(2)',
					'chunk.54QNI3XL.js': 'export default(a=>()=>a)'
				},
				outJs: {
					'one.js': 'require("./chunk.SR3RUJRV.js")(1)',
					'two.js': 'require("./chunk.SR3RUJRV.js")(2)',
					'chunk.SR3RUJRV.js': 'module.exports=a=>()=>a'
				},
				validate({one, two}) {
					expect(one).toBeFunction();
					expect(two).toBeFunction();
					expect(two).not.toBe(one);
					expect(one()).toBe(1);
					expect(two()).toBe(2);
				}
			});
		});

		describe('splits shared functions/classes with prototypes into separate files', () => {
			itSerializesEntries('function with method added to prototype', {
				in() {
					function fn() {}
					fn.prototype.x = () => {};
					return {
						one: {fn},
						two: {fn}
					};
				},
				outCjs: {
					'one.js': 'module.exports={fn:require("./chunk.SDHB37W4.js")}',
					'two.js': 'module.exports={fn:require("./chunk.SDHB37W4.js")}',
					'chunk.SDHB37W4.js': 'const a=function fn(){};a.prototype.x=()=>{};module.exports=a'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.OKCNIS4G.js";export default{fn:a}',
					'two.js': 'import a from"./chunk.OKCNIS4G.js";export default{fn:a}',
					'chunk.OKCNIS4G.js': 'const a=function fn(){};a.prototype.x=()=>{};export default a'
				},
				outJs: {
					'one.js': '{fn:require("./chunk.SDHB37W4.js")}',
					'two.js': '{fn:require("./chunk.SDHB37W4.js")}',
					'chunk.SDHB37W4.js': 'const a=function fn(){};a.prototype.x=()=>{};module.exports=a'
				},
				validate({one, two}) {
					expect(one).toBeObject();
					expect(one).toHaveOwnPropertyNames(['fn']);
					expect(two).toBeObject();
					expect(two).toHaveOwnPropertyNames(['fn']);
					const {fn} = one;
					expect(fn).toBeFunction();
					expect(fn.prototype.x).toBeFunction();
					expect(two.fn).toBe(fn);
				}
			});

			itSerializesEntries('function with method added to prototype where prototype also shared', {
				in() {
					function fn() {}
					fn.prototype.x = () => {};
					return {
						one: {fn},
						two: {fn},
						three: {proto: fn.prototype},
						four: {proto: fn.prototype}
					};
				},
				outCjs: {
					'one.js': 'module.exports={fn:require("./chunk.APMYJZX2.js")[1]}',
					'two.js': 'module.exports={fn:require("./chunk.APMYJZX2.js")[1]}',
					'three.js': 'module.exports={proto:require("./chunk.APMYJZX2.js")[0]}',
					'four.js': 'module.exports={proto:require("./chunk.APMYJZX2.js")[0]}',
					'chunk.APMYJZX2.js': 'const a=function fn(){},b=a.prototype;b.x=()=>{};module.exports=[b,a]'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.QJ676DZH.js";export default{fn:a[1]}',
					'two.js': 'import a from"./chunk.QJ676DZH.js";export default{fn:a[1]}',
					'three.js': 'import a from"./chunk.QJ676DZH.js";export default{proto:a[0]}',
					'four.js': 'import a from"./chunk.QJ676DZH.js";export default{proto:a[0]}',
					'chunk.QJ676DZH.js': 'const a=function fn(){},b=a.prototype;b.x=()=>{};export default[b,a]'
				},
				outJs: {
					'one.js': '{fn:require("./chunk.APMYJZX2.js")[1]}',
					'two.js': '{fn:require("./chunk.APMYJZX2.js")[1]}',
					'three.js': '{proto:require("./chunk.APMYJZX2.js")[0]}',
					'four.js': '{proto:require("./chunk.APMYJZX2.js")[0]}',
					'chunk.APMYJZX2.js': 'const a=function fn(){},b=a.prototype;b.x=()=>{};module.exports=[b,a]'
				},
				validate({one, two, three, four}) {
					expect(one).toBeObject();
					expect(one).toHaveOwnPropertyNames(['fn']);
					expect(two).toBeObject();
					expect(two).toHaveOwnPropertyNames(['fn']);
					expect(three).toBeObject();
					expect(three).toHaveOwnPropertyNames(['proto']);
					expect(four).toBeObject();
					expect(four).toHaveOwnPropertyNames(['proto']);
					const {fn} = one;
					expect(fn).toBeFunction();
					expect(two.fn).toBe(fn);
					const {proto} = three;
					expect(proto).toBe(fn.prototype);
					expect(proto.x).toBeFunction();
					expect(four.proto).toBe(proto);
				}
			});

			itSerializesEntries('class with prototype method', {
				in() {
					class fn {
						x() {} // eslint-disable-line class-methods-use-this
					}
					return {
						one: {fn},
						two: {fn}
					};
				},
				outCjs: {
					'one.js': 'module.exports={fn:require("./chunk.RBUTKIKF.js")}',
					'two.js': 'module.exports={fn:require("./chunk.RBUTKIKF.js")}',
					'chunk.RBUTKIKF.js': 'const a=class fn{};Object.defineProperties(a.prototype,{x:{value:{x(){}}.x,writable:true,configurable:true}});module.exports=a'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.LGMIS4VH.js";export default{fn:a}',
					'two.js': 'import a from"./chunk.LGMIS4VH.js";export default{fn:a}',
					'chunk.LGMIS4VH.js': 'const a=class fn{};Object.defineProperties(a.prototype,{x:{value:{x(){}}.x,writable:true,configurable:true}});export default a'
				},
				outJs: {
					'one.js': '{fn:require("./chunk.RBUTKIKF.js")}',
					'two.js': '{fn:require("./chunk.RBUTKIKF.js")}',
					'chunk.RBUTKIKF.js': 'const a=class fn{};Object.defineProperties(a.prototype,{x:{value:{x(){}}.x,writable:true,configurable:true}});module.exports=a'
				},
				validate({one, two}) {
					expect(one).toBeObject();
					expect(one).toHaveOwnPropertyNames(['fn']);
					expect(two).toBeObject();
					expect(two).toHaveOwnPropertyNames(['fn']);
					const {fn} = one;
					expect(fn).toBeFunction();
					expect(fn.prototype.x).toBeFunction();
					expect(two.fn).toBe(fn);
				}
			});

			itSerializesEntries('function with prototype redefined', {
				in() {
					function fn() {}
					fn.prototype = {constructor: fn};
					return {
						one: {fn},
						two: {fn}
					};
				},
				outCjs: {
					'one.js': 'module.exports={fn:require("./chunk.NEPYRDEA.js")}',
					'two.js': 'module.exports={fn:require("./chunk.NEPYRDEA.js")}',
					'chunk.NEPYRDEA.js': 'const a=function fn(){};Object.defineProperties(a.prototype,{constructor:{enumerable:true}});module.exports=a'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.ZA2H42HN.js";export default{fn:a}',
					'two.js': 'import a from"./chunk.ZA2H42HN.js";export default{fn:a}',
					'chunk.ZA2H42HN.js': 'const a=function fn(){};Object.defineProperties(a.prototype,{constructor:{enumerable:true}});export default a'
				},
				outJs: {
					'one.js': '{fn:require("./chunk.NEPYRDEA.js")}',
					'two.js': '{fn:require("./chunk.NEPYRDEA.js")}',
					'chunk.NEPYRDEA.js': 'const a=function fn(){};Object.defineProperties(a.prototype,{constructor:{enumerable:true}});module.exports=a'
				},
				validate({one, two}) {
					expect(one).toBeObject();
					expect(one).toHaveOwnPropertyNames(['fn']);
					expect(two).toBeObject();
					expect(two).toHaveOwnPropertyNames(['fn']);
					const {fn} = one;
					expect(fn).toBeFunction();
					expect(fn.prototype.constructor).toBe(fn);
					expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, true, true);
					expect(two.fn).toBe(fn);
				}
			});

			describe('function with prototype inheriting from another function prototype', () => {
				itSerializesEntries('where prototype not altered', {
					in() {
						function superFn() {}
						function fn() {}
						Object.setPrototypeOf(fn.prototype, superFn.prototype);
						return {
							one: {fn},
							two: {fn}
						};
					},
					outCjs: {
						'one.js': 'module.exports={fn:require("./chunk.OPUXPLSJ.js")}',
						'two.js': 'module.exports={fn:require("./chunk.OPUXPLSJ.js")}',
						'chunk.OPUXPLSJ.js': 'const a=function fn(){};Object.setPrototypeOf(a.prototype,function superFn(){}.prototype);module.exports=a'
					},
					outEsm: {
						'one.js': 'import a from"./chunk.E5QCQNJB.js";export default{fn:a}',
						'two.js': 'import a from"./chunk.E5QCQNJB.js";export default{fn:a}',
						'chunk.E5QCQNJB.js': 'const a=function fn(){};Object.setPrototypeOf(a.prototype,function superFn(){}.prototype);export default a'
					},
					outJs: {
						'one.js': '{fn:require("./chunk.OPUXPLSJ.js")}',
						'two.js': '{fn:require("./chunk.OPUXPLSJ.js")}',
						'chunk.OPUXPLSJ.js': 'const a=function fn(){};Object.setPrototypeOf(a.prototype,function superFn(){}.prototype);module.exports=a'
					},
					validate({one, two}) {
						expect(one).toBeObject();
						expect(one).toHaveOwnPropertyNames(['fn']);
						expect(two).toBeObject();
						expect(two).toHaveOwnPropertyNames(['fn']);
						const {fn} = one;
						expect(fn).toBeFunction();
						expect(fn.name).toBe('fn');
						expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
						expect(fn.prototype.constructor).toBe(fn);
						expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
						const proto = Object.getPrototypeOf(fn.prototype);
						expect(proto).toBeObject();
						expect(proto).toHaveOwnPropertyNames(['constructor']);
						const superFn = proto.constructor;
						expect(superFn).toBeFunction();
						expect(superFn.name).toBe('superFn');
						expect(superFn.prototype).toBe(proto);
						expect(two.fn).toBe(fn);
					}
				});

				itSerializesEntries('where prototype redefined', {
					in() {
						function superFn() {}
						function fn() {}
						fn.prototype = {constructor: fn};
						Object.setPrototypeOf(fn.prototype, superFn.prototype);
						return {
							one: {fn},
							two: {fn}
						};
					},
					outCjs: {
						'one.js': 'module.exports={fn:require("./chunk.KDBOKE4U.js")}',
						'two.js': 'module.exports={fn:require("./chunk.KDBOKE4U.js")}',
						'chunk.KDBOKE4U.js': 'const a=function fn(){},b=Object;b.setPrototypeOf(b.defineProperties(a.prototype,{constructor:{enumerable:true}}),function superFn(){}.prototype);module.exports=a'
					},
					outEsm: {
						'one.js': 'import a from"./chunk.Y333Q7L3.js";export default{fn:a}',
						'two.js': 'import a from"./chunk.Y333Q7L3.js";export default{fn:a}',
						'chunk.Y333Q7L3.js': 'const a=function fn(){},b=Object;b.setPrototypeOf(b.defineProperties(a.prototype,{constructor:{enumerable:true}}),function superFn(){}.prototype);export default a'
					},
					outJs: {
						'one.js': '{fn:require("./chunk.KDBOKE4U.js")}',
						'two.js': '{fn:require("./chunk.KDBOKE4U.js")}',
						'chunk.KDBOKE4U.js': 'const a=function fn(){},b=Object;b.setPrototypeOf(b.defineProperties(a.prototype,{constructor:{enumerable:true}}),function superFn(){}.prototype);module.exports=a'
					},
					validate({one, two}) {
						expect(one).toBeObject();
						expect(one).toHaveOwnPropertyNames(['fn']);
						expect(two).toBeObject();
						expect(two).toHaveOwnPropertyNames(['fn']);
						const {fn} = one;
						expect(fn).toBeFunction();
						expect(fn.name).toBe('fn');
						expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
						expect(fn.prototype.constructor).toBe(fn);
						expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, true, true);
						const proto = Object.getPrototypeOf(fn.prototype);
						expect(proto).toBeObject();
						expect(proto).toHaveOwnPropertyNames(['constructor']);
						const superFn = proto.constructor;
						expect(superFn).toBeFunction();
						expect(superFn.name).toBe('superFn');
						expect(superFn.prototype).toBe(proto);
						expect(two.fn).toBe(fn);
					}
				});
			});
		});

		describe('circular values', () => {
			describe('independent values output in separate files', () => {
				itSerializesEntriesEqual('where circular values exported directly', {
					in() {
						const obj1 = {isObj1: true},
							obj2 = {isObj2: true};
						obj1.obj1 = obj1;
						obj2.obj2 = obj2;
						return {
							one: obj1,
							two: obj2
						};
					},
					outCjs: {
						'one.js': 'const a={isObj1:true};a.obj1=a;module.exports=a',
						'two.js': 'const a={isObj2:true};a.obj2=a;module.exports=a'
					},
					outEsm: {
						'one.js': 'const a={isObj1:true};a.obj1=a;export default a',
						'two.js': 'const a={isObj2:true};a.obj2=a;export default a'
					},
					outJs: {
						'one.js': '(()=>{const a={isObj1:true};a.obj1=a;return a})()',
						'two.js': '(()=>{const a={isObj2:true};a.obj2=a;return a})()'
					},
					validate({one, two}) {
						expect(one.obj1).toBe(one);
						expect(two.obj2).toBe(two);
					}
				});

				itSerializesEntriesEqual('where circular values nested', {
					in() {
						const obj1 = {isObj1: true},
							obj2 = {isObj2: true};
						obj1.obj1 = obj1;
						obj2.obj2 = obj2;
						return {
							one: {x: obj1},
							two: {y: obj2}
						};
					},
					outCjs: {
						'one.js': 'const a={isObj1:true};a.obj1=a;module.exports={x:a}',
						'two.js': 'const a={isObj2:true};a.obj2=a;module.exports={y:a}'
					},
					outEsm: {
						'one.js': 'const a={isObj1:true};a.obj1=a;export default{x:a}',
						'two.js': 'const a={isObj2:true};a.obj2=a;export default{y:a}'
					},
					outJs: {
						'one.js': '(()=>{const a={isObj1:true};a.obj1=a;return{x:a}})()',
						'two.js': '(()=>{const a={isObj2:true};a.obj2=a;return{y:a}})()'
					},
					validate({one, two}) {
						expect(one.x.obj1).toBe(one.x);
						expect(two.y.obj2).toBe(two.y);
					}
				});
			});

			describe('shared values split into separate files', () => {
				itSerializesEntriesEqual('where circular values exported directly', {
					in() {
						const shared = {isShared: true};
						shared.shared = shared;
						return {
							one: shared,
							two: shared
						};
					},
					outCjs: {
						'one.js': 'const a={isShared:true};a.shared=a;module.exports=a',
						'two.js': 'module.exports=require("./one.js")'
					},
					outEsm: {
						'one.js': 'const a={isShared:true};a.shared=a;export default a',
						'two.js': 'import a from"./one.js";export default a'
					},
					outJs: {
						'one.js': 'require("./chunk.VPBRAQOW.js")',
						'two.js': 'require("./chunk.VPBRAQOW.js")',
						'chunk.VPBRAQOW.js': 'const a={isShared:true};a.shared=a;module.exports=a'
					},
					validate({one, two}) {
						expect(one.shared).toBe(one);
						expect(two.shared).toBe(two);
					}
				});

				itSerializesEntriesEqual('where circular values nested independently', {
					in() {
						const shared = {isShared: true};
						shared.shared = shared;
						return {
							one: {x: shared},
							two: {y: shared}
						};
					},
					outCjs: {
						'one.js': 'module.exports={x:require("./chunk.VPBRAQOW.js")}',
						'two.js': 'module.exports={y:require("./chunk.VPBRAQOW.js")}',
						'chunk.VPBRAQOW.js': 'const a={isShared:true};a.shared=a;module.exports=a'
					},
					outEsm: {
						'one.js': 'import a from"./chunk.TPB6XMAE.js";export default{x:a}',
						'two.js': 'import a from"./chunk.TPB6XMAE.js";export default{y:a}',
						'chunk.TPB6XMAE.js': 'const a={isShared:true};a.shared=a;export default a'
					},
					outJs: {
						'one.js': '{x:require("./chunk.VPBRAQOW.js")}',
						'two.js': '{y:require("./chunk.VPBRAQOW.js")}',
						'chunk.VPBRAQOW.js': 'const a={isShared:true};a.shared=a;module.exports=a'
					},
					validate({one, two}) {
						expect(one.x.shared).toBe(one.x);
						expect(two.y).toBe(one.x);
					}
				});

				itSerializesEntriesEqual('where circular values nested in shared value', {
					in() {
						const circular = {isCircular: true};
						circular.circular = circular;
						const shared = {x: circular};
						return {
							one: shared,
							two: shared
						};
					},
					outCjs: {
						'one.js': 'const a={isCircular:true};a.circular=a;module.exports={x:a}',
						'two.js': 'module.exports=require("./one.js")'
					},
					outEsm: {
						'one.js': 'const a={isCircular:true};a.circular=a;export default{x:a}',
						'two.js': 'import a from"./one.js";export default a'
					},
					outJs: {
						'one.js': 'require("./chunk.Y7TSXZXM.js")',
						'two.js': 'require("./chunk.Y7TSXZXM.js")',
						'chunk.Y7TSXZXM.js': 'const a={isCircular:true};a.circular=a;module.exports={x:a}'
					},
					validate({one, two}) {
						expect(one.x.circular).toBe(one.x);
						expect(two).toBe(one);
					}
				});

				itSerializesEntriesEqual('where circular values nested in both', {
					in() {
						const circular = {isCircular: true};
						circular.circular = circular;
						const shared = {x: circular};
						return {
							one: {y: shared},
							two: {z: shared}
						};
					},
					outCjs: {
						'one.js': 'module.exports={y:require("./chunk.Y7TSXZXM.js")}',
						'two.js': 'module.exports={z:require("./chunk.Y7TSXZXM.js")}',
						'chunk.Y7TSXZXM.js': 'const a={isCircular:true};a.circular=a;module.exports={x:a}'
					},
					outEsm: {
						'one.js': 'import a from"./chunk.PHIYGN2F.js";export default{y:a}',
						'two.js': 'import a from"./chunk.PHIYGN2F.js";export default{z:a}',
						'chunk.PHIYGN2F.js': 'const a={isCircular:true};a.circular=a;export default{x:a}'
					},
					outJs: {
						'one.js': '{y:require("./chunk.Y7TSXZXM.js")}',
						'two.js': '{z:require("./chunk.Y7TSXZXM.js")}',
						'chunk.Y7TSXZXM.js': 'const a={isCircular:true};a.circular=a;module.exports={x:a}'
					},
					validate({one, two}) {
						expect(one.y.x.circular).toBe(one.y.x);
						expect(two.z).toBe(one.y);
					}
				});
			});

			describe('with 2-deep cycle', () => {
				itSerializesEntriesEqual('where circular value entered twice at same point', {
					in() {
						const top = {isTop: true},
							bottom = {isBottom: true, top};
						top.bottom = bottom;
						return {
							one: top,
							two: top
						};
					},
					outCjs: {
						'one.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=b',
						'two.js': 'module.exports=require("./one.js")'
					},
					outEsm: {
						'one.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;export default b',
						'two.js': 'import a from"./one.js";export default a'
					},
					outJs: {
						'one.js': 'require("./chunk.DKWSO3XU.js")',
						'two.js': 'require("./chunk.DKWSO3XU.js")',
						'chunk.DKWSO3XU.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=b'
					},
					validate({one, two}) {
						expect(one.bottom.top).toBe(one);
						expect(two).toBe(one);
					}
				});

				itSerializesEntriesEqual('where circular value entered at different points', {
					in() {
						const top = {isTop: true},
							bottom = {isBottom: true, top};
						top.bottom = bottom;
						return {
							one: top,
							two: bottom
						};
					},
					outCjs: {
						'one.js': 'module.exports=require("./chunk.PQ3Q7OQK.js")[1]',
						'two.js': 'module.exports=require("./chunk.PQ3Q7OQK.js")[0]',
						'chunk.PQ3Q7OQK.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=[a,b]'
					},
					outEsm: {
						'one.js': 'import a from"./chunk.ZXAZ4H3K.js";export default a[1]',
						'two.js': 'import a from"./chunk.ZXAZ4H3K.js";export default a[0]',
						'chunk.ZXAZ4H3K.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;export default[a,b]'
					},
					outJs: {
						'one.js': 'require("./chunk.PQ3Q7OQK.js")[1]',
						'two.js': 'require("./chunk.PQ3Q7OQK.js")[0]',
						'chunk.PQ3Q7OQK.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=[a,b]'
					},
					validate({one, two}) {
						expect(one.bottom.top).toBe(one);
						expect(two).toBe(one.bottom);
					}
				});
			});

			describe('with 3-deep cycle', () => {
				itSerializesEntriesEqual('where circular value entered at same point', {
					in() {
						const top = {isTop: true},
							middle = {isMiddle: true, top},
							bottom = {isBottom: true, middle};
						top.bottom = bottom;
						return {
							one: top,
							two: top,
							three: top
						};
					},
					outCjs: {
						'one.js': 'const a={isMiddle:true},b={isTop:true,bottom:{isBottom:true,middle:a}};a.top=b;module.exports=b',
						'two.js': 'module.exports=require("./one.js")',
						'three.js': 'module.exports=require("./one.js")'
					},
					outEsm: {
						'one.js': 'const a={isMiddle:true},b={isTop:true,bottom:{isBottom:true,middle:a}};a.top=b;export default b',
						'two.js': 'import a from"./one.js";export default a',
						'three.js': 'import a from"./one.js";export default a'
					},
					outJs: {
						'one.js': 'require("./chunk.RPYGU6B7.js")',
						'two.js': 'require("./chunk.RPYGU6B7.js")',
						'three.js': 'require("./chunk.RPYGU6B7.js")',
						'chunk.RPYGU6B7.js': 'const a={isMiddle:true},b={isTop:true,bottom:{isBottom:true,middle:a}};a.top=b;module.exports=b'
					},
					validate({one, two, three}) {
						expect(one.bottom.middle.top).toBe(one);
						expect(two).toBe(one);
						expect(three).toBe(one);
					}
				});

				describe('where circular value entered at different points', () => {
					itSerializesEntriesEqual('in ascending order', {
						in() {
							const top = {isTop: true},
								middle = {isMiddle: true, top},
								bottom = {isBottom: true, middle};
							top.bottom = bottom;
							return {
								one: top,
								two: middle,
								three: bottom
							};
						},
						outCjs: {
							'one.js': 'module.exports=require("./chunk.DWFBXCX3.js")[2]',
							'two.js': 'module.exports=require("./chunk.DWFBXCX3.js")[1]',
							'three.js': 'module.exports=require("./chunk.DWFBXCX3.js")[0]',
							'chunk.DWFBXCX3.js': 'const a={isMiddle:true},b={isBottom:true,middle:a},c={isTop:true,bottom:b};a.top=c;module.exports=[b,a,c]'
						},
						outEsm: {
							'one.js': 'import a from"./chunk.TYEP4GD4.js";export default a[2]',
							'two.js': 'import a from"./chunk.TYEP4GD4.js";export default a[1]',
							'three.js': 'import a from"./chunk.TYEP4GD4.js";export default a[0]',
							'chunk.TYEP4GD4.js': 'const a={isMiddle:true},b={isBottom:true,middle:a},c={isTop:true,bottom:b};a.top=c;export default[b,a,c]'
						},
						outJs: {
							'one.js': 'require("./chunk.DWFBXCX3.js")[2]',
							'two.js': 'require("./chunk.DWFBXCX3.js")[1]',
							'three.js': 'require("./chunk.DWFBXCX3.js")[0]',
							'chunk.DWFBXCX3.js': 'const a={isMiddle:true},b={isBottom:true,middle:a},c={isTop:true,bottom:b};a.top=c;module.exports=[b,a,c]'
						},
						validate({one, two, three}) {
							expect(one.bottom.middle.top).toBe(one);
							expect(two).toBe(one.bottom.middle);
							expect(three).toBe(one.bottom);
						}
					});

					itSerializesEntriesEqual('in descending order', {
						in() {
							const top = {isTop: true},
								middle = {isMiddle: true, top},
								bottom = {isBottom: true, middle};
							top.bottom = bottom;
							return {
								one: bottom,
								two: middle,
								three: top
							};
						},
						outCjs: {
							'one.js': 'module.exports=require("./chunk.OMZJSK6C.js")[2]',
							'two.js': 'module.exports=require("./chunk.OMZJSK6C.js")[0]',
							'three.js': 'module.exports=require("./chunk.OMZJSK6C.js")[1]',
							'chunk.OMZJSK6C.js': 'const a={isTop:true},b={isMiddle:true,top:a},c={isBottom:true,middle:b};a.bottom=c;module.exports=[b,a,c]'
						},
						outEsm: {
							'one.js': 'import a from"./chunk.OEVVLXJM.js";export default a[2]',
							'two.js': 'import a from"./chunk.OEVVLXJM.js";export default a[0]',
							'three.js': 'import a from"./chunk.OEVVLXJM.js";export default a[1]',
							'chunk.OEVVLXJM.js': 'const a={isTop:true},b={isMiddle:true,top:a},c={isBottom:true,middle:b};a.bottom=c;export default[b,a,c]'
						},
						outJs: {
							'one.js': 'require("./chunk.OMZJSK6C.js")[2]',
							'two.js': 'require("./chunk.OMZJSK6C.js")[0]',
							'three.js': 'require("./chunk.OMZJSK6C.js")[1]',
							'chunk.OMZJSK6C.js': 'const a={isTop:true},b={isMiddle:true,top:a},c={isBottom:true,middle:b};a.bottom=c;module.exports=[b,a,c]'
						},
						validate({one, two, three}) {
							expect(one.middle.top.bottom).toBe(one);
							expect(two).toBe(one.middle);
							expect(three).toBe(one.middle.top);
						}
					});
				});
			});

			describe('with 2 branched cycles', () => {
				itSerializesEntriesEqual('where circular value entered at same point', {
					in() {
						const top = {isTop: true},
							middle = {isMiddle: true, top},
							bottom1 = {isBottom1: true, middle},
							bottom2 = {isBottom2: true, middle};
						top.bottom1 = bottom1;
						top.bottom2 = bottom2;
						return {
							one: top,
							two: top
						};
					},
					outCjs: {
						'one.js': `
							const a={isMiddle:true},
								b={
									isTop:true,
									bottom1:{isBottom1:true,middle:a},
									bottom2:{isBottom2:true,middle:a}
								};
							a.top=b;
							module.exports=b
						`,
						'two.js': 'module.exports=require("./one.js")'
					},
					outEsm: {
						'one.js': `
							const a={isMiddle:true},
								b={
									isTop:true,
									bottom1:{isBottom1:true,middle:a},
									bottom2:{isBottom2:true,middle:a}
								};
							a.top=b;
							export default b
						`,
						'two.js': 'import a from"./one.js";export default a'
					},
					outJs: {
						'one.js': 'require("./chunk.EMMY53RD.js")',
						'two.js': 'require("./chunk.EMMY53RD.js")',
						'chunk.EMMY53RD.js': `
							const a={isMiddle:true},
								b={
									isTop:true,
									bottom1:{isBottom1:true,middle:a},
									bottom2:{isBottom2:true,middle:a}
								};
							a.top=b;
							module.exports=b
						`
					},
					validate({one, two}) {
						expect(one.bottom1.middle).toBe(one.bottom2.middle);
						expect(one.bottom1.middle.top).toBe(one);
						expect(two).toBe(one);
					}
				});

				describe('where circular value entered at different points', () => {
					itSerializesEntriesEqual('in ascending order', {
						in() {
							const top = {isTop: true},
								middle = {isMiddle: true, top},
								bottom1 = {isBottom1: true, middle},
								bottom2 = {isBottom2: true, middle};
							top.bottom1 = bottom1;
							top.bottom2 = bottom2;
							return {top, middle, bottom1, bottom2};
						},
						outCjs: {
							'top.js': 'module.exports=require("./chunk.GKKCO5DM.js")[3]',
							'middle.js': 'module.exports=require("./chunk.GKKCO5DM.js")[2]',
							'bottom1.js': 'module.exports=require("./chunk.GKKCO5DM.js")[0]',
							'bottom2.js': 'module.exports=require("./chunk.GKKCO5DM.js")[1]',
							'chunk.GKKCO5DM.js': `
								const a={isMiddle:true},
									b={isBottom1:true,middle:a},
									c={isBottom2:true,middle:a},
									d={isTop:true,bottom1:b,bottom2:c};
								a.top=d;
								module.exports=[b,c,a,d]
							`
						},
						outEsm: {
							'top.js': 'import a from"./chunk.ONH4ZMKF.js";export default a[3]',
							'middle.js': 'import a from"./chunk.ONH4ZMKF.js";export default a[2]',
							'bottom1.js': 'import a from"./chunk.ONH4ZMKF.js";export default a[0]',
							'bottom2.js': 'import a from"./chunk.ONH4ZMKF.js";export default a[1]',
							'chunk.ONH4ZMKF.js': `
								const a={isMiddle:true},
									b={isBottom1:true,middle:a},
									c={isBottom2:true,middle:a},
									d={isTop:true,bottom1:b,bottom2:c};
								a.top=d;
								export default[b,c,a,d]
							`
						},
						outJs: {
							'top.js': 'require("./chunk.GKKCO5DM.js")[3]',
							'middle.js': 'require("./chunk.GKKCO5DM.js")[2]',
							'bottom1.js': 'require("./chunk.GKKCO5DM.js")[0]',
							'bottom2.js': 'require("./chunk.GKKCO5DM.js")[1]',
							'chunk.GKKCO5DM.js': `
								const a={isMiddle:true},
									b={isBottom1:true,middle:a},
									c={isBottom2:true,middle:a},
									d={isTop:true,bottom1:b,bottom2:c};
								a.top=d;
								module.exports=[b,c,a,d]
							`
						},
						validate({top, middle, bottom1, bottom2}) {
							expect(top.bottom1.middle).toBe(top.bottom2.middle);
							expect(top.bottom1.middle.top).toBe(top);
							expect(middle).toBe(top.bottom1.middle);
							expect(bottom1).toBe(top.bottom1);
							expect(bottom2).toBe(top.bottom2);
						}
					});

					itSerializesEntriesEqual('in descending order with 1st branch first', {
						in() {
							const top = {isTop: true},
								middle = {isMiddle: true, top},
								bottom1 = {isBottom1: true, middle},
								bottom2 = {isBottom2: true, middle};
							top.bottom1 = bottom1;
							top.bottom2 = bottom2;
							return {bottom1, bottom2, middle, top};
						},
						outCjs: {
							'bottom1.js': 'module.exports=require("./chunk.6EKGYUCW.js")[3]',
							'bottom2.js': 'module.exports=require("./chunk.6EKGYUCW.js")[0]',
							'middle.js': 'module.exports=require("./chunk.6EKGYUCW.js")[1]',
							'top.js': 'module.exports=require("./chunk.6EKGYUCW.js")[2]',
							'chunk.6EKGYUCW.js': `
								const a={isBottom2:true},
									b={isTop:true,bottom1:void 0,bottom2:a},
									c={isMiddle:true,top:b},
									d={isBottom1:true,middle:c};
								b.bottom1=d;
								a.middle=c;
								module.exports=[a,c,b,d]
							`
						},
						outEsm: {
							'bottom1.js': 'import a from"./chunk.YNQRO5KD.js";export default a[3]',
							'bottom2.js': 'import a from"./chunk.YNQRO5KD.js";export default a[0]',
							'middle.js': 'import a from"./chunk.YNQRO5KD.js";export default a[1]',
							'top.js': 'import a from"./chunk.YNQRO5KD.js";export default a[2]',
							'chunk.YNQRO5KD.js': `
								const a={isBottom2:true},
									b={isTop:true,bottom1:void 0,bottom2:a},
									c={isMiddle:true,top:b},
									d={isBottom1:true,middle:c};
								b.bottom1=d;
								a.middle=c;
								export default[a,c,b,d]
							`
						},
						outJs: {
							'bottom1.js': 'require("./chunk.6EKGYUCW.js")[3]',
							'bottom2.js': 'require("./chunk.6EKGYUCW.js")[0]',
							'middle.js': 'require("./chunk.6EKGYUCW.js")[1]',
							'top.js': 'require("./chunk.6EKGYUCW.js")[2]',
							'chunk.6EKGYUCW.js': `
								const a={isBottom2:true},
									b={isTop:true,bottom1:void 0,bottom2:a},
									c={isMiddle:true,top:b},
									d={isBottom1:true,middle:c};
								b.bottom1=d;
								a.middle=c;
								module.exports=[a,c,b,d]
							`
						},
						validate({bottom1, bottom2, middle, top}) {
							expect(top.bottom1.middle).toBe(top.bottom2.middle);
							expect(top.bottom1.middle.top).toBe(top);
							expect(middle).toBe(top.bottom1.middle);
							expect(bottom1).toBe(top.bottom1);
							expect(bottom2).toBe(top.bottom2);
						}
					});

					itSerializesEntriesEqual('in descending order with 2nd branch first', {
						in() {
							const top = {isTop: true},
								middle = {isMiddle: true, top},
								bottom1 = {isBottom1: true, middle},
								bottom2 = {isBottom2: true, middle};
							top.bottom1 = bottom1;
							top.bottom2 = bottom2;
							return {bottom2, bottom1, middle, top};
						},
						outCjs: {
							'bottom2.js': 'module.exports=require("./chunk.I63HG4N5.js")[3]',
							'bottom1.js': 'module.exports=require("./chunk.I63HG4N5.js")[0]',
							'middle.js': 'module.exports=require("./chunk.I63HG4N5.js")[1]',
							'top.js': 'module.exports=require("./chunk.I63HG4N5.js")[2]',
							'chunk.I63HG4N5.js': `
								const a={isBottom1:true},
									b={isTop:true,bottom1:a},
									c={isMiddle:true,top:b},
									d={isBottom2:true,middle:c};
								b.bottom2=d;
								a.middle=c;
								module.exports=[a,c,b,d]
							`
						},
						outEsm: {
							'bottom2.js': 'import a from"./chunk.PODSWQTK.js";export default a[3]',
							'bottom1.js': 'import a from"./chunk.PODSWQTK.js";export default a[0]',
							'middle.js': 'import a from"./chunk.PODSWQTK.js";export default a[1]',
							'top.js': 'import a from"./chunk.PODSWQTK.js";export default a[2]',
							'chunk.PODSWQTK.js': `
								const a={isBottom1:true},
									b={isTop:true,bottom1:a},
									c={isMiddle:true,top:b},
									d={isBottom2:true,middle:c};
								b.bottom2=d;
								a.middle=c;
								export default[a,c,b,d]
							`
						},
						outJs: {
							'bottom2.js': 'require("./chunk.I63HG4N5.js")[3]',
							'bottom1.js': 'require("./chunk.I63HG4N5.js")[0]',
							'middle.js': 'require("./chunk.I63HG4N5.js")[1]',
							'top.js': 'require("./chunk.I63HG4N5.js")[2]',
							'chunk.I63HG4N5.js': `
								const a={isBottom1:true},
									b={isTop:true,bottom1:a},
									c={isMiddle:true,top:b},
									d={isBottom2:true,middle:c};
								b.bottom2=d;
								a.middle=c;
								module.exports=[a,c,b,d]
							`
						},
						validate({bottom2, bottom1, middle, top}) {
							expect(top.bottom1.middle).toBe(top.bottom2.middle);
							expect(top.bottom1.middle.top).toBe(top);
							expect(middle).toBe(top.bottom1.middle);
							expect(bottom1).toBe(top.bottom1);
							expect(bottom2).toBe(top.bottom2);
						}
					});

					itSerializesEntriesEqual('out of order with middle first', {
						in() {
							const top = {isTop: true},
								middle = {isMiddle: true, top},
								bottom1 = {isBottom1: true, middle},
								bottom2 = {isBottom2: true, middle};
							top.bottom1 = bottom1;
							top.bottom2 = bottom2;
							return {middle, top, bottom1, bottom2};
						},
						outCjs: {
							'middle.js': 'module.exports=require("./chunk.XXXRM7FO.js")[3]',
							'top.js': 'module.exports=require("./chunk.XXXRM7FO.js")[0]',
							'bottom1.js': 'module.exports=require("./chunk.XXXRM7FO.js")[1]',
							'bottom2.js': 'module.exports=require("./chunk.XXXRM7FO.js")[2]',
							'chunk.XXXRM7FO.js': `
								const a={isBottom1:true},
									b={isBottom2:true},
									c={isTop:true,bottom1:a,bottom2:b},
									d={isMiddle:true,top:c};
								a.middle=d;
								b.middle=d;
								module.exports=[c,a,b,d]
							`
						},
						outEsm: {
							'middle.js': 'import a from"./chunk.H7XWVEG4.js";export default a[3]',
							'top.js': 'import a from"./chunk.H7XWVEG4.js";export default a[0]',
							'bottom1.js': 'import a from"./chunk.H7XWVEG4.js";export default a[1]',
							'bottom2.js': 'import a from"./chunk.H7XWVEG4.js";export default a[2]',
							'chunk.H7XWVEG4.js': `
								const a={isBottom1:true},
									b={isBottom2:true},
									c={isTop:true,bottom1:a,bottom2:b},
									d={isMiddle:true,top:c};
								a.middle=d;
								b.middle=d;
								export default[c,a,b,d]
							`
						},
						outJs: {
							'middle.js': 'require("./chunk.XXXRM7FO.js")[3]',
							'top.js': 'require("./chunk.XXXRM7FO.js")[0]',
							'bottom1.js': 'require("./chunk.XXXRM7FO.js")[1]',
							'bottom2.js': 'require("./chunk.XXXRM7FO.js")[2]',
							'chunk.XXXRM7FO.js': `
								const a={isBottom1:true},
									b={isBottom2:true},
									c={isTop:true,bottom1:a,bottom2:b},
									d={isMiddle:true,top:c};
								a.middle=d;
								b.middle=d;
								module.exports=[c,a,b,d]
							`
						},
						validate({middle, top, bottom1, bottom2}) {
							expect(top.bottom1.middle).toBe(top.bottom2.middle);
							expect(top.bottom1.middle.top).toBe(top);
							expect(middle).toBe(top.bottom1.middle);
							expect(bottom1).toBe(top.bottom1);
							expect(bottom2).toBe(top.bottom2);
						}
					});
				});
			});

			describe('with intersecting branched cycles', () => {
				itSerializesEntriesEqual('entered at one point', {
					in() {
						const w = {isW: true},
							x = {isX: true, w},
							y = {isY: true, x},
							z = {isZ: true, w};
						x.y = y;
						w.y = y;
						y.z = z;
						return {
							one: {w},
							two: {w}
						};
					},
					outCjs: {
						'one.js': 'module.exports={w:require("./chunk.S2EFVP3I.js")}',
						'two.js': 'module.exports={w:require("./chunk.S2EFVP3I.js")}',
						'chunk.S2EFVP3I.js': 'const a={isX:true},b={isZ:true},c={isY:true,x:a,z:b},d={isW:true,y:c};a.w=d;a.y=c;b.w=d;module.exports=d'
					},
					outEsm: {
						'one.js': 'import a from"./chunk.A5KLO7AA.js";export default{w:a}',
						'two.js': 'import a from"./chunk.A5KLO7AA.js";export default{w:a}',
						'chunk.A5KLO7AA.js': 'const a={isX:true},b={isZ:true},c={isY:true,x:a,z:b},d={isW:true,y:c};a.w=d;a.y=c;b.w=d;export default d'
					},
					outJs: {
						'one.js': '{w:require("./chunk.S2EFVP3I.js")}',
						'two.js': '{w:require("./chunk.S2EFVP3I.js")}',
						'chunk.S2EFVP3I.js': 'const a={isX:true},b={isZ:true},c={isY:true,x:a,z:b},d={isW:true,y:c};a.w=d;a.y=c;b.w=d;module.exports=d'
					},
					validate({one, two}) {
						const {w} = one;
						expect(w.y.x.w).toBe(w);
						expect(w.y.z.w).toBe(w);
						expect(w.y.x.y).toBe(w.y);
						expect(two.w).toBe(w);
					}
				});

				itSerializesEntriesEqual('entered at multiple points', {
					in() {
						const w = {isW: true},
							x = {isX: true, w},
							y = {isY: true, x},
							z = {isZ: true, w};
						x.y = y;
						w.y = y;
						y.z = z;
						return {w, x, y, z};
					},
					outCjs: {
						'w.js': 'module.exports=require("./chunk.GMNORSPU.js")[3]',
						'x.js': 'module.exports=require("./chunk.GMNORSPU.js")[1]',
						'y.js': 'module.exports=require("./chunk.GMNORSPU.js")[0]',
						'z.js': 'module.exports=require("./chunk.GMNORSPU.js")[2]',
						'chunk.GMNORSPU.js': 'const a={isX:true},b={isZ:true},c={isY:true,x:a,z:b},d={isW:true,y:c};a.w=d;a.y=c;b.w=d;module.exports=[c,a,b,d]'
					},
					outEsm: {
						'w.js': 'import a from"./chunk.4MJPDDS3.js";export default a[3]',
						'x.js': 'import a from"./chunk.4MJPDDS3.js";export default a[1]',
						'y.js': 'import a from"./chunk.4MJPDDS3.js";export default a[0]',
						'z.js': 'import a from"./chunk.4MJPDDS3.js";export default a[2]',
						'chunk.4MJPDDS3.js': 'const a={isX:true},b={isZ:true},c={isY:true,x:a,z:b},d={isW:true,y:c};a.w=d;a.y=c;b.w=d;export default[c,a,b,d]'
					},
					outJs: {
						'w.js': 'require("./chunk.GMNORSPU.js")[3]',
						'x.js': 'require("./chunk.GMNORSPU.js")[1]',
						'y.js': 'require("./chunk.GMNORSPU.js")[0]',
						'z.js': 'require("./chunk.GMNORSPU.js")[2]',
						'chunk.GMNORSPU.js': 'const a={isX:true},b={isZ:true},c={isY:true,x:a,z:b},d={isW:true,y:c};a.w=d;a.y=c;b.w=d;module.exports=[c,a,b,d]'
					},
					validate({w, x, y, z}) {
						expect(w.y.x.w).toBe(w);
						expect(w.y.z.w).toBe(w);
						expect(w.y.x.y).toBe(w.y);
						expect(x).toBe(w.y.x);
						expect(y).toBe(w.y);
						expect(z).toBe(w.y.z);
					}
				});
			});
		});

		itSerializesEntriesEqual(
			'creates single import in each file for shared value where used more than once',
			{
				in() {
					const shared = {isShared: true};
					return {
						one: {x: shared, y: shared, z: shared},
						two: {e: shared, f: shared, g: shared}
					};
				},
				outCjs: {
					'one.js': 'const a=require("./chunk.7ANF66YZ.js");module.exports={x:a,y:a,z:a}',
					'two.js': 'const a=require("./chunk.7ANF66YZ.js");module.exports={e:a,f:a,g:a}',
					'chunk.7ANF66YZ.js': 'module.exports={isShared:true}'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.KOPFAARQ.js";export default{x:a,y:a,z:a}',
					'two.js': 'import a from"./chunk.KOPFAARQ.js";export default{e:a,f:a,g:a}',
					'chunk.KOPFAARQ.js': 'export default{isShared:true}'
				},
				outJs: {
					'one.js': '(()=>{const a=require("./chunk.7ANF66YZ.js");return{x:a,y:a,z:a}})()',
					'two.js': '(()=>{const a=require("./chunk.7ANF66YZ.js");return{e:a,f:a,g:a}})()',
					'chunk.7ANF66YZ.js': 'module.exports={isShared:true}'
				},
				validate({one, two}) {
					const shared = one.x;
					expect(shared).toEqual({isShared: true});
					expect(one.y).toBe(shared);
					expect(one.z).toBe(shared);
					expect(two.e).toBe(shared);
					expect(two.f).toBe(shared);
					expect(two.g).toBe(shared);
				}
			}
		);

		itSerializesEntriesEqual(
			'creates single var in each file for shared value where used more than once',
			{
				in() {
					const shared1 = {isShared1: true},
						shared2 = {isShared2: true};
					return {
						one: {x: shared1, y: shared1, z: shared2},
						two: {e: shared1, f: shared2, g: shared2}
					};
				},
				outCjs: {
					'one.js': 'const a=require("./chunk.TTKTTCEW.js"),b=a[0];module.exports={x:b,y:b,z:a[1]}',
					'two.js': 'const a=require("./chunk.TTKTTCEW.js"),b=a[1];module.exports={e:a[0],f:b,g:b}',
					'chunk.TTKTTCEW.js': 'module.exports=[{isShared1:true},{isShared2:true}]'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.MWEAKQFD.js";const b=a[0];export default{x:b,y:b,z:a[1]}',
					'two.js': 'import a from"./chunk.MWEAKQFD.js";const b=a[1];export default{e:a[0],f:b,g:b}',
					'chunk.MWEAKQFD.js': 'export default[{isShared1:true},{isShared2:true}]'
				},
				outJs: {
					'one.js': '(()=>{const a=require("./chunk.TTKTTCEW.js"),b=a[0];return{x:b,y:b,z:a[1]}})()',
					'two.js': '(()=>{const a=require("./chunk.TTKTTCEW.js"),b=a[1];return{e:a[0],f:b,g:b}})()',
					'chunk.TTKTTCEW.js': 'module.exports=[{isShared1:true},{isShared2:true}]'
				},
				validate({one, two}) {
					const shared1 = one.x;
					const shared2 = one.z;
					expect(shared1).toEqual({isShared1: true});
					expect(shared2).toEqual({isShared2: true});
					expect(one.y).toBe(shared1);
					expect(two.e).toBe(shared1);
					expect(two.f).toBe(shared2);
					expect(two.g).toBe(shared2);
				}
			}
		);

		itSerializesEntriesEqual('creates unique shared chunk filenames if chunks have same content', {
			in() {
				const shared1 = {isShared: true},
					shared2 = {isShared: true},
					shared3 = {isShared: true};
				return {
					one: {x: shared1},
					two: {x: shared1},
					three: {x: shared2},
					four: {x: shared2},
					five: {x: shared3},
					six: {x: shared3}
				};
			},
			outCjs: {
				'one.js': 'module.exports={x:require("./chunk.BVVQNWXW.js")}',
				'two.js': 'module.exports={x:require("./chunk.BVVQNWXW.js")}',
				'three.js': 'module.exports={x:require("./chunk.VSF42ZCA.js")}',
				'four.js': 'module.exports={x:require("./chunk.VSF42ZCA.js")}',
				'five.js': 'module.exports={x:require("./chunk.7ANF66YZ.js")}',
				'six.js': 'module.exports={x:require("./chunk.7ANF66YZ.js")}',
				'chunk.BVVQNWXW.js': 'module.exports={isShared:true}',
				'chunk.VSF42ZCA.js': 'module.exports={isShared:true}',
				'chunk.7ANF66YZ.js': 'module.exports={isShared:true}'
			},
			outEsm: {
				'one.js': 'import a from"./chunk.QGMT774W.js";export default{x:a}',
				'two.js': 'import a from"./chunk.QGMT774W.js";export default{x:a}',
				'three.js': 'import a from"./chunk.LG3B3BIH.js";export default{x:a}',
				'four.js': 'import a from"./chunk.LG3B3BIH.js";export default{x:a}',
				'five.js': 'import a from"./chunk.KOPFAARQ.js";export default{x:a}',
				'six.js': 'import a from"./chunk.KOPFAARQ.js";export default{x:a}',
				'chunk.QGMT774W.js': 'export default{isShared:true}',
				'chunk.LG3B3BIH.js': 'export default{isShared:true}',
				'chunk.KOPFAARQ.js': 'export default{isShared:true}'
			},
			outJs: {
				'one.js': '{x:require("./chunk.BVVQNWXW.js")}',
				'two.js': '{x:require("./chunk.BVVQNWXW.js")}',
				'three.js': '{x:require("./chunk.VSF42ZCA.js")}',
				'four.js': '{x:require("./chunk.VSF42ZCA.js")}',
				'five.js': '{x:require("./chunk.7ANF66YZ.js")}',
				'six.js': '{x:require("./chunk.7ANF66YZ.js")}',
				'chunk.BVVQNWXW.js': 'module.exports={isShared:true}',
				'chunk.VSF42ZCA.js': 'module.exports={isShared:true}',
				'chunk.7ANF66YZ.js': 'module.exports={isShared:true}'
			},
			validate({one, two, three, four, five, six}) {
				expect(two.x).toBe(one.x);
				expect(four.x).toBe(three.x);
				expect(six.x).toBe(five.x);
				expect(one.x).not.toBe(three.x);
				expect(one.x).not.toBe(five.x);
				expect(three.x).not.toBe(five.x);
			}
		});

		describe('names import vars same as original var', () => {
			itSerializesEntries('imports from common file with single export', {
				in() {
					function shared() {}
					return {
						one: {shared},
						two: {shared}
					};
				},
				minify: true,
				mangle: false,
				inline: false,
				validateOutput(entries, {format, outputJs}) {
					expect(mapValues(outputJs, stripSourceMapComment)).toEqual({
						cjs: {
							'one.js': 'const shared=require("./chunk.AFEP3AX6.js"),one={shared};module.exports=one',
							'two.js': 'const shared=require("./chunk.AFEP3AX6.js"),two={shared};module.exports=two',
							'chunk.AFEP3AX6.js': 'const shared=function shared(){};module.exports=shared'
						},
						esm: {
							'one.js': 'import shared from"./chunk.KST74VJL.js";const one={shared};export default one',
							'two.js': 'import shared from"./chunk.KST74VJL.js";const two={shared};export default two',
							'chunk.KST74VJL.js': 'const shared=function shared(){};export default shared'
						},
						js: {
							'one.js': '(()=>{const shared=require("./chunk.AFEP3AX6.js"),one={shared};return one})()',
							'two.js': '(()=>{const shared=require("./chunk.AFEP3AX6.js"),two={shared};return two})()',
							'chunk.AFEP3AX6.js': 'const shared=function shared(){};module.exports=shared'
						}
					}[format]);
				}
			});

			itSerializesEntries('imports from common file with multiple exports', {
				in() {
					function shared1() {}
					function shared2() {}
					return {
						one: {shared1, shared2},
						two: {shared1, shared2}
					};
				},
				minify: true,
				mangle: false,
				inline: false,
				validateOutput(entries, {format, outputJs}) {
					expect(mapValues(outputJs, stripSourceMapComment)).toEqual({
						cjs: {
							'one.js': 'const shared1_shared2=require("./chunk.TCG6QM4J.js"),shared1=shared1_shared2[0],shared2=shared1_shared2[1],one={shared1,shared2};module.exports=one',
							'two.js': 'const shared1_shared2=require("./chunk.TCG6QM4J.js"),shared1=shared1_shared2[0],shared2=shared1_shared2[1],two={shared1,shared2};module.exports=two',
							'chunk.TCG6QM4J.js': 'const shared1=function shared1(){},shared2=function shared2(){},shared1_shared2=[shared1,shared2];module.exports=shared1_shared2'
						},
						esm: {
							'one.js': 'import shared1_shared2 from"./chunk.VSFPYWJY.js";const shared1=shared1_shared2[0],shared2=shared1_shared2[1],one={shared1,shared2};export default one',
							'two.js': 'import shared1_shared2 from"./chunk.VSFPYWJY.js";const shared1=shared1_shared2[0],shared2=shared1_shared2[1],two={shared1,shared2};export default two',
							'chunk.VSFPYWJY.js': 'const shared1=function shared1(){},shared2=function shared2(){},shared1_shared2=[shared1,shared2];export default shared1_shared2'
						},
						js: {
							'one.js': '(()=>{const shared1_shared2=require("./chunk.TCG6QM4J.js"),shared1=shared1_shared2[0],shared2=shared1_shared2[1],one={shared1,shared2};return one})()',
							'two.js': '(()=>{const shared1_shared2=require("./chunk.TCG6QM4J.js"),shared1=shared1_shared2[0],shared2=shared1_shared2[1],two={shared1,shared2};return two})()',
							'chunk.TCG6QM4J.js': 'const shared1=function shared1(){},shared2=function shared2(){},shared1_shared2=[shared1,shared2];module.exports=shared1_shared2'
						}
					}[format]);
				}
			});
		});

		describe('`exec` option', () => {
			it('executes exports in entry points', () => {
				expect(
					serializeEntries(
						{
							one: (0, () => console.log('x')), // eslint-disable-line no-console
							two: (0, () => console.log('y')) // eslint-disable-line no-console
						},
						{exec: true, format: 'esm'}
					)
				).toEqual([
					{filename: 'one.js', content: 'console.log("x")'},
					{filename: 'two.js', content: 'console.log("y")'}
				]);
			});

			it('does not execute exports in shared files', () => {
				function outer(ext) {
					return () => console.log(ext); // eslint-disable-line no-console
				}

				expect(
					serializeEntries(
						{
							one: outer('x'),
							two: outer('y')
						},
						{exec: true, format: 'esm'}
					)
				).toEqual([
					{filename: 'one.js', content: 'import a from"./chunk.U6AMOJ2A.js";a("x")()'},
					{filename: 'two.js', content: 'import a from"./chunk.U6AMOJ2A.js";a("y")()'},
					{filename: 'chunk.U6AMOJ2A.js', content: 'export default(a=>()=>console.log(a))'}
				]);
			});

			describe('creates dedicated entry files where export of entries is shared', () => {
				it('exported directly by both files', () => {
					const shared = (0, () => console.log('shared')); // eslint-disable-line no-console

					expect(
						serializeEntries(
							{
								one: shared,
								two: shared
							},
							{exec: true, format: 'esm'}
						)
					).toEqual([
						{filename: 'one.js', content: 'import a from"./chunk.BV7UVVU7.js";a()'},
						{filename: 'two.js', content: 'import a from"./chunk.BV7UVVU7.js";a()'},
						{filename: 'chunk.BV7UVVU7.js', content: 'export default(()=>console.log("shared"))'}
					]);
				});

				it('exported indirectly by 1st file', () => {
					const shared = (0, () => console.log('shared')); // eslint-disable-line no-console

					expect(
						serializeEntries(
							{
								one: (0, () => {
									shared();
									console.log('one'); // eslint-disable-line no-console
								}),
								two: shared
							},
							{exec: true, format: 'esm'}
						)
					).toEqual([
						{
							filename: 'one.js',
							content: 'import a from"./chunk.BV7UVVU7.js";(a=>()=>{a();console.log("one")})(a)()'
						},
						{filename: 'two.js', content: 'import a from"./chunk.BV7UVVU7.js";a()'},
						{filename: 'chunk.BV7UVVU7.js', content: 'export default(()=>console.log("shared"))'}
					]);
				});

				it('exported indirectly by 2nd file', () => {
					const shared = (0, () => console.log('shared')); // eslint-disable-line no-console

					expect(
						serializeEntries(
							{
								one: shared,
								two: (0, () => {
									shared();
									console.log('two'); // eslint-disable-line no-console
								})
							},
							{exec: true, format: 'esm'}
						)
					).toEqual([
						{filename: 'one.js', content: 'import a from"./chunk.BV7UVVU7.js";a()'},
						{
							filename: 'two.js',
							content: 'import a from"./chunk.BV7UVVU7.js";(a=>()=>{a();console.log("two")})(a)()'
						},
						{filename: 'chunk.BV7UVVU7.js', content: 'export default(()=>console.log("shared"))'}
					]);
				});

				it('exported indirectly by both files', () => {
					const shared = (0, () => console.log('shared')); // eslint-disable-line no-console

					expect(
						serializeEntries(
							{
								one: (0, () => {
									shared();
									console.log('one'); // eslint-disable-line no-console
								}),
								two: (0, () => {
									shared();
									console.log('two'); // eslint-disable-line no-console
								})
							},
							{exec: true, format: 'esm'}
						)
					).toEqual([
						{filename: 'one.js', content: 'import a from"./chunk.2XK6FMCP.js";a[0]()'},
						{filename: 'two.js', content: 'import a from"./chunk.2XK6FMCP.js";a[1]()'},
						{
							filename: 'chunk.2XK6FMCP.js',
							content: stripLineBreaks(`
								export default(
									a=>[
										()=>{a();console.log("one")},
										()=>{a();console.log("two")}
									]
								)(
									()=>console.log("shared")
								)
							`)
						}
					]);
				});
			});
		});

		it('`ext` option alters shared file filenames', () => {
			const shared = {isShared: true};
			expect(
				serializeEntries(
					{one: {shared}, two: {shared}},
					{ext: 'mjs', format: 'esm'}
				)
			).toEqual([
				{filename: 'one.mjs', content: 'import a from"./chunk.HW2BJAJH.mjs";export default{shared:a}'},
				{filename: 'two.mjs', content: 'import a from"./chunk.HW2BJAJH.mjs";export default{shared:a}'},
				{filename: 'chunk.HW2BJAJH.mjs', content: 'export default{isShared:true}'}
			]);
		});

		it('source maps alter hashes in filenames', () => {
			const shared = {isShared: true},
				entries = {one: {shared}, two: {shared}};
			expect(serializeEntries(entries)[2].filename).toBe('chunk.OE3HUVJ2.js');
			expect(serializeEntries(entries, {sourceMaps: 'inline'})[2].filename).toBe('chunk.ZNSPQDJA.js');
			expect(serializeEntries(entries, {sourceMaps: true})[4].filename).toBe('chunk.7ANF66YZ.js');
		});

		describe('source maps use correct relative paths', () => {
			const testFilename = basename(__filename);
			describe('with no slashes in names', () => {
				it('output in same dir as source', () => {
					const files = serializeEntries({
						one: [() => 1, split(() => 2)]
					}, {sourceMaps: true, format: 'cjs', outputDir: __dirname});

					expect(files).toEqual([
						{
							filename: 'one.js',
							content: 'module.exports=[()=>1,require("./chunk.3OES3VXY.js")]\n//# sourceMappingURL=one.js.map'
						},
						{filename: 'one.js.map', content: expect.stringContaining('{"version":3,')},
						{
							filename: 'chunk.3OES3VXY.js',
							content: 'module.exports=()=>2\n//# sourceMappingURL=chunk.3OES3VXY.js.map'
						},
						{filename: 'chunk.3OES3VXY.js.map', content: expect.stringContaining('{"version":3,')}
					]);
					expect(JSON.parse(files[1].content).sources).toEqual([`./${testFilename}`]);
					expect(JSON.parse(files[3].content).sources).toEqual([`./${testFilename}`]);
				});

				it('output in dir below source', () => {
					const files = serializeEntries({
						one: [() => 1, split(() => 2)]
					}, {sourceMaps: true, format: 'cjs', outputDir: pathJoin(__dirname, 'build')});

					expect(files).toEqual([
						{
							filename: 'one.js',
							content: 'module.exports=[()=>1,require("./chunk.3OES3VXY.js")]\n//# sourceMappingURL=one.js.map'
						},
						{filename: 'one.js.map', content: expect.stringContaining('{"version":3,')},
						{
							filename: 'chunk.3OES3VXY.js',
							content: 'module.exports=()=>2\n//# sourceMappingURL=chunk.3OES3VXY.js.map'
						},
						{filename: 'chunk.3OES3VXY.js.map', content: expect.stringContaining('{"version":3,')}
					]);
					expect(JSON.parse(files[1].content).sources).toEqual([`../${testFilename}`]);
					expect(JSON.parse(files[3].content).sources).toEqual([`../${testFilename}`]);
				});

				it('output in dir above source', () => {
					const files = serializeEntries({
						one: [() => 1, split(() => 2)]
					}, {sourceMaps: true, format: 'cjs', outputDir: pathJoin(__dirname, '..')});

					expect(files).toEqual([
						{
							filename: 'one.js',
							content: 'module.exports=[()=>1,require("./chunk.3OES3VXY.js")]\n//# sourceMappingURL=one.js.map'
						},
						{filename: 'one.js.map', content: expect.stringContaining('{"version":3,')},
						{
							filename: 'chunk.3OES3VXY.js',
							content: 'module.exports=()=>2\n//# sourceMappingURL=chunk.3OES3VXY.js.map'
						},
						{filename: 'chunk.3OES3VXY.js.map', content: expect.stringContaining('{"version":3,')}
					]);
					expect(JSON.parse(files[1].content).sources).toEqual([`./test/${testFilename}`]);
					expect(JSON.parse(files[3].content).sources).toEqual([`./test/${testFilename}`]);
				});

				it('output in dir beside source', () => {
					const files = serializeEntries({
						one: [() => 1, split(() => 2)]
					}, {sourceMaps: true, format: 'cjs', outputDir: pathJoin(__dirname, '../build')});

					expect(files).toEqual([
						{
							filename: 'one.js',
							content: 'module.exports=[()=>1,require("./chunk.3OES3VXY.js")]\n//# sourceMappingURL=one.js.map'
						},
						{filename: 'one.js.map', content: expect.stringContaining('{"version":3,')},
						{
							filename: 'chunk.3OES3VXY.js',
							content: 'module.exports=()=>2\n//# sourceMappingURL=chunk.3OES3VXY.js.map'
						},
						{filename: 'chunk.3OES3VXY.js.map', content: expect.stringContaining('{"version":3,')}
					]);
					expect(JSON.parse(files[1].content).sources).toEqual([`../test/${testFilename}`]);
					expect(JSON.parse(files[3].content).sources).toEqual([`../test/${testFilename}`]);
				});
			});

			describe('with slashes in names', () => {
				it('output in same dir as source', () => {
					const files = serializeEntries({
						'sub/one': [() => 1, split(() => 2, 'sub2/split')]
					}, {sourceMaps: true, format: 'cjs', outputDir: __dirname});

					expect(files).toEqual([
						{
							filename: 'sub/one.js',
							content: 'module.exports=[()=>1,require("../sub2/split.js")]\n//# sourceMappingURL=one.js.map'
						},
						{filename: 'sub/one.js.map', content: expect.stringContaining('{"version":3,')},
						{
							filename: 'sub2/split.js',
							content: 'module.exports=()=>2\n//# sourceMappingURL=split.js.map'
						},
						{filename: 'sub2/split.js.map', content: expect.stringContaining('{"version":3,')}
					]);
					expect(JSON.parse(files[1].content).sources).toEqual([`../${testFilename}`]);
					expect(JSON.parse(files[3].content).sources).toEqual([`../${testFilename}`]);
				});

				it('output in dir below source', () => {
					const files = serializeEntries({
						'sub/one': [() => 1, split(() => 2, 'sub2/split')]
					}, {sourceMaps: true, format: 'cjs', outputDir: pathJoin(__dirname, 'build')});

					expect(files).toEqual([
						{
							filename: 'sub/one.js',
							content: 'module.exports=[()=>1,require("../sub2/split.js")]\n//# sourceMappingURL=one.js.map'
						},
						{filename: 'sub/one.js.map', content: expect.stringContaining('{"version":3,')},
						{
							filename: 'sub2/split.js',
							content: 'module.exports=()=>2\n//# sourceMappingURL=split.js.map'
						},
						{filename: 'sub2/split.js.map', content: expect.stringContaining('{"version":3,')}
					]);
					expect(JSON.parse(files[1].content).sources).toEqual([`../../${testFilename}`]);
					expect(JSON.parse(files[3].content).sources).toEqual([`../../${testFilename}`]);
				});

				it('output in dir above source', () => {
					const files = serializeEntries({
						'sub/one': [() => 1, split(() => 2, 'sub2/split')]
					}, {sourceMaps: true, format: 'cjs', outputDir: pathJoin(__dirname, '..')});

					expect(files).toEqual([
						{
							filename: 'sub/one.js',
							content: 'module.exports=[()=>1,require("../sub2/split.js")]\n//# sourceMappingURL=one.js.map'
						},
						{filename: 'sub/one.js.map', content: expect.stringContaining('{"version":3,')},
						{
							filename: 'sub2/split.js',
							content: 'module.exports=()=>2\n//# sourceMappingURL=split.js.map'
						},
						{filename: 'sub2/split.js.map', content: expect.stringContaining('{"version":3,')}
					]);
					expect(JSON.parse(files[1].content).sources).toEqual([`../test/${testFilename}`]);
					expect(JSON.parse(files[3].content).sources).toEqual([`../test/${testFilename}`]);
				});

				it('output in dir beside source', () => {
					const files = serializeEntries({
						'sub/one': [() => 1, split(() => 2, 'sub2/split')]
					}, {sourceMaps: true, format: 'cjs', outputDir: pathJoin(__dirname, '../build')});

					expect(files).toEqual([
						{
							filename: 'sub/one.js',
							content: 'module.exports=[()=>1,require("../sub2/split.js")]\n//# sourceMappingURL=one.js.map'
						},
						{filename: 'sub/one.js.map', content: expect.stringContaining('{"version":3,')},
						{
							filename: 'sub2/split.js',
							content: 'module.exports=()=>2\n//# sourceMappingURL=split.js.map'
						},
						{filename: 'sub2/split.js.map', content: expect.stringContaining('{"version":3,')}
					]);
					expect(JSON.parse(files[1].content).sources).toEqual([`../../test/${testFilename}`]);
					expect(JSON.parse(files[3].content).sources).toEqual([`../../test/${testFilename}`]);
				});
			});
		});
	});

	describe('split', () => {
		beforeEach(resetSplitPoints);

		describe('splits value into separate file', () => {
			itSerializesEntriesEqual('with no name argument', {
				in() {
					return {
						one: split({x: 1})
					};
				},
				outCjs: {
					'one.js': 'module.exports=require("./chunk.QEIVLBZW.js")',
					'chunk.QEIVLBZW.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.UQMAZ4OK.js";export default a',
					'chunk.UQMAZ4OK.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': 'require("./chunk.QEIVLBZW.js")',
					'chunk.QEIVLBZW.js': 'module.exports={x:1}'
				}
			});

			itSerializesEntriesEqual('with name argument', {
				in() {
					return {
						one: split({x: 1}, 'split')
					};
				},
				outCjs: {
					'one.js': 'module.exports=require("./split.js")',
					'split.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'import a from"./split.js";export default a',
					'split.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': 'require("./split.js")',
					'split.js': 'module.exports={x:1}'
				}
			});

			itSerializesEntriesEqual('does not include proxy var if `inline` option off', {
				in() {
					return {
						one: split({x: 1}, 'split')
					};
				},
				minify: true,
				mangle: false,
				inline: false,
				validateOutput(obj, {format, outputJs}) {
					expect(mapValues(outputJs, stripSourceMapComment)).toEqual({
						cjs: {
							'one.js': 'const one=require("./split.js");module.exports=one',
							'split.js': 'const one={x:1};module.exports=one'
						},
						esm: {
							'one.js': 'import one from"./split.js";export default one',
							'split.js': 'const one={x:1};export default one'
						},
						js: {
							'one.js': '(()=>{const one=require("./split.js");return one})()',
							'split.js': 'const one={x:1};module.exports=one'
						}
					}[format]);
				}
			});
		});

		itSerializesEntriesEqual('ignores unused splits for file naming', {
			in() {
				split({y: 2}, 'split');
				splitAsync({z: 3}, 'split');
				return {
					one: split({x: 1}, 'split')
				};
			},
			outCjs: {
				'one.js': 'module.exports=require("./split.js")',
				'split.js': 'module.exports={x:1}'
			},
			outEsm: {
				'one.js': 'import a from"./split.js";export default a',
				'split.js': 'export default{x:1}'
			},
			outJs: {
				'one.js': 'require("./split.js")',
				'split.js': 'module.exports={x:1}'
			}
		});

		describe('splits split point into multiple files', () => {
			itSerializesEntriesEqual('when parts exported directly', {
				in() {
					const shared = split({
						a: {x: 1},
						b: {y: 2}
					}, 'split');
					return {
						one: shared.a,
						two: shared.b
					};
				},
				outCjs: {
					'one.js': 'module.exports=require("./chunk.QEIVLBZW.js")',
					'two.js': 'module.exports=require("./chunk.DM4GUZG2.js")',
					'chunk.QEIVLBZW.js': 'module.exports={x:1}',
					'chunk.DM4GUZG2.js': 'module.exports={y:2}'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.UQMAZ4OK.js";export default a',
					'two.js': 'import a from"./chunk.NYZZMNUQ.js";export default a',
					'chunk.UQMAZ4OK.js': 'export default{x:1}',
					'chunk.NYZZMNUQ.js': 'export default{y:2}'
				},
				outJs: {
					'one.js': 'require("./chunk.QEIVLBZW.js")',
					'two.js': 'require("./chunk.DM4GUZG2.js")',
					'chunk.QEIVLBZW.js': 'module.exports={x:1}',
					'chunk.DM4GUZG2.js': 'module.exports={y:2}'
				}
			});

			itSerializesEntriesEqual('when parts nested in objects', {
				in() {
					const shared = split({
						a: {x: 1},
						b: {y: 2}
					}, 'split');
					return {
						one: {a: shared.a},
						two: {b: shared.b}
					};
				},
				outCjs: {
					'one.js': 'module.exports={a:require("./chunk.QEIVLBZW.js")}',
					'two.js': 'module.exports={b:require("./chunk.DM4GUZG2.js")}',
					'chunk.QEIVLBZW.js': 'module.exports={x:1}',
					'chunk.DM4GUZG2.js': 'module.exports={y:2}'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.UQMAZ4OK.js";export default{a}',
					'two.js': 'import a from"./chunk.NYZZMNUQ.js";export default{b:a}',
					'chunk.UQMAZ4OK.js': 'export default{x:1}',
					'chunk.NYZZMNUQ.js': 'export default{y:2}'
				},
				outJs: {
					'one.js': '{a:require("./chunk.QEIVLBZW.js")}',
					'two.js': '{b:require("./chunk.DM4GUZG2.js")}',
					'chunk.QEIVLBZW.js': 'module.exports={x:1}',
					'chunk.DM4GUZG2.js': 'module.exports={y:2}'
				}
			});
		});

		itSerializesEntriesEqual('does not cause output of unused parts of split object', {
			in() {
				const shared = split({
					a: {aa: {x: 1}},
					b: {bb: {y: 2}}
				}, 'split');
				return {
					one: shared.a.aa
				};
			},
			outCjs: {
				'one.js': 'module.exports=require("./chunk.QEIVLBZW.js")',
				'chunk.QEIVLBZW.js': 'module.exports={x:1}'
			},
			outEsm: {
				'one.js': 'import a from"./chunk.UQMAZ4OK.js";export default a',
				'chunk.UQMAZ4OK.js': 'export default{x:1}'
			},
			outJs: {
				'one.js': 'require("./chunk.QEIVLBZW.js")',
				'chunk.QEIVLBZW.js': 'module.exports={x:1}'
			}
		});

		describe('circular values', () => {
			itSerializesEntriesEqual('exported directly', {
				in() {
					const top = {isTop: true},
						bottom = {isBottom: true, top};
					top.bottom = bottom;
					split(bottom, 'bottom');
					return {
						one: top
					};
				},
				outCjs: {
					'one.js': 'module.exports=require("./chunk.DKWSO3XU.js")',
					'chunk.DKWSO3XU.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=b'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.HKMXWHSI.js";export default a',
					'chunk.HKMXWHSI.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;export default b'
				},
				outJs: {
					'one.js': 'require("./chunk.DKWSO3XU.js")',
					'chunk.DKWSO3XU.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=b'
				},
				validate({one}) {
					expect(one.bottom.top).toBe(one);
				}
			});

			itSerializesEntriesEqual('nested in value', {
				in() {
					const top = {isTop: true},
						bottom = {isBottom: true, top};
					top.bottom = bottom;
					split(bottom, 'bottom');
					return {
						one: {x: top}
					};
				},
				outCjs: {
					'one.js': 'module.exports={x:require("./chunk.DKWSO3XU.js")}',
					'chunk.DKWSO3XU.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=b'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.HKMXWHSI.js";export default{x:a}',
					'chunk.HKMXWHSI.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;export default b'
				},
				outJs: {
					'one.js': '{x:require("./chunk.DKWSO3XU.js")}',
					'chunk.DKWSO3XU.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=b'
				},
				validate({one}) {
					const top = one.x;
					expect(top.bottom.top).toBe(top);
				}
			});

			itSerializesEntriesEqual('nested within split', {
				in() {
					const top = {isTop: true},
						bottom = {isBottom: true, top};
					top.bottom = bottom;
					split({split: {bottom}}, 'split');
					return {
						one: {x: top}
					};
				},
				outCjs: {
					'one.js': 'module.exports={x:require("./chunk.DKWSO3XU.js")}',
					'chunk.DKWSO3XU.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=b'
				},
				outEsm: {
					'one.js': 'import a from"./chunk.HKMXWHSI.js";export default{x:a}',
					'chunk.HKMXWHSI.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;export default b'
				},
				outJs: {
					'one.js': '{x:require("./chunk.DKWSO3XU.js")}',
					'chunk.DKWSO3XU.js': 'const a={isBottom:true},b={isTop:true,bottom:a};a.top=b;module.exports=b'
				},
				validate({one}) {
					const top = one.x;
					expect(top.bottom.top).toBe(top);
				}
			});
		});

		itSerializesEntriesEqual('handles nested splits', {
			in() {
				const obj1 = split({isObj1: true}, 'split1');
				const obj2 = split({isObj2: true, obj1}, 'split2');
				return {one: obj2};
			},
			outCjs: {
				'one.js': 'module.exports=require("./split2.js")',
				'split2.js': 'module.exports={isObj2:true,obj1:require("./split1.js")}',
				'split1.js': 'module.exports={isObj1:true}'
			},
			outEsm: {
				'one.js': 'import a from"./split2.js";export default a',
				'split2.js': 'import a from"./split1.js";export default{isObj2:true,obj1:a}',
				'split1.js': 'export default{isObj1:true}'
			},
			outJs: {
				'one.js': 'require("./split2.js")',
				'split2.js': 'module.exports={isObj2:true,obj1:require("./split1.js")}',
				'split1.js': 'module.exports={isObj1:true}'
			}
		});

		it('`ext` option alters split file filenames', () => {
			expect(
				serializeEntries(
					{
						one: split({isSplit: true})
					},
					{ext: 'mjs', format: 'esm'}
				)
			).toEqual([
				{filename: 'one.mjs', content: 'import a from"./chunk.P4XPXXFO.mjs";export default a'},
				{filename: 'chunk.P4XPXXFO.mjs', content: 'export default{isSplit:true}'}
			]);
		});
	});

	describe('splitAsync', () => {
		beforeEach(resetSplitPoints);

		describe('splits value into separate file and imports it', () => {
			itSerializesEntries('with no name argument', {
				in: () => ({
					one: splitAsync({x: 1})
				}),
				outCjs: {
					'one.js': 'module.exports=()=>import("./chunk.QEIVLBZW.js")',
					'chunk.QEIVLBZW.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'export default(()=>import("./chunk.UQMAZ4OK.js"))',
					'chunk.UQMAZ4OK.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': '()=>import("./chunk.QEIVLBZW.js")',
					'chunk.QEIVLBZW.js': 'module.exports={x:1}'
				},
				async validate({one}) {
					expect(one).toBeFunction();
					await expectToResolveToModuleWithDefaultExportEqualling(one(), {x: 1});
				}
			});

			itSerializesEntries('with name argument', {
				in: () => ({
					one: splitAsync({x: 1}, 'imported')
				}),
				outCjs: {
					'one.js': 'module.exports=()=>import("./imported.js")',
					'imported.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'export default(()=>import("./imported.js"))',
					'imported.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': '()=>import("./imported.js")',
					'imported.js': 'module.exports={x:1}'
				},
				async validate({one}) {
					expect(one).toBeFunction();
					await expectToResolveToModuleWithDefaultExportEqualling(one(), {x: 1});
				}
			});

			describe('with slashes in filenames', () => {
				itSerializesEntries('in entry point with unnamed split point', {
					in: () => ({
						'sub/subSub/one': splitAsync({x: 1})
					}),
					outCjs: {
						'sub/subSub/one.js': 'module.exports=()=>import("../../chunk.QEIVLBZW.js")',
						'chunk.QEIVLBZW.js': 'module.exports={x:1}'
					},
					outEsm: {
						'sub/subSub/one.js': 'export default(()=>import("../../chunk.UQMAZ4OK.js"))',
						'chunk.UQMAZ4OK.js': 'export default{x:1}'
					},
					outJs: {
						'sub/subSub/one.js': '()=>import("../../chunk.QEIVLBZW.js")',
						'chunk.QEIVLBZW.js': 'module.exports={x:1}'
					},
					async validate({'sub/subSub/one': one}) {
						expect(one).toBeFunction();
						await expectToResolveToModuleWithDefaultExportEqualling(one(), {x: 1});
					}
				});

				itSerializesEntries('in entry point with named split point', {
					in: () => ({
						'sub/subSub/one': splitAsync({x: 1}, 'imported')
					}),
					outCjs: {
						'sub/subSub/one.js': 'module.exports=()=>import("../../imported.js")',
						'imported.js': 'module.exports={x:1}'
					},
					outEsm: {
						'sub/subSub/one.js': 'export default(()=>import("../../imported.js"))',
						'imported.js': 'export default{x:1}'
					},
					outJs: {
						'sub/subSub/one.js': '()=>import("../../imported.js")',
						'imported.js': 'module.exports={x:1}'
					},
					async validate({'sub/subSub/one': one}) {
						expect(one).toBeFunction();
						await expectToResolveToModuleWithDefaultExportEqualling(one(), {x: 1});
					}
				});

				itSerializesEntries('in split point', {
					in: () => ({
						one: splitAsync({x: 1}, 'sub/subSub/imported')
					}),
					outCjs: {
						'one.js': 'module.exports=()=>import("./sub/subSub/imported.js")',
						'sub/subSub/imported.js': 'module.exports={x:1}'
					},
					outEsm: {
						'one.js': 'export default(()=>import("./sub/subSub/imported.js"))',
						'sub/subSub/imported.js': 'export default{x:1}'
					},
					outJs: {
						'one.js': '()=>import("./sub/subSub/imported.js")',
						'sub/subSub/imported.js': 'module.exports={x:1}'
					},
					async validate({one}) {
						expect(one).toBeFunction();
						await expectToResolveToModuleWithDefaultExportEqualling(one(), {x: 1});
					}
				});

				itSerializesEntries('in entry point and split point', {
					in: () => ({
						'sub/one': splitAsync({x: 1}, 'sub/subSub/imported')
					}),
					outCjs: {
						'sub/one.js': 'module.exports=()=>import("./subSub/imported.js")',
						'sub/subSub/imported.js': 'module.exports={x:1}'
					},
					outEsm: {
						'sub/one.js': 'export default(()=>import("./subSub/imported.js"))',
						'sub/subSub/imported.js': 'export default{x:1}'
					},
					outJs: {
						'sub/one.js': '()=>import("./subSub/imported.js")',
						'sub/subSub/imported.js': 'module.exports={x:1}'
					},
					async validate({'sub/one': one}) {
						expect(one).toBeFunction();
						await expectToResolveToModuleWithDefaultExportEqualling(one(), {x: 1});
					}
				});
			});
		});

		itSerializesEntries('imports same value as when included directly', {
			in() {
				const shared = {x: 1};
				return {
					one: {
						shared,
						importShared: splitAsync(shared, 'imported')
					},
					two: shared
				};
			},
			outCjs: {
				'one.js': 'module.exports={shared:require("./imported.js"),importShared:(0,()=>import("./imported.js"))}',
				'two.js': 'module.exports=require("./imported.js")',
				'imported.js': 'module.exports={x:1}'
			},
			outEsm: {
				'one.js': 'import a from"./imported.js";export default{shared:a,importShared:(0,()=>import("./imported.js"))}',
				'two.js': 'import a from"./imported.js";export default a',
				'imported.js': 'export default{x:1}'
			},
			outJs: {
				'one.js': '{shared:require("./imported.js"),importShared:(0,()=>import("./imported.js"))}',
				'two.js': 'require("./imported.js")',
				'imported.js': 'module.exports={x:1}'
			},
			async validate({one, two}) {
				expect(one).toBeObject();
				expect(one).toHaveOwnPropertyNames(['shared', 'importShared']);
				const {shared, importShared} = one;
				expect(two).toBe(shared);
				expect(importShared).toBeFunction();
				const mod = await expectToResolveToModule(importShared());
				expect(mod.default).toBe(shared);
			}
		});

		itSerializesEntries('ignores unused splits for file naming', {
			in() {
				split({y: 2}, 'imported');
				splitAsync({z: 3}, 'imported');
				return {
					one: splitAsync({x: 1}, 'imported')
				};
			},
			outCjs: {
				'one.js': 'module.exports=()=>import("./imported.js")',
				'imported.js': 'module.exports={x:1}'
			},
			outEsm: {
				'one.js': 'export default(()=>import("./imported.js"))',
				'imported.js': 'export default{x:1}'
			},
			outJs: {
				'one.js': '()=>import("./imported.js")',
				'imported.js': 'module.exports={x:1}'
			},
			async validate({one}) {
				expect(one).toBeFunction();
				await expectToResolveToModuleWithDefaultExportEqualling(one(), {x: 1});
			}
		});

		describe('outputs value in separate file from within', () => {
			itSerializesEntries('object', {
				in: () => ({
					one: {
						importFn: splitAsync({x: 1}, 'imported')
					}
				}),
				outCjs: {
					'one.js': 'module.exports={importFn:(0,()=>import("./imported.js"))}',
					'imported.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'export default{importFn:(0,()=>import("./imported.js"))}',
					'imported.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': '{importFn:(0,()=>import("./imported.js"))}',
					'imported.js': 'module.exports={x:1}'
				},
				async validate({one}) {
					expect(one).toBeObject();
					const {importFn} = one;
					expect(importFn).toBeFunction();
					await expectToResolveToModuleWithDefaultExportEqualling(importFn(), {x: 1});
				}
			});

			itSerializesEntries('function', {
				in() {
					const importFn = splitAsync({x: 1}, 'imported');
					return {
						one: (0, () => importFn)
					};
				},
				outCjs: {
					'one.js': 'module.exports=(a=>()=>a)(()=>import("./imported.js"))',
					'imported.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'export default(a=>()=>a)(()=>import("./imported.js"))',
					'imported.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': '(a=>()=>a)(()=>import("./imported.js"))',
					'imported.js': 'module.exports={x:1}'
				},
				async validate({one}) {
					expect(one).toBeFunction();
					const importFn = one();
					expect(importFn).toBeFunction();
					await expectToResolveToModuleWithDefaultExportEqualling(importFn(), {x: 1});
				}
			});
		});

		itSerializesEntries('creates separate file for async imported value where also shared', {
			in() {
				const sharedInner = {isSharedInner: true},
					sharedOuter = {isSharedOuter: true, sharedInner};
				return {
					one: {sharedInner, sharedOuter},
					two: {sharedInner, sharedOuter},
					three: splitAsync(sharedOuter, 'sharedOuter')
				};
			},
			outCjs: {
				'one.js': 'const a=require("./chunk.UDJMERLJ.js");module.exports={sharedInner:a[1],sharedOuter:a[0]}',
				'two.js': 'const a=require("./chunk.UDJMERLJ.js");module.exports={sharedInner:a[1],sharedOuter:a[0]}',
				'three.js': 'module.exports=()=>import("./sharedOuter.js")',
				'sharedOuter.js': 'module.exports=require("./chunk.UDJMERLJ.js")[0]',
				'chunk.UDJMERLJ.js': 'const a={isSharedInner:true};module.exports=[{isSharedOuter:true,sharedInner:a},a]'
			},
			outEsm: {
				'one.js': 'import a from"./chunk.WSDEFBGJ.js";export default{sharedInner:a[1],sharedOuter:a[0]}',
				'two.js': 'import a from"./chunk.WSDEFBGJ.js";export default{sharedInner:a[1],sharedOuter:a[0]}',
				'three.js': 'export default(()=>import("./sharedOuter.js"))',
				'sharedOuter.js': 'import a from"./chunk.WSDEFBGJ.js";export default a[0]',
				'chunk.WSDEFBGJ.js': 'const a={isSharedInner:true};export default[{isSharedOuter:true,sharedInner:a},a]'
			},
			outJs: {
				'one.js': '(()=>{const a=require("./chunk.UDJMERLJ.js");return{sharedInner:a[1],sharedOuter:a[0]}})()',
				'two.js': '(()=>{const a=require("./chunk.UDJMERLJ.js");return{sharedInner:a[1],sharedOuter:a[0]}})()',
				'three.js': '()=>import("./sharedOuter.js")',
				'sharedOuter.js': 'module.exports=require("./chunk.UDJMERLJ.js")[0]',
				'chunk.UDJMERLJ.js': 'const a={isSharedInner:true};module.exports=[{isSharedOuter:true,sharedInner:a},a]'
			},
			async validate({one, two, three}) {
				expect(one).toEqual({
					sharedInner: {isSharedInner: true},
					sharedOuter: {isSharedOuter: true, sharedInner: {isSharedInner: true}}
				});
				expect(two.sharedInner).toBe(one.sharedInner);
				expect(two.sharedOuter).toBe(one.sharedOuter);
				expect(three).toBeFunction();
				const mod = await expectToResolveToModule(three());
				expect(mod.default).toBe(one.sharedOuter);
			}
		});

		describe('repeated in one file', () => {
			itSerializesEntries('one splitAsync instance', {
				in() {
					const importFn = splitAsync({x: 1}, 'imported');
					return {
						one: {x: importFn, y: importFn}
					};
				},
				outCjs: {
					'one.js': 'const a=()=>import("./imported.js");module.exports={x:a,y:a}',
					'imported.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'const a=()=>import("./imported.js");export default{x:a,y:a}',
					'imported.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': '(()=>{const a=()=>import("./imported.js");return{x:a,y:a}})()',
					'imported.js': 'module.exports={x:1}'
				},
				async validate({one}) {
					expect(one).toBeObject();
					expect(one.x).toBeFunction();
					expect(one.y).toBe(one.x);
					await expectToResolveToModuleWithDefaultExportEqualling(one.x(), {x: 1});
				}
			});

			itSerializesEntries('multiple splitAsync instances', {
				in() {
					const shared = {x: 1};
					return {
						one: {
							importFn1: splitAsync(shared, 'imported'),
							importFn2: splitAsync(shared)
						}
					};
				},
				outCjs: {
					'one.js': 'module.exports={importFn1:(0,()=>import("./imported.js")),importFn2:(0,()=>import("./imported.js"))}',
					'imported.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'export default{importFn1:(0,()=>import("./imported.js")),importFn2:(0,()=>import("./imported.js"))}',
					'imported.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': '{importFn1:(0,()=>import("./imported.js")),importFn2:(0,()=>import("./imported.js"))}',
					'imported.js': 'module.exports={x:1}'
				},
				async validate({one}) {
					expect(one).toBeObject();
					const {importFn1, importFn2} = one;
					expect(importFn1).toBeFunction();
					expect(importFn2).toBeFunction();
					expect(importFn2).not.toBe(importFn1);
					const mod1 = await expectToResolveToModule(importFn1());
					const mod2 = await expectToResolveToModule(importFn2());
					expect(mod1.default).toEqual({x: 1});
					expect(mod2).toBe(mod1);
				}
			});
		});

		describe('repeated in multiple files', () => {
			itSerializesEntries('one splitAsync instance', {
				in() {
					const importFn = splitAsync({x: 1}, 'imported');
					return {
						one: importFn,
						two: importFn
					};
				},
				outCjs: {
					'one.js': 'module.exports=()=>import("./imported.js")',
					'two.js': 'module.exports=require("./one.js")',
					'imported.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'export default(()=>import("./imported.js"))',
					'two.js': 'import a from"./one.js";export default a',
					'imported.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': 'require("./chunk.CZPEC3H2.js")',
					'two.js': 'require("./chunk.CZPEC3H2.js")',
					'imported.js': 'module.exports={x:1}',
					'chunk.CZPEC3H2.js': 'module.exports=()=>import("./imported.js")'
				},
				async validate({one, two}) {
					expect(one).toBeFunction();
					expect(two).toBe(one);
					await expectToResolveToModuleWithDefaultExportEqualling(one(), {x: 1});
				}
			});

			itSerializesEntries('multiple splitAsync instances', {
				in() {
					const shared = {x: 1};
					return {
						one: splitAsync(shared, 'imported'),
						two: splitAsync(shared)
					};
				},
				outCjs: {
					'one.js': 'module.exports=()=>import("./imported.js")',
					'two.js': 'module.exports=()=>import("./imported.js")',
					'imported.js': 'module.exports={x:1}'
				},
				outEsm: {
					'one.js': 'export default(()=>import("./imported.js"))',
					'two.js': 'export default(()=>import("./imported.js"))',
					'imported.js': 'export default{x:1}'
				},
				outJs: {
					'one.js': '()=>import("./imported.js")',
					'two.js': '()=>import("./imported.js")',
					'imported.js': 'module.exports={x:1}'
				},
				async validate({one, two}) {
					expect(one).toBeFunction();
					expect(two).toBeFunction();
					expect(two).not.toBe(one);
					const mod1 = await expectToResolveToModule(one());
					const mod2 = await expectToResolveToModule(two());
					expect(mod1.default).toEqual({x: 1});
					expect(mod2).toBe(mod1);
				}
			});
		});

		itSerializesEntries('handles nested async splits', {
			in() {
				const importFn1 = splitAsync({x: 1}, 'imported1');
				const importFn2 = splitAsync(importFn1, 'imported2');
				return {one: importFn2};
			},
			outCjs: {
				'one.js': 'module.exports=()=>import("./imported2.js")',
				'imported2.js': 'module.exports=()=>import("./imported1.js")',
				'imported1.js': 'module.exports={x:1}'
			},
			outEsm: {
				'one.js': 'export default(()=>import("./imported2.js"))',
				'imported2.js': 'export default(()=>import("./imported1.js"))',
				'imported1.js': 'export default{x:1}'
			},
			outJs: {
				'one.js': '()=>import("./imported2.js")',
				'imported2.js': 'module.exports=()=>import("./imported1.js")',
				'imported1.js': 'module.exports={x:1}'
			},
			async validate({one: importFn2}) {
				expect(importFn2).toBeFunction();
				const mod2 = await expectToResolveToModule(importFn2());
				const importFn1 = mod2.default;
				expect(importFn1).toBeFunction();
				await expectToResolveToModuleWithDefaultExportEqualling(importFn1(), {x: 1});
			}
		});

		it('`ext` option alters split file filenames', () => {
			expect(
				serializeEntries(
					{
						one: splitAsync({isSplit: true})
					},
					{ext: 'mjs', format: 'esm'}
				)
			).toEqual([
				{filename: 'one.mjs', content: 'export default(()=>import("./chunk.P4XPXXFO.mjs"))'},
				{filename: 'chunk.P4XPXXFO.mjs', content: 'export default{isSplit:true}'}
			]);
		});
	});
});

async function expectToResolveToModuleWithDefaultExportEqualling(promise, expectedVal) {
	const mod = await expectToResolveToModule(promise);
	const val = mod.default;
	expect(val).toEqual(expectedVal);
	return val;
}

async function expectToResolveToModule(promise) {
	await expect(promise).resolves.toBeObject();
	const mod = await promise;
	expectToBeModule(mod);
	return mod;
}

function expectToBeModule(mod) {
	expect(mod).toBeObject();
	expect(mod).toHavePrototype(null);
	expect(Object.isExtensible(mod)).toBeFalse();
	expect(Object.isSealed(mod)).toBeTrue();
	expect(Object.isFrozen(mod)).toBeFalse();
	expect(mod).toHaveOwnPropertyNames(['default']);
	expect(mod).toHaveDescriptorModifiersFor('default', true, true, false);
	expect(mod).toHaveOwnPropertySymbols([Symbol.toStringTag]);
	expect(mod[Symbol.toStringTag]).toBe('Module');
	expect(mod).toHaveDescriptorModifiersFor(Symbol.toStringTag, false, false, false);
}

function resetSplitPoints() {
	// Keep each test isolated - splits are stored globally.
	// Tests still pass without this, but they run slower.
	internalSplitPoints.clear();
}
