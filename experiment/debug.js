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
	const breakpointId = await setBreakpoint(Debugger);

	// Await debugger connected and paused on first line
	await Runtime.runIfWaitingForDebugger();
	await new Promise((resolve) => {
		client.once('Debugger.paused', (event) => {
			resolve(event.callFrames[0].callFrameId);
		});
	});

	// Register handler for hitting `serializeFunction()` break point
	client.on('Debugger.paused', event => onDebuggerPaused(event, client, breakpointId));

	// Resume execution
	await Debugger.resume();
}

async function onDebuggerPaused(event, client, breakpointId) {
	const {Runtime, Debugger} = client;

	// Ignore pauses not due to breakpoint in `serializeFunction()`
	// e.g. `debugger;` statements in code being serialized
	const {hitBreakpoints} = event;
	if (!hitBreakpoints || !hitBreakpoints.some(id => id === breakpointId)) {
		await Debugger.resume();
		return;
	}

	// Get objectId for `fn` var
	const localScopeId = event.callFrames[0].scopeChain[0].object.objectId;

	const scopeProps = await Runtime.getProperties({
		objectId: localScopeId,
		accessorPropertiesOnly: false,
		generatePreview: true,
		ownProperties: false
	});

	// console.log('scopeProps:');
	// console.dir(scopeProps, {depth: 10});

	const fnObj = scopeProps.result[0];
	assert(fnObj.name === 'fn' && fnObj.value.type === 'function');
	const fnId = fnObj.value.objectId;

	const captureObj = scopeProps.result[1];
	assert(captureObj.name === 'capture' && captureObj.value.type === 'object');
	const captureId = captureObj.value.objectId;

	// Get function location and objectId for scopes
	const fnProps = await Runtime.getProperties({
		objectId: fnId,
		accessorPropertiesOnly: false,
		generatePreview: true,
		ownProperties: true
	});

	// console.log('fnProps:');
	// console.dir(fnProps, {depth: 10});

	const {internalProperties} = fnProps;
	assert(internalProperties.length === 2);
	const locationProps = internalProperties[0],
		locationValue = locationProps.value;
	assert(
		locationProps.name === '[[FunctionLocation]]' && locationValue.type === 'object'
		&& locationValue.subtype === 'internal#location'
	);
	const location = locationValue.value;

	const scopesObjProps = internalProperties[1],
		scopesValue = scopesObjProps.value;
	assert(
		scopesObjProps.name === '[[Scopes]]' && scopesValue.type === 'object'
		&& scopesValue.subtype === 'internal#scopeList'
	);
	const scopesId = scopesValue.objectId;

	// Get scopes and inject into `capture.scopes` var in `serializeFunction()`
	const {result: scopes} = await Runtime.getProperties({
		objectId: scopesId,
		accessorPropertiesOnly: false,
		generatePreview: false,
		ownProperties: true
	});

	for (let i = scopes.length - 1; i >= 0; i--) {
		const scope = scopes[i].value;
		if (scope.description === 'Global') continue;

		const scopeId = scope.objectId;
		const res = await Runtime.callFunctionOn({
			functionDeclaration: `(function(scope) {this.scopes.push({scopeId: ${stringify(scopeId)}, values: scope.object})})`,
			objectId: captureId,
			arguments: [{objectId: scopeId}]
		});
		assert(res && res.result && res.result.type === 'undefined');
	}

	// Inject location into `capture.location` var in `serializeFunction()`
	const res = await Runtime.callFunctionOn({
		functionDeclaration: `(function() {this.location = ${stringify(location)}})`,
		objectId: captureId
	});
	assert(res && res.result && res.result.type === 'undefined');

	// Resume execution
	await Debugger.resume();
}

async function setBreakpoint(Debugger) {
	const js = await readFile(SERIALIZE_PATH, 'utf8');
	const lineNum = js.slice(0, js.indexOf('// Debugger break point')).split('\n').length;

	const resActive = await Debugger.setBreakpointsActive({active: true});
	assert(isObject(resActive) && Object.keys(resActive).length === 0);

	const resBreak = await Debugger.setBreakpointByUrl({
		// urlRegex: breakpointRegex,
		url: `file://${SERIALIZE_PATH}`,
		lineNumber: lineNum,
		columnNumber: 0
	});

	const {breakpointId} = resBreak;
	assert(breakpointId);
	return breakpointId;
}
