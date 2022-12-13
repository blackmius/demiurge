import { serve, Client } from '../src/tcp.ts'

// servers

// serve({ port: 3000 }, {
//     test(num: number) {}
// });

// import { copy } from "https://deno.land/std@0.164.0/streams/conversion.ts";

// const listener = Deno.listen({ port: 8080 });
// (async () => {
//     for await (const conn of listener) copy(conn, conn);
// })();

// import { serve as serveHTTP } from "https://deno.land/std@0.167.0/http/server.ts";

// const port = 8081;

// const handler = (request: Request): Response => {
//   return new Response('ok', { status: 200 });
// };

// serveHTTP(handler, { port });


const client = await Client({ port: 3000 });

const payload = {
    "glossary": {
        "title": "example glossary",
		"GlossDiv": {
            "title": "S",
			"GlossList": {
                "GlossEntry": {
                    "ID": "SGML",
					"SortAs": "SGML",
					"GlossTerm": "Standard Generalized Markup Language",
					"Acronym": "SGML",
					"Abbrev": "ISO 8879:1986",
					"GlossDef": {
                        "para": "A meta-markup language, used to create markup languages such as DocBook.",
						"GlossSeeAlso": ["GML", "XML"]
                    },
					"GlossSee": "markup"
                }
            }
        }
    }
};

Deno.bench({
    name: 'rpc',
    group: 'RTT',
    baseline: true,
    async fn() {
        await client.call('test', 1, payload);
    }
});
Deno.bench({
    name: 'rpc',
    group: 'send',
    baseline: true,
    async fn() {
        await client.send('test', 1, payload);
    }
});

const conn = await Deno.connect({ port: 8080 });


const size = 512;
const buf = new Uint8Array(size);

Deno.bench({
    name: 'Deno.Conn.write',
    group: 'RTT',
    async fn() {
        await conn.write(buf);
        await conn.read(buf);
    }
});

Deno.bench({
    name: 'Deno.Conn.write',
    group: 'send',
    async fn() {
        await conn.write(buf);
    }
});

const body = 'a'.repeat(512);
Deno.bench({
    name: 'fetch',
    group: 'RTT',
    async fn() {
        await fetch('http://127.0.0.1:8081', { method: 'POST', body })
}
});