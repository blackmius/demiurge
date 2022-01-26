/* eslint-disable indent */
import { Exception } from '../common/index.js';

const gettype = x => Array.isArray(x) ? 'array' : typeof x;
const type = t => 
    t === 'array' ? (x, name) => !Array.isArray(x) ? `${name} must be array, ${typeof x} passed instead` : null
    : t === 'any' ? _ => null
    : (x, name) => gettype(x) !== t ? `${name} must be ${t}, ${gettype(x)} passed instead` : null;

function array(descr) {
    const typePred = type('array');
    if (descr.length === 0) {
        return typePred; 
    } else if (descr.length === 1) {
        descr = transform(descr[0]);
        const pred = function predicate(x, name) {
            let err; for (let i = 0; i < x.length; i++) if ((err = descr(x[i], name+'['+i+']')) != null) return err;
        };
        return (x, name) => typePred(x, name) || pred(x, name);
    } else {
        descr = descr.map(transform);
        const pred = new Function('env', 'x', 'name',
            'let error;' +
            descr.map((_, i) => `if ((error = env[${i}](x[${i}], name+'[${i}]')) != null) return error`).join(';')
        );
        return (x, name) => typePred(x, name) || pred(descr, x, name);
    }
}

function whitelist(descr) {
    const whitelist = new Set(Object.keys(descr));
    const error = (x, name) => x ? `${name}.${x} is unexpected field, only [${[...whitelist].join(', ')}] fields are allowed` : null;
    return (x, name) => error(Object.keys(x ?? {}).find(e => !whitelist.has(e)), name);
}

function atLeastOne(descr) {
    return (x, name) => Object.keys(x ?? {}).length === 0 ? `Object ${name} is empty. At least one of [${Object.keys(descr).join(', ')}] field expected` : null;
}

function object(descr) {
    descr = transformObject(descr);
    const typePred = type('object');
    const whitelistPred = whitelist(descr);
    const atLeastOnePred = atLeastOne(descr);
    const pred = new Function('env', 'x', 'name',
        'let error;' +
        Object.keys(descr).map(
            key => `if ((error = env['${key}'](x['${key}'], name+'.${key}')) != null) return error`).join(';')
    );
    return (x, name) => typePred(x, name) || whitelistPred(x, name) || atLeastOnePred(x, name) || pred(descr, x, name);
}

function regex(r) {
    const pred = type('string');
    return (x, name) => pred(x, name) || !r.test(x) ? `${name} not matches regular expression ${r}` : null;
}

function transform(descr) {
    return typeof descr === 'string' ? type(descr)
        : Array.isArray(descr) ? array(descr)
        : descr instanceof RegExp ? regex(descr)
        : typeof descr === 'object' ? object(descr)
        : typeof descr === 'function' ? descr
        : _ => null;
}

const transformObject = descr => Object.fromEntries(Object.entries(descr).map(([key, value]) => [key, transform(value)]));

export function Arguments(descr) {
    if (typeof descr !== 'object') throw new TypeError('descr must be object');
    descr = transformObject(descr);
    const func = new Function('env', 'args',
        'let error;' + Object.keys(descr).map(
            (key, i) => `if ((error = env['${key}'](args[${i}], '${key}')) != null) return error`).join(';')
    );
    return function check(args) {
        const error = func(descr, args);
        if (error != null) {
            throw new Exception('TYPE_ERROR', error);
        }
    };
}

export function Result(descr) {
    const pred = transform(descr);
    return function check(val) {
        const error = pred(val, 'result');
        if (error != null) {
            throw new Exception('TYPE_ERROR', error);
        }
    };
}

export function named(pred, text) {
    if (typeof text !== 'function') text = _ => text;
    pred = transform(pred);
    return (x, name) => pred(x, name) ? text(x, name) : null;
}

export function optional(pred) {
    pred = transform(pred);
    return (x, name) => x == null ? null : pred(x, name);
}

export function all(...pred) {
    pred = pred.map(transform);
    return function predicate(x, name) {
        let err; for (let i = 0; i < pred.length; i++) if ((err = pred[i](x, name)) != null) return err;
    };
}

export function some(...pred) {
    pred = pred.map(transform);
    return function predicate(x, name) {
        let err; for (let i = 0; i < pred.length; i++) if ((err = pred[i](x, name)) == null) return null;
        return err;
    };
}

const number = type('number');
const obj = type('object');

export const positive = (x, name) => number(x, name) ||  x < 0 ? `${name} = ${x} must be positive` : null;
export const timestamp = positive;

export function one(list) {
    if (typeof list === 'object' && !Array.isArray(list)) list = Object.values(list);
    const set = new Set(list);
    return (x, name) => !set.has(x) ? `${name} must be one of {${[...set].join(', ')}}` : null;
}

export function entries(key, value) {
    key = transform(key);
    value = transform(value);
    function pred(x, name) {
        let e;
        const key_name = name + '[key]';
        for (const [k, v] of Object.entries(x)) {
            if ((e = key(k, key_name))) return e;
            if ((e = value(v, name+'[' + k + ']'))) return e;
        }
    }
    return (x, name) => obj(x, name) || pred(x, name);
}