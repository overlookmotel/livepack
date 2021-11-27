/* eslint-disable import/no-unresolved, import/first, no-console, no-unused-vars */

import {types} from 'util';

// Default export only
import * as modD from 'data:text/javascript,let b=a=>b=a;export{b as default}';

// Named exports only
// Which is shorter depends on number and length of the export names
import * as modP from 'data:text/javascript,let x=(a,b,c)=>{x=a;y=b;z=c},y,z';
import * as modP2 from 'data:text/javascript,let b=a=>b=a,c=a=>c=a,d=a=>d=a;export{b as x,c as y,d as z}';

// Default and named exports
// Which is shorter depends on number and length of the export names
import * as modB from 'data:text/javascript,export let x,y,z;export default function a(b,c,d,e){a=b;x=c;y=d;z=e}';
import * as modB2 from 'data:text/javascript,let a;export let x=(b,c,d,e)=>{a=b;x=c;y=d;z=e},y,z;export{a as default}';
import * as modB3 from 'data:text/javascript,let b=a=>b=a,c=a=>c=a,d=a=>d=a,e=a=>e=a;export{b as default, c as x,d as y,e as z}';

modB.default(1, 2, 3, 4);

modB3.default(1); modB3.x(2); modB3.y(2); modB3.z(3);

console.log('modB:', modB);
console.log('modB is module:', types.isModuleNamespaceObject(modB));

console.log('modB3:', modB3);
console.log('modB3 is module:', types.isModuleNamespaceObject(modB3));

// Live bindings
import * as modL from 'data:text/javascript,let b=a=>b=a,c=a=>c=a;export {b as default, c as x}';

const setDefault = modL.default,
	setX = modL.x;
setDefault(1);
setX(2);
console.log('modL after initial set:', modL);
setDefault(3);
setX(4);
console.log('modL after later set:', modL);
console.log('modL is module:', types.isModuleNamespaceObject(modL));
