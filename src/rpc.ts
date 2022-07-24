// deno-lint-ignore-file no-explicit-any

import { readableStreamFromReader } from 'https://deno.land/std@0.130.0/streams/conversion.ts';
import { TextLineStream } from "https://deno.land/std@0.148.0/streams/mod.ts";
import { JSONParseStream } from "https://deno.land/std@0.148.0/encoding/json/stream.ts";

type RpcErrorPacket = [code: string, msg: string, ...args: any[]];
export class RpcError extends Error {
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

type Callbacks = {[index: number|string]: (result: any, error: RpcErrorPacket) => void};

type CallbackArgs = [result: any, error: RpcErrorPacket];

type Packet = [cb: any, fn: any, ...args: any[]];

interface Ctx {
    send(name: string, ...args: any[]): void
    call(name: string, ...args: any[]): Promise<any>
    callWithTimeout(timeout: number, name: string, ...args: any[]): Promise<any>
}

export class Context {
    static encoder = new TextEncoder();

    handlers: Handlers = {};
    cbs: Callbacks = {};
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
        writer: Deno.Writer
    ) {
        this.reader = reader;
        this.writer = writer;
    }

    drain: string = '';
    _send(packet: Packet) {
        const buf = Context.encoder.encode(JSON.stringify(packet) + '\n');
        this.writer.write(buf);
    }

    send(name: string, ...args: any[]) {
        this._send([null, name, ...args]);
    }

    on(name: string, handler: Handler) {
        this.handlers[name] = handler;
    }

    wait(cb: string | number, timeout?: number) {
        return new Promise((resolve, reject) => {
            let tId: number;
            if (timeout) {
                tId = setTimeout(() => {
                    reject(new RpcError('WAIT_TIMEOUT', `Timeout waiting ${cb}`));
                }, timeout);
            }
            this.cbs[cb] = (result, error) => {
                clearTimeout(tId);
                delete this.cbs[cb];
                if (error !== null) {
                    reject(new RpcError(...error));
                } else {
                    resolve(result);
                }
            };
        })
    }

    call(name: string, ...args: any[]) {
        return new Promise((resolve, reject) => {
            const cb = this.cbId++;
            this.wait(cb).then(resolve).catch(reject);
            this._send([cb, name, ...args]);
        });
    }

    callWithTimeout(timeout: number, name: string, ...args: any[]) {
        return new Promise((resolve, reject) => {
            const cb = this.cbId++;
            this.wait(cb, timeout)
                .then(resolve)
                .catch(e => {
                    if (e instanceof RpcError && e.code == 'WAIT_TIMEOUT') {
                        e = new RpcError('CALL_TIMEOUT', `Timeout calling ${name}`, name, args);
                    }
                    reject(e);
                });
            this._send([cb, name, ...args]);
        });
    }

    async listen() {
        const stream = readableStreamFromReader(this.reader, { autoClose: false });
        const readable = stream
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new TextLineStream())
            .pipeThrough(new JSONParseStream());
        
        for await (const data of readable) {
            this.process(data).catch(()=>{})
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