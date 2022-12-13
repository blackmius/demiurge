import { Context } from "../src/rpc.ts"
import * as msgpackr from 'https://deno.land/x/msgpackr@v1.8.0/index.js';

const packet = msgpackr.pack([0, 'test', 1]);
let readResolve: ()=>void, writeResolve: (value:any)=>void, writePromise: Promise<any>;
const ctx = new Context(
    { read(p: Uint8Array) {
        p.set(packet, 0);
        writePromise = new Promise(resolve => writeResolve = resolve);
        return new Promise(resolve => readResolve = () => resolve(packet.length));
    }, close() {}},
    { write(p: Uint8Array): Promise<number> {
        writeResolve(undefined);
        return Promise.resolve(p.length);
    } },
    { test() { return 1; }
});
ctx.listen();

Deno.bench({
    name: 'process',
    async fn() {
        readResolve();
        await writePromise;
    }
})