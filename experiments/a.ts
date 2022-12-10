import * as c from './interconnect.ts';

class Process {
    i = 0;
    test(...args) {
        console.log(...args);
        return this.i++;
    }
}
c.registerProcess('P', Process);
c.start({ hostname: '0.0.0.0', port: 12345 });

const pid = await c.spawn('P');
console.log(pid);