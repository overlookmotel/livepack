'use strict';

// Modules
const pathJoin = require('path').join,
	{readFile} = require('fs-extra'),
	DevTools = require('chrome-remote-interface'),
	{isObject} = require('is-it-type'),
	assert = require('simple-invariant');

const {stringify} = JSON;

// Constants
const PORT = 9229;

// Run

process.on('unhandledRejection', (err) => { throw err; });

const SERIALIZE_PATH = pathJoin(__dirname, 'serialize.js');

let varCounter = 0;
const files = new Map(); // Keyed by script ID

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
	const {breakpointId, breakpoint2Id} = await setSerializeBreakpoint(Debugger);

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

let introspecting = false;
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

	// Get objectId for `fn` var
	const localScopeId = event.callFrames[0].scopeChain[0].object.objectId;
	console.log('localScopeId:', localScopeId);

	const {result: localScope} = await Runtime.getProperties({
		objectId: localScopeId,
		generatePreview: true,
		ownProperties: true
	});

	// console.log('localScope:');
	// console.dir(localScope, {depth: 10});

	assert(localScope.length === 2);

	const [fnObj, captureObj] = localScope;
	const fnValue = fnObj.value;
	assert(fnObj.name === 'fn' && fnValue.type === 'function');
	const {objectId: fnId, description: fnJs} = fnValue;
	assert(captureObj.name === 'capture' && captureObj.value.type === 'object');
	const captureId = captureObj.value.objectId;

	// Get function location and objectId for scopes
	const {internalProperties: fnProps} = await Runtime.getProperties({
		objectId: fnId,
		generatePreview: true,
		ownProperties: true
	});

	// console.log('fnProps:');
	// console.dir(fnProps, {depth: 10});

	assert(fnProps.length === 2);
	const [locationProps, scopesObjProps] = fnProps;

	const locationValue = locationProps.value;
	assert(
		locationProps.name === '[[FunctionLocation]]' && locationValue.type === 'object'
		&& locationValue.subtype === 'internal#location'
	);
	const location = locationValue.value;

	const scopesValue = scopesObjProps.value;
	assert(
		scopesObjProps.name === '[[Scopes]]' && scopesValue.type === 'object'
		&& scopesValue.subtype === 'internal#scopeList'
	);
	const scopesId = scopesValue.objectId;

	// Get code for file
	const {scriptId} = location;
	let fileJs = files.get(scriptId);
	if (fileJs === undefined) {
		const res = await Debugger.getScriptSource({scriptId});
		fileJs = res.scriptSource;
		files.set(scriptId, fileJs);
	}

	// Substitute empty function for original
	// console.log('fileJs:', fileJs.split('\n'));
	console.log('fnJs:', fnJs);
	console.log('location:', location);

	const charStart = fileJs.indexOf(fnJs);
	assert(charStart !== -1);

	const replacementFnJs = transformFn(fnJs);
	console.log('replacementFnJs:', replacementFnJs);

	const replacementFileJs = fileJs.slice(0, charStart)
		+ replacementFnJs
		+ fileJs.slice(charStart + fnJs.length);

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

	console.log('replacementFileJs:', replacementFileJs);

	const resReplace = await Debugger.setScriptSource({scriptId, scriptSource: replacementFileJs});
	// console.log('resReplace.callFrames[0]:');
	// console.dir(resReplace.callFrames[0], {depth: 10});

	// Step into function
	introspecting = true;

	const pausePromise = new Promise(resolve => client.once('Debugger.paused', resolve));
	await Debugger.stepInto();
	const pauseEvent = await pausePromise;

	const {callFrameId, scopeChain} = pauseEvent.callFrames[0];
	// console.dir(scopeChain, {depth: 10});

	const scopeIds = [];
	for (let i = scopeChain.length - 1; i >= 0; i--) {
		const scope = scopeChain[i];
		const {type} = scope;
		if (type === 'global' || type === 'local') continue;

		const scopeId = scope.object.objectId;
		scopeIds.push(scopeId);

		const {result: vars} = await Runtime.getProperties({
			objectId: scopeId,
			generatePreview: true,
			ownProperties: true
		});
		// console.log('scope:', scope);
		// console.dir(vars, {depth: 10});

		await setVariableValue(vars[0].name, `__var_${varCounter++}`, i, callFrameId, Debugger);

		/*
		const loc = scope.startLocation;
		const locStr = `${loc.scriptId}_${loc.lineNumber}_${loc.columnNumber}`;
		const varName = `${SCOPE_ID_VAR}${locStr}`;
		*/

		/*
		const scopeVarObj = vars.find(({name}) => name === varName);
		if (!scopeVarObj) {
			const setRes = await Debugger.setVariableValue({
				scopeNumber: i,
				variableName: varName,
				newValue: {value: scopeCounter++},
				callFrameId
			});
			console.log('setRes:', setRes);
		}
		*/
	}

	// Resume to next breakpoint in `serializeFunction()`
	const pausePromise2 = new Promise(resolve => client.once('Debugger.paused', resolve));
	await Debugger.resume();
	const pauseEvent2 = await pausePromise2;
	assert(isAtBreakpoint(pauseEvent2, breakpoint2Id));

	introspecting = false;

	// Revert script code back to as it was
	const resRevert = await Debugger.setScriptSource({scriptId, scriptSource: fileJs});
	// console.log('resRevert:', resRevert);

	// Get scopes and inject into `capture.scopes` var in `serializeFunction()`
	/*
	console.log('getting scopes');
	const {result: scopes} = await Runtime.getProperties({
		objectId: scopesId,
		generatePreview: false,
		ownProperties: true
	});
	console.log('got scopes');
	*/

	/*
	for (const scopeId of scopeIds) {
		const res = await Runtime.callFunctionOn({
			functionDeclaration: `(function(scope) {this.scopes.push({scopeId: ${stringify(scopeId)}, values: scope.object})})`,
			objectId: captureId,
			arguments: [{objectId: scopeId}]
		});
		assert(res && res.result && res.result.type === 'undefined');
	}
	*/

	/*
	// Inject location into `capture.location` var in `serializeFunction()`
	const res = await Runtime.callFunctionOn({
		functionDeclaration: `(function() {this.location = ${stringify(location)}})`,
		objectId: captureId
	});
	assert(res && res.result && res.result.type === 'undefined');
	*/

	// Resume execution
	await Debugger.resume();
}

async function setSerializeBreakpoint(Debugger) {
	const js = await readFile(SERIALIZE_PATH, 'utf8');
	const lineNum = js.slice(0, js.indexOf('// Debugger break point')).split('\n').length;

	const resActive = await Debugger.setBreakpointsActive({active: true});
	assertEmptyObject(resActive);

	const url = `file://${SERIALIZE_PATH}`;
	const breakpointId = await setBreakpointByUrl(url, lineNum, Debugger);
	const breakpoint2Id = await setBreakpointByUrl(url, lineNum + 1, Debugger);

	return {breakpointId, breakpoint2Id};
}

async function setBreakpointByUrl(url, lineNumber, Debugger) {
	const res = await Debugger.setBreakpointByUrl({url, lineNumber, columnNumber: 0});
	const {breakpointId} = res;
	assert(breakpointId);
	return breakpointId;
}

async function setVariableValue(varName, value, scopeNumber, callFrameId, Debugger) {
	const res = await Debugger.setVariableValue({
		scopeNumber,
		variableName: varName,
		newValue: {value},
		callFrameId
	});
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
	if (match) return match[2] ? '()=>{}' : '()=>0';

	match = js.match(/^function\s*[A-Za-z0-9_$]*\([^)]+\)\s*{/);
	if (match) {
		let out = match[0];
		if (js.slice(out.length).indexOf('\n') !== -1) out += '\n';
		out += '}';
		return out;
	}

	throw new Error('Cannot parse function');
}
