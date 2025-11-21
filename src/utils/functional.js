/**
 * Functional programming utilities
 * @module functional
 */

/**
 * Compose functions from left to right (pipeline style)
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 * @example
 * const transform = pipe(trim, uppercase, reverse);
 * transform('  hello  '); // 'OLLEH'
 */
export const pipe = (...fns) => (value) =>
  fns.reduce((acc, fn) => fn(acc), value);

/**
 * Compose functions from right to left (traditional composition)
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 * @example
 * const transform = compose(reverse, uppercase, trim);
 * transform('  hello  '); // 'OLLEH'
 */
export const compose = (...fns) => (value) =>
  fns.reduceRight((acc, fn) => fn(acc), value);

/**
 * Curry a function (convert function to accept arguments one at a time)
 * @param {Function} fn - Function to curry
 * @returns {Function} Curried function
 * @example
 * const add = (a, b, c) => a + b + c;
 * const curriedAdd = curry(add);
 * curriedAdd(1)(2)(3); // 6
 * curriedAdd(1, 2)(3); // 6
 */
export const curry = (fn) => {
  const arity = fn.length;

  return function curried(...args) {
    if (args.length >= arity) {
      return fn(...args);
    }

    return (...moreArgs) => curried(...args, ...moreArgs);
  };
};

/**
 * Map with index (curried)
 * @param {Function} fn - Function to apply (receives value and index)
 * @param {Array} arr - Array to map over
 * @returns {Array} Mapped array
 * @example
 * const addIndex = mapIndexed((val, idx) => val + idx);
 * addIndex([10, 20, 30]); // [10, 21, 32]
 */
export const mapIndexed = curry((fn, arr) => arr.map(fn));

/**
 * Filter (curried)
 * @param {Function} predicate - Predicate function
 * @param {Array} arr - Array to filter
 * @returns {Array} Filtered array
 * @example
 * const isEven = n => n % 2 === 0;
 * const filterEven = filter(isEven);
 * filterEven([1, 2, 3, 4]); // [2, 4]
 */
export const filter = curry((predicate, arr) => arr.filter(predicate));

/**
 * Reduce (curried)
 * @param {Function} reducer - Reducer function
 * @param {*} initial - Initial value
 * @param {Array} arr - Array to reduce
 * @returns {*} Reduced value
 * @example
 * const sum = reduce((acc, n) => acc + n, 0);
 * sum([1, 2, 3, 4]); // 10
 */
export const reduce = curry((reducer, initial, arr) => arr.reduce(reducer, initial));

/**
 * Group array elements by key function
 * @param {Function} keyFn - Function to extract key from element
 * @param {Array} arr - Array to group
 * @returns {Object} Object with grouped elements
 * @example
 * const people = [{name: 'Alice', age: 30}, {name: 'Bob', age: 30}];
 * groupBy(p => p.age, people);
 * // {30: [{name: 'Alice', age: 30}, {name: 'Bob', age: 30}]}
 */
export const groupBy = curry((keyFn, arr) => {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});
});

/**
 * Map over object values
 * @param {Function} fn - Function to apply to each value
 * @param {Object} obj - Object to map
 * @returns {Object} New object with mapped values
 * @example
 * const double = n => n * 2;
 * mapObject(double, {a: 1, b: 2}); // {a: 2, b: 4}
 */
export const mapObject = curry((fn, obj) => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, fn(value, key)])
  );
});

/**
 * Filter object entries
 * @param {Function} predicate - Predicate function (value, key) => boolean
 * @param {Object} obj - Object to filter
 * @returns {Object} New object with filtered entries
 * @example
 * const isEven = (v) => v % 2 === 0;
 * filterObject(isEven, {a: 1, b: 2, c: 3}); // {b: 2}
 */
export const filterObject = curry((predicate, obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([key, value]) => predicate(value, key))
  );
});

/**
 * Pick specified keys from object
 * @param {Array<string>} keys - Keys to pick
 * @param {Object} obj - Source object
 * @returns {Object} New object with only specified keys
 * @example
 * const pickNameAge = pick(['name', 'age']);
 * pickNameAge({name: 'Alice', age: 30, city: 'NYC'}); // {name: 'Alice', age: 30}
 */
export const pick = curry((keys, obj) => {
  return keys.reduce((acc, key) => {
    if (key in obj) {
      acc[key] = obj[key];
    }
    return acc;
  }, {});
});

/**
 * Omit specified keys from object
 * @param {Array<string>} keys - Keys to omit
 * @param {Object} obj - Source object
 * @returns {Object} New object without specified keys
 * @example
 * const omitPassword = omit(['password']);
 * omitPassword({name: 'Alice', password: 'secret'}); // {name: 'Alice'}
 */
export const omit = curry((keys, obj) => {
  const keySet = new Set(keys);
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keySet.has(key))
  );
});
