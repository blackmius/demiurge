import { Context, Handlers } from "../src/rpc.ts";

type CID = string;
type PID = `${CID}.${number}`;
type LocalPID = number;

interface Node {
    id: CID
    hostname: string
    port: number
    processNames: ProcessName[]
}

type Process = Record<string, any>;
type ProcessConstructor = (...args: any) => Process;

let node: Node;
const nodes: Record<CID, Node> = {};

let _pid = 0;

type ProcessName = string;
const processConstructors: Record<ProcessName, ProcessConstructor> = {};
const processes: Record<LocalPID, Process> = {};

const handlers: Handlers = {
    async spawn(processName: ProcessName, ...args: any[]) {
        const pid = _pid++;
        processes[pid] = new processConstructors[processName](...args);
        return pid;
    },
    async call(pid: number, method: string, ...args: any[]) {
        return await processes[pid][method](...args);
    },
    nodeUpdated(node) {
        nodes[node.id] = node;
    },
    getNodeInfo(id: string) {
        if (id !== undefined) {
            return nodes[id]
        }
        return node;
    }
};

const clients: Record<CID, Context> = {};
async function createContext(conn: Deno.Conn) {
    const ctx = new Context(conn, conn);
    ctx.handlers = handlers;
    ctx.listen();

    const node = await ctx.call('getNodeInfo') as Node;
    nodes[node.id] = node;
    clients[node.id] = ctx;

    ctx.onclosed = () => {
        delete clients[node.id];
        delete nodes[node.id];
    };

    return ctx;
}

export async function start(options: Deno.ListenOptions) {
    node = {
        id: crypto.randomUUID(),
        hostname: options.hostname!,
        port: options.port,
        processNames: Object.keys(processConstructors)
    };
    clients[node.id] = {
        call(method, ...args) { return handlers[method](...args) },
        send(method, ...args) { handlers[method](...args) }
    }
    nodes[node.id] = node;
    const listener = Deno.listen(options);
    for await (const conn of listener) {
        createContext(conn);
    }
}

export async function connect(options: Deno.ConnectOptions) {
    const conn = await Deno.connect(options);
    await createContext(conn);
}

export function registerProcess(name: string, constructor: ProcessConstructor) {
    processConstructors[name] = constructor;
    if (node) node.processNames.push(name);
    Object.values(clients).forEach(client => {
        client.send('nodeUpdated', node);
    });
}

export async function spawn(processName: string, ...args: any[]) {
    const cantidates: Node[] = [];
    Object.values(nodes).forEach(node => {
        if (node.processNames.includes(processName)) {
            cantidates.push(node);
        }
    })
    if (cantidates.length === 0) {
        throw new Error(`not found any node that can run ${processName}`);
    }
    const node = cantidates[Math.floor(Math.random()*cantidates.length)];
    const pid = await clients[node.id].call('spawn', processName, ...args);
    return node.id+'.'+pid;
}


async function getCtx(nodeId: CID): Promise<Context> {
    const ctx = clients[nodeId];
    if (ctx !== undefined) return ctx;
    let node: Node | undefined;
    for (const client of Object.values(clients)) {
        // TODO: придумать Node задачей которого будет собирать id остальных
        node = await client.call('getNodeInfo', nodeId) as Node;
        if (node) break;
    }
    if (node === undefined) {
        throw new Error('not found CID: ' + nodeId);
    } else {
        await connect({hostname: node.hostname, port: node.port})
    }
    return clients[nodeId];
}

export async function call(pid: PID, method: string, ...args: any[]) {
    const [nodeId, _pid] = pid.split('.'); 
    const ctx = await getCtx(nodeId);
    return await ctx.call('call', _pid, method, ...args);
}

export async function send(pid: PID, method: string, ...args: any[]) {
    const [nodeId, _pid] = pid.split('.');
    const ctx = await getCtx(nodeId);
    return ctx.send('call', _pid, method, ...args);
}