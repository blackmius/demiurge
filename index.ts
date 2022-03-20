/*

*/
// deno-lint-ignore-file no-explicit-any

import { Encoder, decodeMultiStream } from "https://unpkg.com/@msgpack/msgpack@2.7.2/mod.ts";

import { writeAll, iterateReader } from 'https://deno.land/std@0.130.0/streams/conversion.ts';

type RpcErrorPacket = [code: string, msg: string, ...args: any[]];
class RpcError extends Error {
    code: string;
    args: any[];

    constructor(code: string, message: string, ...args: any[]) {
        super(message);
        this.code = code;
        this.message = message;
        this.args = args;
    }
}

type Handler = (this: Ctx, ...args: any[]) => any;
type Handlers = {[name: string]: Handler};

type CallbackArgs = [result: any, error: RpcErrorPacket];

type Packet = [cb: any, fn: any, ...args: any[]];

interface Ctx {
    send(name: string, ...args: any[]): void
    call(name: string, ...args: any[]): Promise<any>
    callWithTimeout(timeout: number, name: string, ...args: any[]): Promise<any>
}

class Context {
    static encoder = new Encoder();

    handlers: Handlers;
    cbs: {[index: number]: (result: any, error: RpcErrorPacket) => void} = {};
    cbId = 0;

    ctx: Ctx = {
        send: this.send,
        call: this.call,
        callWithTimeout: this.callWithTimeout
    };

    reader: Deno.Reader & Deno.Closer;
    writer: Deno.Writer;

    constructor(
        reader: Deno.Reader & Deno.Closer,
        writer: Deno.Writer,
        handlers: Handlers = {}
    ) {
        this.reader = reader;
        this.writer = writer;
        this.handlers = handlers;
    }

    async _send(packet: Packet) {
        await writeAll(this.writer, Context.encoder.encode(packet));
    }

    send(name: string, ...args: any[]) {
        this._send([null, name, ...args])
    }

    call(name: string, ...args: any[]) {
        return new Promise((resolve, reject) => {
            const cb = this.cbId++;
            this.cbs[cb] = (result, error) => {
                delete this.cbs[cb];
                if (error !== null) {
                    reject(new RpcError(...error));
                } else {
                    resolve(result);
                }
            };
            this._send([cb, name, ...args]);
        });
    }

    callWithTimeout(timeout: number, name: string, ...args: any[]) {
        return new Promise((resolve, reject) => {
            const tId = setTimeout(() => {
                reject(new RpcError('CALL_TIMEOUT', `Timeout when calling ${name}`, name, args));
            }, timeout);
            this.call(name, ...args).then(result => {
                clearTimeout(tId);
                resolve(result)
            }).catch(reject);
        });
    }

    async listen() {
        const iter = decodeMultiStream(iterateReader(this.reader)) as AsyncGenerator<Packet>;
        while (true) {
            const { done, value } = await iter.next();
            if (done) break;
            this.process(value).catch(()=>{}); // TODO: logging
        }
        for (const cb in this.cbs) {
            this.cbs[cb](null, ['CONNECTION_CLOSED', 'Reader is closed'])
        }
    }

    async process(packet: Packet) {
        const [cb, fn, ...args] = packet;
        if (fn in this.cbs) {
            this.cbs[fn](...args as CallbackArgs);
        } else {
            let result, error;
            try {
                if (fn in this.handlers) {
                    result = await this.handlers[fn].apply(this.ctx, args);
                } else {
                    throw new RpcError('UNKNOWN_HANDLER', `Cannot find handler '${fn}'`, fn);
                }
            } catch (e) {
                if (e instanceof RpcError) {
                    error = [e.code, e.toString(), ...e.args];
                } else {
                    error = ['SERVER_ERROR', 'Server error'];
                }
                throw e;
            } finally {
                if (cb !== null) {
                    this.send(cb, result, error);
                }
            }
            return result;
        }
    }
}

export async function serve(options: Deno.ListenOptions, handlers: Handlers = {}) {
    const listener = Deno.listen(options);
    for await (const conn of listener) {
        const ctx = new Context(conn, conn, handlers);
        ctx.listen();
    }
}

export async function Client(options: Deno.ConnectOptions, handlers: Handlers = {}) {
    const conn = await Deno.connect(options);
    const ctx = new Context(conn, conn, handlers);
    ctx.listen();
    return ctx;
}