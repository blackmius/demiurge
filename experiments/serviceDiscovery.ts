import { Context, Handlers, events } from "../src/rpc.ts";

interface Node {
    id: string
    hostname: string
    port: number
    services: string[]
}

const nodeByCtx = new WeakMap<Context, Node>();
const nodesByid: Record<string, Node> = {};
const nodesByService: Record<string, Set<string>> = {};

function deleteNode(node: Node) {
    delete nodesByid[node.id];
    node.services.forEach(service => {
        nodesByService[service].delete(node.id);
    });
}

function registerNode(node: Node) {
    nodesByid[node.id] = node;
    node.services.forEach(service => {
        nodesByService[service] ??= new Set();
        nodesByService[service].add(node.id);
    });
}

const siblings: Record<string, Context> = {}

// TODO: надо придумать interconnect который собирает в себя broadcast, отслеживание за Nodes создание слушателя
// 
async function broadcast(method: string, ...args: any[]) {
    const other = nodesByService['ServiceDiscovery'];
    if (other === undefined) return;
    for (const nodeId of other) {
        const node = nodesByid[nodeId];
        if (siblings[nodeId] === undefined) {
            const conn = await Deno.connect({ hostname: node.hostname, port: node.port });
            const ctx = new Context(conn, conn, handlers);
            ctx.listen();
            siblings[nodeId] = ctx;
        }
        const ctx = siblings[nodeId];
        ctx.send(method, ...args);
    }
}

const handlers: Handlers = {
    register(node: Node) {
        // TODO: продумать что делать, если кто-то решил 2 раза прислать
        if (nodeByCtx.has(this) || nodesByid[node.id]) return;
        registerNode(node);
        nodeByCtx.set(this, node);
        if (node.services.includes('ServiceDiscovery')) {
            siblings[node.id] = this;
        }
        broadcast('gossipNodeRegistered', node);
    },
    getNodes(): Node[] {
        return Object.values(nodesByid);
    },
    getNode(id: string): Node | undefined {
        return nodesByid[id];
    },
    getNodesByService(service: string): Node[] {
        return [...(nodesByService[service] ?? [])].map(nodeId => nodesByid[nodeId]);
    },
    gossipNodeRegistered(node: Node) {
        registerNode(node);
    },
    gossipNodeDeleted(node: Node) {
        deleteNode(node);
    }
};

events.on('closed', ctx => {
    const node = nodeByCtx.get(ctx);
    if (node === undefined) return;
    deleteNode(node);
    delete siblings[node.id];
    broadcast('gossipNodeDeleted', node);
});

const listener = Deno.listen({ port: 6548 });
for await (const conn of listener) {
    const ctx = new Context(conn, conn, handlers);
    ctx.listen();
}