/* eslint-disable strict, no-console, no-eval, no-var */

'uuse strict';

var require = temp;

eval('var require = 456; require = 789;');
console.log(require.toString());

function temp() { return 123; }
