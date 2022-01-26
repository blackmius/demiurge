/*
    rpc пакет это такой кортеж, состоящий из n элементов, где
    первый элемент cb - это виртуальный идентификатор колбека на вызывающей стороне
    второй элемент fn - это имя вызываемой процедуры на вызываемой стороне
    далее n-2 элемента args - это аргументы процедуры

    -> [cb: any, fn: any, ...args: any[]]
    <- [null, cb, result: any, error: [code: string, msg: string]]

    общение между участниками полностью симметрично, тоесть формат пакетов неизменяется в зависимости от типа участника

    пакеты rpc не зависят от канала и могут быть переданы любым доступным способом, дающим
    возможность передачи json (или любой вид сериализации объектов например msgpack)

    тоесть сериализованные пакеты передаются по каналу, например WebSocket или TCP, или же по двум каналам одновременно
    
    Задачи реализуемые на уровне rpc:
        - абстракция сессионного хранилища (контекст)
        - ожидание вызова процедур у контекста
        - долговременные процессы
        
        более высоким уровнем могут быть паттерны распределенных систем
        созданные на основе данных возможностей

            - делегирование обработки запроса соседнему узлу (роутинг)
            - задачи репликации

    Задачи реализуемые на уровне транспорта:
        - сериализация / десериализация
        - drain механизмы
        - передача пакетов порциями по n штук (batch)
        - журналирование результатов вызова / ошибок
        - отслеживание времени ожидания ответа
        - отслеживание вызовов
        - оптимизация распределения запросов по потокам
*/


/*
[+] same context for every transport
[+] async call
[+] call timeout
[+] eventEmitter base
[] patterns
    [] generator (aka erlang process)
    [] routing (decentralized balancer)
    [] distributed patterns
        https://martinfowler.com/articles/patterns-of-distributed-systems/#NextSteps
        [] fault tolerant consensus algorithm(s)
        [] Gossip Dissemination
[] type(predicates) checking
[] auto documenting
*/

/*

ВОПРОСЫ КАК ЛУЧШЕ

Есть ли смысл делать множество отдельных подключений?

    например, загрузка файлов

    мы можем для загрузки файла открыть отдельный сокет, указав изначально дескриптор
    id = getDescr(id?) // создастся дескриптор или установится переданный

    и далее просто вызывать write(buf)

    и тогда запись двух разных файлов требует открытие нового контекста

    {
        getDescr(id?) 
        while (buf = fs.read(a)) write(buf);
    }
    {
        getDescr(id?) 
        while (buf = fs.read(b)) write(buf);
    }

    или же сделать загрузку в одном канале но тогда надо передавать дескриптор каждым вызовом (так сделано в unix)

    {
        while (buf = fs.read(a)) write(id1, buf);
        while (buf = fs.read(b)) write(id2, buf);
    }

    в любом случае rpc позволяет сделать и так и так

Есть л


пример сигналирования друг-другу - (обычный генератор)

client1
{
    next = rpc.handler()
    while (true) await next()
}  

client2

надо как-то функции передавать по рпц
rpc.generator(async (args) {
    while (true) await yield res;
})

*/

/*
    Ошибки вызова процедур
    code - машинночитаемый идентификатор ошибки
    message - человекочитаемая интерпритация ошибки
    args - аргументы ошибки для локализации ошибок (если rpc используется в приложении)
*/
class RpcError extends Error {
    constructor(code, message, ...args) {
        super(message);
        this.code = code;
        this.message = message;
        this.args = args;
    }
}

/*
    Абстракция над сессией клиента, общая часть между всеми транспортами

    для реализации конкретного транспортного уровня необходимо реализовать:
        - метод отправки пакетов _send(packet)
        - вызов события ctx.emit('end')
    
    также 
    
*/
class Context {
    constructor(handlers) {
        this.handlers = handlers;
        this.cbs = {};
        this.cbId = 0;

        // вот здесь появляется абстракция хранилища, поэтому создаем отдельный
        // объект для контекста вызываемых процедур
        this.ctx = Object.assign(new EventEmitter(), {
            send: this.send,
            call: this.call,
            callWithTimeout: this.callWithTimeout
        });
    }

    /*
        Абстрактный метод, который связывает транспортный уровень с контекстом
    */
    _send(packet) {}

    /*
        Вызов процедуры у контекста без ожидания результата

        Можно также рассматривать как отправка события
    */
    send(name, ...args) {
        this._send([null, name, ...args])
    }

    /*
        Вызов процедуры у контекста, с ожиданием результата
    */
    call(name, ...args) {
        return new Promise((resolve, reject) => {
            const cb = this.cbId++;
            ws.cbs[cb] = (result, error) => {
                delete this.cbs[cb];
                if (error !== undefined) {
                    reject(new RpcError(...error))
                } else {
                    resolve(result)
                };
            };
            this._send([cb, name, ...args]);
        });
    }

    /*
        Тоже самое что выше, но ждет в течении заданного времени
        после взводит ошибку истечения времени
    */
    callWithTimeout(timeout, name, ...args) {
        return new Promise((resolve, reject) => {
            const cb = this.cbId++;
            let tId;
            ws.cbs[cb] = (result, error) => {
                clearTimeout(tId);
                delete this.cbs[cb];
                if (error !== undefined) {
                    reject(new RpcError(...error))
                } else {
                    resolve(result)
                };
            };
            this._send([cb, name, ...args]);
            tId = setTimeout(() => {
                delete this.cbs[cb];
                reject(new RpcError('CALL_TIMEOUT', `Timeout when calling ${name}`, name, args));
            }, timeout);
        });
    }

    /*
        Разбирает сообщение и пытается вызвать нужный колбек в контексте
        При ошибке отправляет ошибку обратно контексту, и падает
    */
    async process(packet) {
        const [cb, fn, ...args] = packet;
        if (func in this.cbs) {
            this.cbs[func](...args);
        } else {
            let result, error;
            try {
                if (func in this.handlers) {
                    result = await handlers[func].apply(this.ctx, args);
                } else {
                    throw new RpcError('UNKNOWN_HANDLER', `Cannot find handler '${name}'`, name);
                }
            } catch (e) {
                if (e instanceof RpcError) {
                    error = [e.code, e.toString(), ...e.args];
                } else {
                    error = ['SERVER_ERROR', 'Server error'];
                }
                throw e;
            } finally {
                if (cb !== undefined) {
                    this.send(cb, result, error);
                }
            }
            return result;
        }
    }
}
