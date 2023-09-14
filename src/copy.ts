// Modified from https://github.com/mesqueeb/copy-anything/commit/3cf9cd89e615f48063532bbf14a7f1f29c6e5773

type PlainObject = { [key in string | number | symbol]: unknown }
type Options = {excludes?:(string | symbol)[], nonenumerable?: boolean}

function assignProp(
    carry: PlainObject,
    key: string | symbol,
    newVal: any,
    originalObject: PlainObject,
    includeNonenumerable?: boolean
): void {
    const propType = {}.propertyIsEnumerable.call(originalObject, key)
        ? 'enumerable'
        : 'nonenumerable'
    if (propType === 'enumerable') carry[key as any] = newVal
    if (includeNonenumerable && propType === 'nonenumerable') {
        Object.defineProperty(carry, key, {
            value: newVal,
            enumerable: false,
            writable: true,
            configurable: true,
        })
    }
}

function copyPlainObj(target: any, options: Options, observe:any[]) {
    const props = Object.getOwnPropertyNames(target);
    const symbols = Object.getOwnPropertySymbols(target);
    return [...props, ...symbols].reduce((carry, key) => {
        if (options.excludes && options.excludes.includes(key)) {
            return carry;
        }
        const newVal = doCopy(target[key], options, observe)
        assignProp(carry, key, newVal, target, options.nonenumerable)
        return carry;
    }, {});
}

function doCopy(target: any, options:Options, observe:any[]) {
    if (target === null || target === undefined) {
        return target;
    }
    const type = typeof target;
    if (type !== 'object' && type !== 'function') {// primitive
        return target;
    }
    const objType = Object.prototype.toString.call(target).slice(8, -1);
    switch (objType) {
        case 'Array':
            return target.map(_ => doCopy(_, options, observe));
        case 'RegExp':
            return new RegExp((target as RegExp).source, (target as RegExp).flags);
        case 'Symbol':
            return Symbol((target as Symbol).description);
        case 'Object':
            if(observe.indexOf(target) !== -1) {
                throw 'copying recursive: ' + target;
            }
            observe.push(target);
            return copyPlainObj(target, options, observe);
        // case 'BigInt':
        // case 'String':
        // case 'Number':
        // case 'Boolean':
        default:
            return target;
    }
}

export function copy(target: any, options:Options = {}) {
    return doCopy(target, options, []);
}
