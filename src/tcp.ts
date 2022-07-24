import { Context } from './rpc.ts';

export async function serve(options: Deno.ListenOptions, handlers = {}) {
    const listener = Deno.listen(options);
    for await (const conn of listener) {
        const ctx = new Context(conn, conn);
        ctx.handlers = handlers;
        ctx.listen();
    }
}

export async function Client(options: Deno.ConnectOptions, handlers = {}) {
    const conn = await Deno.connect(options);
    const ctx = new Context(conn, conn);
    ctx.handlers = handlers;
    ctx.listen();
    return ctx;
}