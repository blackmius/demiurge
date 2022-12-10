import { writeAll } from 'https://deno.land/std@0.130.0/streams/conversion.ts';

async function serve(options: Deno.ListenOptions) {
    const listener = Deno.listen(options);
    for await (const conn of listener) {
        let i = 0;
        while (true) {
            const buf = new Uint8Array(1024);
            await conn.read(buf);
            i+=1;
            if (i % 50000 == 0) {
                console.timeEnd('a');
                console.time('a');
            }
        }
    }
}

serve({ port: 3000 });

const encoder = new TextEncoder();
const buf = encoder.encode('antest1');

Deno.connect({ port: 3000 })
.then(async (conn) => {
    console.time('a')
    for (let i = 0; i < 1e6; i++) {
        await conn.write(buf);
    }
});
