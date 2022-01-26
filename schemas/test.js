import assert from 'assert';

import { Arguments, optional, positive, one, named, all } from './index.js';

const types = Arguments({
    number: 'number',
    string: 'string',
    object: 'object',
    array: [],
    boolean: 'boolean',
    any: 'any'
});

const complexTypes = Arguments({
    deep: { a: { b: { c: { d: 'number' } } } },
    arrayOfStrings: ['string'],
    geteroGeneArray: ['string', 'number'],
    arrayOfArrays: [['number']]
});

const testOptional = Arguments({
    0: {
        numberOptional: optional('number'),
        deepOptional: optional({
            a: optional({
                c: optional('number'),
                b: {
                    d: optional('number'),
                    c: optional({
                        e: optional('number'),
                        d: 'number'
                    })
                }
            })
        }),
        arrayOptional: optional([optional('string'), optional('string')]),
    }
});

const testPositive = Arguments({
    n: positive
});

const testRegex = Arguments({
    session: /^[0-9a-zA-Z/+]{43}=$/
});

const testNamed = Arguments({
    session: named(/^[0-9a-zA-Z/+]{43}=$/, (_, name) => `${name} must be 32 random bytes encoded to base64`)
});

const testEnum = Arguments({
    role: one({
        ADMIN: 1,
        USER: 2,
        MODERATOR: 3
    }),
    colour: one(['red', 'blue', 'green'])
});

const testObject= Arguments({
    data: {
        name: optional('string'),
        role: optional('number'),
        likes: optional('string')
    }
});

const testAll = Arguments({
    string: all('string', (x, name) => x.length > 10 ? `${name} length must be less than 10 letters` : null)
});

describe('Проврека функционала', () => {
    it('Простые предикаты типа', () => {
        types([0, '', {a:1}, [], false, 'a']);
        assert.throws(() => {
            types(['', '', {a:1}, [], false]);
        }, { code: 'TYPE_ERROR', message: 'number must be number, string passed instead'});
        assert.throws(() => {
            types([0, 0, {a:1}, [], false, 2]);
        }, { code: 'TYPE_ERROR', message: 'string must be string, number passed instead'});
        assert.throws(() => {
            types([0, '', [], [], false, false]);
        }, { code: 'TYPE_ERROR', message: 'object must be object, array passed instead'});
        assert.throws(() => {
            types([0, '', {a:1}, {}, false, undefined]);
        }, { code: 'TYPE_ERROR', message: 'array must be array, object passed instead'});
        assert.throws(() => {
            types([0, '', {a:1}, [], 1, null]);
        }, { code: 'TYPE_ERROR', message: 'boolean must be boolean, number passed instead'});
    });

    it('Сложные предикаты типа', () => {
        complexTypes([{a:{b:{c: {d: 0}}}}, ['a', 'b', 'c', 'd'], ['', 0], [[0, 1, 2]]]);
        assert.throws(() => {
            complexTypes([{a:{b:{c: {d: ''}}}}, ['a', 'b', 'c', 'd'], ['', 0], []]);
        }, { code: 'TYPE_ERROR', message: 'deep.a.b.c.d must be number, string passed instead'});
        assert.throws(() => {
            complexTypes([{a:{b:{c:''}}}, ['a', 'b', 'c', 'd'], ['', 0], []]);
        }, { code: 'TYPE_ERROR', message: 'deep.a.b.c must be object, string passed instead'});
        assert.throws(() => {
            complexTypes([{a:{b:{c: {d: 0}}}}, ['a', 'b', 0, 'd'], ['', 0], []]);
        }, { code: 'TYPE_ERROR', message: 'arrayOfStrings[2] must be string, number passed instead'});
        assert.throws(() => {
            complexTypes([{a:{b:{c: {d: 0}}}}, ['a', 'b', 'c', 'd'], [0, 0], []]);
        }, { code: 'TYPE_ERROR', message: 'geteroGeneArray[0] must be string, number passed instead'});
        assert.throws(() => {
            complexTypes([{a:{b:{c: {d: 0}}}}, ['a', 'b', 'c', 'd'], ['', 0], [['']]]);
        }, { code: 'TYPE_ERROR', message: 'arrayOfArrays[0][0] must be number, string passed instead'});
    });

    it('Опциональные предикаты', () => {
        testOptional([{numberOptional: 0}]);
        assert.throws(() => {
            testOptional([{numberOptional: ''}]);
        }, { code: 'TYPE_ERROR', message: '0.numberOptional must be number, string passed instead'});

        assert.throws(() => {
            testOptional([{deepOptional: {a:{c:1}}}]);
        }, { code: 'TYPE_ERROR', message: '0.deepOptional.a.b must be object, undefined passed instead'});
        
        testOptional([{deepOptional: {a:{b:{d:1}}}}]);

        assert.throws(() => {
            testOptional([{deepOptional: {a:{b:{c:{e:1}}}}}]);
        }, { code: 'TYPE_ERROR', message: '0.deepOptional.a.b.c.d must be number, undefined passed instead'});

        testOptional([{deepOptional: {a:{b:{c:{d:1}}}}}]);

        testOptional([{arrayOptional: []}]);
        testOptional([{arrayOptional: [undefined, '']}]);

        assert.throws(() => {
            testOptional([{arrayOptional: [undefined, 0]}]);
        }, { code: 'TYPE_ERROR', message: '0.arrayOptional[1] must be string, number passed instead'});
    });

    it('Положительные числа', () => {
        testPositive([1]);
        assert.throws(() => {
            testPositive([-1]);
        }, { code: 'TYPE_ERROR', message: 'n = -1 must be positive'});
    });

    it('Регулярное выражение', () => {
        testRegex(['S+XafyrJXF6Qmm3g+cSEb6EuQXNZFSApDWGwJomkGRI=']);
        assert.throws(() => {
            testRegex(['GwJomkGRI=']);
        }, { code: 'TYPE_ERROR', message: 'session = \'GwJomkGRI=\' not matches regular expression /^[0-9a-zA-Z/+]{43}=$/'});
    });

    it('Один из предложенных', () => {
        testEnum([1, 'red']);
        testEnum([3, 'green']);

        assert.throws(() => {
            testEnum([5, 'green']);
        }, { code: 'TYPE_ERROR', message: 'role must be one of {1, 2, 3}'});

        assert.throws(() => {
            testEnum([1, 'purple']);
        }, { code: 'TYPE_ERROR', message: 'colour must be one of {red, blue, green}'});
    });

    it('Строгая проверка полей', () => {
        testObject([{name: '', role:1}]);
        testObject([{name: '', role:1, likes: 'cats'}]);

        assert.throws(() => {
            testObject([{name: '', role:1, admin: true}]);
        }, { code: 'TYPE_ERROR', message: 'data.admin is unexpected field, only [name, role, likes] fields are allowed'});
    });

    it('Хотя бы одно поле', () => {
        testObject([{name: ''}]);

        assert.throws(() => {
            testObject([{}]);
        }, { code: 'TYPE_ERROR', message: 'Object data is empty. At least one of [name, role, likes] field expected'});
    });

    it('Именование сложных предикатов', () => {
        testNamed(['S+XafyrJXF6Qmm3g+cSEb6EuQXNZFSApDWGwJomkGRI=']);

        assert.throws(() => {
            testNamed(['S+=']);
        }, { code: 'TYPE_ERROR', message: 'session must be 32 random bytes encoded to base64'});
    });

    it('Все предикаты', () => {
        testAll(['a']);

        assert.throws(() => {
            testAll(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
        }, { code: 'TYPE_ERROR', message: 'string length must be less than 10 letters'});
        assert.throws(() => {
            testAll([0]);
        }, { code: 'TYPE_ERROR', message: 'string must be string, number passed instead'});
    });
});