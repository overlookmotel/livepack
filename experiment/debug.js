/* eslint-disable no-console */

'use strict';

// Modules
const pathJoin = require('path').join,
	{readFile} = require('fs-extra'),
	DevTools = require('chrome-remote-interface'),
	{isObject} = require('is-it-type'),
	{last} = require('lodash'),
	assert = require('simple-invariant');

// Constants
const PORT = 9229;

// Run

process.on('unhandledRejection', (err) => { throw err; });

const SERIALIZE_PATH = pathJoin(__dirname, 'serialize.js');
const files = new Map(); // Keyed by script ID
let introspecting = false;

initDebugger();

async function initDebugger() {
	// Init debugger
	const client = await DevTools({port: PORT});
	const {Debugger, Runtime} = client;

	/*
	client.on('event', (event) => {
		if (event.method === 'Debugger.scriptParsed') return;
		console.log('event:', event);
	});
	*/

	await Debugger.enable();

	// Set breakpoint in `serializeFunction()`
	const {breakpointId, breakpoint2Id} = await setSerializeBreakpoints(Debugger);

	// Await debugger connected and paused on first line
	await Runtime.runIfWaitingForDebugger();
	await new Promise((resolve) => {
		client.once('Debugger.paused', (event) => {
			resolve(event.callFrames[0].callFrameId);
		});
	});

	// Register handler for hitting `serializeFunction()` break point
	client.on('Debugger.paused', event => onDebuggerPaused(event, client, breakpointId, breakpoint2Id));

	// Resume execution
	await Debugger.resume();
}

async function onDebuggerPaused(event, client, breakpointId, breakpoint2Id) {
	// Ignore if pause is on function being introspected
	if (introspecting) return;

	// Ignore pauses not due to breakpoint in `serializeFunction()`
	// e.g. `debugger;` statements in code being serialized
	const {Runtime, Debugger} = client;
	if (!isAtBreakpoint(event, breakpointId)) {
		await Debugger.resume();
		return;
	}

	// Get object IDs for `fn` + `capture` vars and function JS
	const {fnId, captureId, fnJs} = await getLocalScopeVars(event, Runtime);

	// Get function location and objectId for scopes
	const {location, scopesId} = await getFunctionLocationAndScopes(fnId, Runtime);

	// Get scopes and inject into `capture()` in `serializeFunction()`
	const newVars = await getFunctionVars(scopesId, captureId, location, Runtime);

	// Set values for new vars
	if (newVars.length > 0) await replaceVars(newVars, fnJs, location, breakpoint2Id, client);

	// Continue
	await Debugger.resume();
}

async function setSerializeBreakpoints(Debugger) {
	const js = await readFile(SERIALIZE_PATH, 'utf8');
	const lineNum = js.slice(0, js.indexOf('// Debugger break point')).split('\n').length;

	const resActive = await Debugger.setBreakpointsActive({active: true});
	assertEmptyObject(resActive);

	const url = `file://${SERIALIZE_PATH}`;
	const breakpointId = await setBreakpointByUrl(url, lineNum, Debugger);
	const breakpoint2Id = await setBreakpointByUrl(url, lineNum + 4, Debugger);

	return {breakpointId, breakpoint2Id};
}

async function setBreakpointByUrl(url, lineNumber, Debugger) {
	const res = await Debugger.setBreakpointByUrl({url, lineNumber, columnNumber: 0});
	const {breakpointId} = res;
	assert(breakpointId);
	return breakpointId;
}

async function getLocalScopeVars(event, Runtime) {
	const {scopeChain} = event.callFrames[0];

	// Get object IDs for `fn` + `capture` vars
	const {result: localScope} = await Runtime.getProperties({
		objectId: scopeChain[0].object.objectId,
		generatePreview: true,
		ownProperties: true
	});

	assert(localScope.length === 4);

	const [fnObj, , captureObj] = localScope;

	const fnValue = fnObj.value;
	assert(fnObj.name === 'fn' && fnValue.type === 'function');

	const captureValue = captureObj.value;
	assert(captureObj.name === 'capture' && captureValue.type === 'function');

	return {
		fnId: fnValue.objectId,
		fnJs: fnValue.description,
		captureId: captureValue.objectId
	};
}

async function getFunctionLocationAndScopes(fnId, Runtime) {
	// Get function location and objectId for scopes
	const {internalProperties: fnProps} = await Runtime.getProperties({
		objectId: fnId,
		generatePreview: true,
		ownProperties: true
	});

	assert(fnProps.length === 2);
	const [locationProps, scopesObjProps] = fnProps;

	const locationValue = locationProps.value;
	assert(
		locationProps.name === '[[FunctionLocation]]' && locationValue.type === 'object'
		&& locationValue.subtype === 'internal#location'
	);

	const scopesValue = scopesObjProps.value;
	assert(
		scopesObjProps.name === '[[Scopes]]' && scopesValue.type === 'object'
		&& scopesValue.subtype === 'internal#scopeList'
	);

	return {
		location: locationValue.value,
		scopesId: scopesValue.objectId
	};
}

async function getFunctionVars(scopesId, captureId, location, Runtime) {
	// Get scopes and inject into `capture()` in `serializeFunction()`
	const {result: {objectId: newVarsId}} = await Runtime.callFunctionOn({
		functionDeclaration: `(function(capture){return capture(this, ${JSON.stringify(location)})})`,
		objectId: scopesId,
		arguments: [{objectId: captureId}]
	});

	// Parse result from `capture()` - array of new vars to define
	const {result: newVarsArr} = await Runtime.getProperties({
		objectId: newVarsId,
		generatePreview: false,
		ownProperties: true
	});

	const newVars = [];
	for (const newVarObj of newVarsArr) {
		if (!/^\d+$/.test(newVarObj.name)) continue;

		const {result: newVarProps} = await Runtime.getProperties({
			objectId: newVarObj.value.objectId,
			generatePreview: false,
			ownProperties: true
		});

		const newVar = {};
		for (const newVarProp of newVarProps) {
			const {name, value} = newVarProp;
			if (name === '__proto__') continue;
			newVar[name] = value.objectId || value.value;
		}
		newVars.push(newVar);
	}

	return newVars;
}

async function replaceVars(newVars, fnJs, location, breakpoint2Id, client) {
	const {Debugger, Runtime} = client;

	// Get code for file
	const {scriptId} = location;
	let fileJs = files.get(scriptId);
	if (fileJs === undefined) {
		const res = await Debugger.getScriptSource({scriptId});
		fileJs = res.scriptSource;
		files.set(scriptId, fileJs);
	}

	// Substitute empty function for original
	const charStart = fileJs.indexOf(fnJs);
	assert(charStart !== -1);

	const replacementFnJs = '() => { return;                             }';
	assert(fnJs === "() => { console.log('f3 vars:', {x, q, r}); }");
	assert(replacementFnJs.length === fnJs.length);

	// const replacementFnJs = transformFn(fnJs);
	console.log('replacementFnJs:', replacementFnJs);

	const replacementFileJs = fileJs.slice(0, charStart)
		+ replacementFnJs
		+ fileJs.slice(charStart + fnJs.length);

	console.log('replacementFileJs:', replacementFileJs);

	introspecting = true;

	await Debugger.setScriptSource({scriptId, scriptSource: replacementFileJs});

	// await new Promise(resolve => setTimeout(resolve, 1000));

	// Step into function
	const pausedPromise = getPausedPromise(client);
	await stepInto(Debugger);
	const pauseEvent = await pausedPromise;

	const {callFrameId, scopeChain} = pauseEvent.callFrames[0];

	// Align scope chain with previously tracked scopes
	let levelsSkipped = 0;
	if (scopeChain[0].type === 'local') {
		scopeChain.shift();
		levelsSkipped = 1;
	}

	// Get value IDs from `global.__newVals`
	const globalScopeId = last(scopeChain).object.objectId;

	const {result: globalScope} = await Runtime.getProperties({
		objectId: globalScopeId,
		generatePreview: false,
		ownProperties: true
	});

	const newVarsId = globalScope.find(v => v.name === '__newVars').value.objectId;

	const {result: newVarsArr} = await Runtime.getProperties({
		objectId: newVarsId,
		generatePreview: false,
		ownProperties: true
	});

	for (let i = 0; i < newVars.length; i++) {
		const {result: newVarProps} = await Runtime.getProperties({
			objectId: newVarsArr[i].value.objectId,
			generatePreview: false,
			ownProperties: true
		});
		newVars[i].val = newVarProps.find(p => p.name === 'val').value.objectId;
	}

	// Set scope variables to `Var` objects
	for (const {level, name, val: valId} of newVars) {
		await setVariableValue(name, valId, level + levelsSkipped, callFrameId, Debugger);
	}

	// Revert script code back to as it was
	await Debugger.setScriptSource({scriptId, scriptSource: fileJs});

	// Resume to next breakpoint in `serializeFunction()`
	let atBreakpointId = await resumeUntilBreakpoint(client);
	if (atBreakpointId !== breakpoint2Id) {
		atBreakpointId = await resumeUntilBreakpoint(client);
		assert(atBreakpointId === breakpoint2Id);
	}

	// await new Promise(resolve => setTimeout(resolve, 1000));

	introspecting = false;
}

async function resumeUntilBreakpoint(client) {
	const pausePromise = getPausedPromise(client);
	await client.Debugger.resume();
	const event = await pausePromise;

	const {hitBreakpoints} = event;
	assert(hitBreakpoints && hitBreakpoints.length === 1);
	return hitBreakpoints[0];
}

function getPausedPromise(client) {
	return new Promise(resolve => client.once('Debugger.paused', resolve));
}

async function old() {
	// Substitute empty function for original
	// console.log('fileJs:', fileJs.split('\n'));
	console.log('fnJs:', fnJs);
	console.log('location:', location);

	/*
	const {lineNumber, columnNumber} = location;

	const lines = fileJs.split('\n');
	const fragment = lines[lineNumber].slice(columnNumber);
	console.log('fragment:', fragment);

	let beforeChars;
	if (fragment.startsWith(fnJs.split('\n')[0])) {
		beforeChars = 0;
	} else {
		beforeChars = fnJs.indexOf(fragment);
	}

	console.log('beforeChars:', beforeChars);

	let charStart = columnNumber;
	for (let i = 0; i < lineNumber; i++) {
		charStart += lines[i].length + 1;
	}

	const replaceLen = fnJs.length - beforeChars;
	console.log({part: fileJs.slice(charStart, charStart + replaceLen)});

	const numFnLineBreaks = fnJs.split('\n').length - 1;

	const replacementFnJs = beforeChars === 0 ? '() => {}' : '(){}';
	const replacementFileJs = fileJs.slice(0, charStart)
		+ replacementFnJs
		+ '\n'.repeat(numFnLineBreaks)
		+ ' '.repeat(replaceLen - replacementFnJs.length - numFnLineBreaks)
		+ fileJs.slice(charStart + replaceLen);
	*/

	/*
	const toReplaceStr = "() => { console.log('x:', x); }";
	const replacementFnJs = '() => {}';
	const replacementFileJs = fileJs.replace(toReplaceStr, ' '.repeat(toReplaceStr.length));
	*/
}

async function setVariableValue(varName, value, scopeNumber, callFrameId, Debugger) {
	const res = await Debugger.setVariableValue({
		scopeNumber,
		variableName: varName,
		newValue: {objectId: value},
		callFrameId
	});
	assertEmptyObject(res);
}

async function stepInto(Debugger) {
	const res = await Debugger.stepInto();
	assertEmptyObject(res);
}

function isAtBreakpoint(event, breakpointId) {
	const {hitBreakpoints} = event;
	return !!hitBreakpoints && hitBreakpoints.length === 1 && hitBreakpoints[0] === breakpointId;
}

function assertEmptyObject(obj, msg) {
	assert(isObject(obj) && Object.keys(obj).length === 0, msg);
}

function transformFn(js) {
	// Arrow function
	// const match = js.match(/^(\([^)]\)\s*=>\s*)(\{)?[\s\S]*\}?$/);
	let match = js.match(/^(\([^)]*\)\s*=>\s*)(\{?)?/);
	if (match) return '()=>{return;}';
	// if (match) return match[2] ? '()=>{return;}' : '()=>0';

	match = js.match(/^function\s*[A-Za-z0-9_$]*\([^)]+\)\s*{/);
	if (match) {
		let out = match[0];
		if (js.slice(out.length).indexOf('\n') !== -1) out += '\n';
		out += '}';
		return out;
	}

	throw new Error('Cannot parse function');
}
