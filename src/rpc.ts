// deno-lint-ignore-file no-explicit-any

import { readableStreamFromReader } from 'https://deno.land/std@0.130.0/streams/conversion.ts';
import { concat } from "https://deno.land/std@0.156.0/bytes/mod.ts";
import { pack, Unpackr } from "https://deno.land/x/msgpackr@v1.8.0/index.js";
import { EventEmitter } from "./eventEmitter.ts";

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

type Handler = (this: Context, ...args: any[]) => any;
export type Handlers = {[name: string]: Handler};

type Callbacks = {[index: number|string]: (result: any, error: RpcErrorPacket) => void};

type CallbackArgs = [result: any, error: RpcErrorPacket];

type Packet = [cb: any, fn: any, ...args: any[]];

interface PacketEvent {
    source: string
    ctx: Context
    packet: Packet
    error?: Error
    result?: any
    timeStart: number
    timeEnd: number
}

interface ContextEvents {
    opened(ctx: Context): void
    closed(ctx: Context): void
    packet(event: PacketEvent): void
}

export const events = new EventEmitter<ContextEvents>();

export class Context {
    handlers: Handlers = {};
    cbs: Callbacks = {};
    cbId = 0;

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

    _send(packet: Packet) {
        this.writer.write(pack(packet));
    }

    send(name: string, ...args: any[]) {
        this._send([null, name, ...args]);
    }

    on(name: string, handler: Handler) {
        this.handlers[name] = handler;
    }

    private _call(timeoutMs: number | null, name: string, args: any[]): Promise<any> {
        const timeStart = Date.now();

        const cb = this.cbId++;
        const packet: Packet = [cb, name, ...args];

        const promise = new Promise((resolve, reject) => {
            let tId: number;
            if (timeoutMs) {
                tId = setTimeout(() => {
                    reject(new RpcError('CALL_TIMEOUT', `Timeout calling ${name}`));
                }, timeoutMs);
            }
            this.cbs[cb] = (result, error) => {
                clearTimeout(tId);
                delete this.cbs[cb];
                if (error !== undefined) {
                    reject(new RpcError(...error));
                } else {
                    events.emit('packet', {source: 'call', ctx: this, packet, result, timeStart, timeEnd: Date.now()});
                    resolve(result);
                }
            };
        }).catch(error => {
            events.emit('packet', {source: 'call', ctx: this, packet, error, timeStart, timeEnd: Date.now()});
            throw error;
        });

        this._send(packet);

        return promise;
    }

    call(name: string, ...args: any[]) {
        return this._call(null, name, args);
    }

    callWithTimeout(timeoutMs: number, name: string, ...args: any[]) {
        return this._call(timeoutMs, name, args);
    }

    async listen() {
        const stream = readableStreamFromReader(this.reader, { autoClose: false });
        const reader = stream.getReader();
        const unpackr = new Unpackr({ useRecords: false });

        events.emit('opened', this);

        let buf = new Uint8Array();
        while (true) {
            const { done, value } = await reader.read();
            if (done) { break; }
            buf = concat(buf, value);
            let values;
            try {
                values = unpackr.unpackMultiple(buf);
                buf = new Uint8Array();
            } catch {
                continue;
            }
            if (!values) continue;
            for (const packet of values) {
                this.process(packet as Packet);
            }
        }

        for (const cb in this.cbs) {
            this.cbs[cb](null, ['CONNECTION_CLOSED', 'Reader is closed']);
        }

        events.emit('closed', this);
    }

    async process(packet: Packet) {
        const [cb, fn, ...args] = packet;
        if (fn in this.cbs) {
            this.cbs[fn](...args as CallbackArgs);
            return;
        }
        const timeStart = Date.now();
        let result, error;
        try {
            if (fn in this.handlers) {
                result = await this.handlers[fn].apply(this, args);
            } else {
                throw new RpcError('UNKNOWN_HANDLER', `Cannot find handler '${fn}'`, fn);
            }
        } catch (e) {
            if (e instanceof RpcError) {
                error = [e.code, e.toString(), ...e.args];
            } else {
                error = ['SERVER_ERROR', 'Server error'];
            }
        } finally {
            events.emit('packet', {source: 'process', ctx: this, packet, error, result, timeStart, timeEnd: Date.now()});
            if (cb !== null) {
                this.send(cb, result, error);
            }
        }
    }
}