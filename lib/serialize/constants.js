/* --------------------
 * livepack module
 * Constants
 * ------------------*/

'use strict';

// Exports

module.exports = {
	COMMON_FILENAME_PREFIX: 'chunk.',

	// Output types.
	// Entry points and async split points have lowest bit set. So `type & 1` is truthy if either of these.
	// All split types have 2nd lowest bit set. So `type & 2` is truthy if is split.
	// All common types have 3rd lowest bit set. So `type & 4` is truthy if is common.
	/* eslint-disable no-multi-spaces, key-spacing */
	ENTRY_POINT:        0b001, // 1
	SYNC_SPLIT_POINT:   0b010, // 2
	ASYNC_SPLIT_POINT:  0b011, // 3
	COMMON_POINT:       0b100, // 4
	COMMON_SPLIT_POINT: 0b110, // 5
	ENTRY_POINT_MASK:   0b001, // 1
	SPLIT_POINT_MASK:   0b010, // 2
	COMMON_MASK:        0b100  // 4
	/* eslint-enable no-multi-spaces, key-spacing */
};
