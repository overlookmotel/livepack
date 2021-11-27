/* --------------------
 * livepack module
 * `createLiveBinding()` runtime function
 * ------------------*/

/* eslint-disable strict */

// Exports

/**
 * Create object to represent an ESM live binding.
 *
 * Called with initial value of var.
 * `const binding = createLiveBinding(1);`
 *
 * Wherever value is written to in file where var defined, assignment should be substituted
 * with value setter.
 * i.e. `x = 2` -> `binding.a = 2`
 *
 * Using a getter/setter on binding object so can be substituted into deconstructions
 * and other complex expressions without changing behavior. e.g.:
 * `[x] = [1]` -> `[binding.a] = [2]`
 * `({x, [x]: y} = {x: 1, 1: 2})` -> `({x: binding.a, [x]: y} = {x: 1, 1: 2})`
 * `x++` -> `binding.a++`
 *
 * Scopes where var is read from should create a setter function for the local var and pass it to
 * `registerSetter()` i.e. `binding.b(v => x = v)`.
 *
 * If module namespace object is used, should also create a setter function to write to the property
 * of the namespace object and pass it to registerSetter()`
 * i.e. `const mod = {}; binding.b(v => mod.x = v);`
 *
 * @param {*} value - Value
 * @param {undefined} setters - Must not be provided
 * @returns {Object} - Live binding object
 */
module.exports = (value, setters = []) => ({
	/**
	 * Value getter.
	 * @returns {*} - Value
	 */
	get a() {
		return value;
	},

	/**
	 * Value setter.
	 * Calls all the setters.
	 * @param {*} newValue - New value for var
	 */
	set a(newValue) {
		value = newValue;
		setters.forEach(setter => setter(value));
	},

	/**
	 * Register setter.
	 * New setter is called immediately with current value.
	 * @param {Function} setter - Setter function
	 * @returns {undefined}
	 */
	b(setter) {
		setters.push(setter);
		setter(value);
	}
});
