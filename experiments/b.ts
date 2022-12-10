import * as c from './interconnect.ts';

c.start({ hostname: '0.0.0.0', port: 12346 });
await c.connect({ hostname: '0.0.0.0', port: 12345 });
console.log(await c.call('2f758fb8-bf0d-4a22-8d5b-f3c585227b4f.0', 'test', 'heh'));