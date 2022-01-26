# Schemas

Библиотека служит для создания валидационных функций из предикатов, также с помощью нее можно строить контракты между сервисами и приложениями, однако пока только в 1 сторону (сервер пишет файл, разработчики приложений могут лишь сверяться с этим файлом)

Валидационная функция это функция, которая принимает массив аргументов, упорядоченный в соответсвии с указанными аргументами. Если один из аргументов не проходит валидацию, взводится ошибка с относительно детальным описанием несоответствия прелъявленного аргумента с описанным в схеме.

``` js
import { Arguments, positive } from '@dhq/schemas';

const argsValidator = Arguments({ [arg_name]: predicate });
const resultValidator = Result(predicate);

const schema = Arguments({ // создание валидационной функции для проверки аргументов функции
    a: 'string',
    b: 'number',
    c: 'boolean'
});

const _schema = Result(positive); // проверка, что аргумент это положительное число

function method(a, b, c) {
    schema(arguments); // проверяем аргументы
    const res = b - 10;
    _schema(res); // проверяем результат
    return res;
}

method('asdfgh', 12345, true); // ok
method(123, 123, false) // TypeError: a should be string but number passed instead

method('asdfgh', 5, true); // TypeError: result=-5 should be greater than zero

```

Доступные предикаты

```js
import { Arguments, positive, timestamp, optional, named } from '@dhq/schemas';

Arguments({
    number: 'number', // typeof number === "number"
    string: 'string', // typeof string === "string"
    object: 'object', // typeof object === "object"
    array: 'array', // Array.isArray(array)
    boolean: 'boolean', // typeof boolean === "boolean"
    any: 'any' // ничего не проверяет

    positive: positive, // положительное число
    timestamp: timestamp, // в наших сервисах числа это количество миллисекунд начиная с 1 января 1970 00:00:00.000
                          // это только положительные числа, но для семантики контрактов, переименовали positive в timestamp
                          // и читающему будет понятно, что это поле времени
    
    optional: optional('string') // optional(predicate) поле может быть null или undefined

    // комплексные "типы"

    array: [], // Array.isArray(array)
    arrayOfStrings: ['string'], // Array.isArray(arrayOfStrings) && arrayOfStrings.every(i=>typeof i === "string")
                                // [predicate] это не обязательно ['string'] может содержать в себе все те же самые предикаты, что и Arguments
                                // массивы вида ["a", "b", ..., "a"]
    tuple: ['string', 'number'], // Array.isArray(tuple) && typeof tuple[0] === 'string' && typeof tuple[1] === 'number'
                                 // тоесть массив вида ["a", 1] и не больше не меньше элементов
    arrayOfArrays: [['number']], // один из случаев [predicate], как говорилось уже predicate может тот же самый
                                 // в этом случае predicate=['number']
    
    data: { name: 'string' }, // валидация объектов, причем если объект состоит из optional полей, требуется наличие хотя бы одного, не равного null
    entries: entries('string', 'number') // проверка всех ключей и значений объекта entries(key, value)
                                         // схеие в примере соответсвуют объекты вида { "b": 1, "a": 2 }

    regex: /^[0-9a-zA-Z/+]{43}=$/ // проверка на регулярное выражение
                                  // в примере используется проверка, что строка это 32 байта закодированные в base64
    named: named(/^[0-9a-zA-Z/+]{43}=$/, (_, name) => `${name} must be 32 random bytes encoded to base64`),
        // для создания типов из предикатов и улучшения вывода ошибок, с более понятным текстом
        // используется функция, которая при получении ошибки создает более подробны текст
        // named(predicate, (value, name) => message)

    enum: one({
        ADMIN: 1,
        USER: 2,
        MODERATOR: 3
    }), // числовой enum, проверяет, эквивалент one([1,2,3])
    textEnum: one(['red', 'blue', 'green']), // текстовый enum

    predicate: (value, name) => value ? errorMessage : null, // создание собственного предиката
                                                             // ему передается значение и имя аргумента
                                                             // если возвращается строка, то это считается ошибкой
                                                             // в случае успешной валидации необходимо возвращать null
    all: all('number', (x,n)=> x % 3 !== 0 ? `${n}=${x} must mod by 3` : null)
    // проверка, что все предикаты выполняются
    // all(pred1, pred2, ...)

    some: some('number', 'string') // хотябы один из предикатов выполняется
                                   // some(pred1, pred2, ...)
})
```



# Проверка типов во время тестирования

Требуется модифицировать клиент, который во время вызовов будет способен одновременно проверять схемы запросов, ответов и событий от сервера

для этого в файлах со схемами следует придерживаться определенного именования (вот это как раз проблема)

сейчас схема для метода рпц назвается точно также как сам метод в API, ответ этого метода помечается `_` в префиксе, а события сервера добавлением постфикса `Event`, так например для метода method, схемы будут выглядить следующим образом

``` js
export const method = Arguments({}); // валидация аргументов метода
export const _method = Result(); // валидация результата метода
export const methodEvent = Arguments({}); // валидация аргументов события method
```

Но я еще не до конца уверен, что делать надо именно так, поэтому этот кусок кода находится пока только в файлах тестирования

``` js
const schemas = { ...api.schemas }; // список схем api
const _client = new Client(url); // стандартный клиент
const client = { // переопределяем клиент под его интерфейс, но с проверкой схем
    async call(name, ...args) {
        const validateRes = schemas['_'+name];
        if (validateRes == null) {
            throw Error(`Required result validator for called '${name}' method`);
        }
        const res = await _client.call(name, ...args);
        try {
            validateRes(res);
        } catch(e) {
            e.message += '\n' + JSON.stringify(res, null, 2);
            throw e;
        }
        return res;
    },
    on(name, fn) {
        const validateEvent = schemas[name+'Event'];
        if (validateEvent == null) {
            throw Error(`Required event validator for binded '${name}' method`);
        }
        _client.on(name, (...args) => {
            try {
                validateEvent(args);
            } catch(e) {
                console.log(args);
                console.error(e);
            }
            return fn(args);
        });
    },
    close() {}
};
```