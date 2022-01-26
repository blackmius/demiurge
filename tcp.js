import net from 'net';
import { Encoder, decodeMultiStream } from '@msgpack/msgpack';

const encoder = new Encoder();


/*
[] connection pool
    [] balancer
[] auto-reconnection
*/
class Client extends Context {
    constructor(addr) {
        super({});
        this.socket = net.connect(add)
    }
}


/*
[] backpressure
[] batching
[] logging
    [] errors logging
    [] call logs
    [] perfomance log
[] serialization
    [] check buffer is not allocated twice
[] threadpool
    [] dynamic queues
[] cluster (multiple event-loops)
*/
class TcpContext extends Context {
    constructor(socket, handlers) {
        super(handlers);
        this.socket = socket;
        socket.on('data', async (data) => {
            // обработка батчей есть
            for await (const packet of decodeMultiStream(data)) {
                this.process(packet);
            }
        })
        socket.on('end', _ => this.ctx.emit('end'))
    }
    
    _send(packet) {
        // батчинг
        // drain механизм
        this.socket.write(encoder.encode(packet));
    }
}

export default function serve(options) {
    const server = net.createServer((socket) => {
        new TcpContext(socket, options.handlers);
    }).on('error', (err) => {
      // Handle errors here.
      throw err;
    });

    // Grab an arbitrary unused port.
    server.listen(options, () => {
        console.log('opened server on', server.address());
    });
}
