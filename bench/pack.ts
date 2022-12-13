import * as msgpackr from 'https://deno.land/x/msgpackr@v1.8.0/index.js';
import * as msgpack from "https://deno.land/x/msgpack@v1.2/mod.ts";
import * as tinymsgpack from 'npm:tiny-msgpack';

const packet = [null, 'createDetail', {
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
}
]
const encoded = msgpackr.pack(packet);
const msg = msgpack.encode(packet);

Deno.bench({
    name: 'msgpack.encode',
    group: 'pack',
    fn() { msgpack.encode(packet); }
});

Deno.bench({
    name: 'msgpack.decode',
    group: 'unpack',
    fn() { msgpack.decode(msg); }
});

Deno.bench({
    name: 'tinymsgpack.encode',
    group: 'pack',
    fn() { tinymsgpack.encode(packet); }
});

Deno.bench({
    name: 'tinymsgpack.decode',
    group: 'unpack',
    fn() { tinymsgpack.decode(encoded); }
});


Deno.bench({
    name: 'msgpackr.pack',
    group: 'pack',
    fn() { msgpackr.pack(packet); }
});

Deno.bench({
    name: 'msgpackr.unpack',
    group: 'unpack',
    fn() { msgpackr.unpack(encoded); }
});

const JSONencoded = JSON.stringify(packet);

Deno.bench({
    name: 'JSON.stringify',
    group: 'pack',
    baseline: true,
    fn() { JSON.stringify(packet); }
});

Deno.bench({
    name: 'JSON.parse',
    group: 'unpack',
    baseline: true,
    fn() { JSON.parse(JSONencoded); }
});

console.log('MSGPACKR', encoded.length)
console.log('JSON', JSONencoded.length)