import { serve, Client } from '../src/tcp.ts'

serve({ port: 3000 }, {
    test(num: number) {}
});

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
    name: 'RTT 1000 packets',
    async fn() {
        for (let i = 0; i < 1000; i++)
            await client.call('test', i, payload);
    }
});

Deno.bench({
    name: 'CAST 1000 packets',
    async fn() {
        for (let i = 0; i < 1000; i++)
            await client.send('test', i, payload);
    }
});