// modified https://deno.land/x/event_emitter@1.0.0

interface EventListener<T> {
    once?: boolean
    callback: T[keyof T]
}

/** Strictly typed Event Emitter for Deno. */
class EventEmitter<T> {
    private readonly cache = new Map<keyof T, EventListener<T>[]>()

    public on<Event extends keyof T> (event: Event, callback: T[Event]) {
        this.push(event, {callback})
    }

    public once<Event extends keyof T> (event: Event, callback: T[Event]) {
        this.push(event, {once: true, callback})
    }

    /**
     * Removes listener(s) from targeted event.
     * By default it gonna delete all listeners from particular event. You can delete specific listener by parsing it as second parameter.
     * It gonna return boolean value depending on result.
     */
    public off<Event extends keyof T> (event: Event, callback?: T[Event]): boolean {
        if (!callback) return this.cache.delete(event)
        let bucket = this.cache.get(event)
        if (!bucket) return false
        bucket = bucket.filter(item => item.callback !== callback)
        this.cache.set(event, bucket)
        return true
    }

    /** Synchronously calls each of the registered listeners (callbacks) in order. */
    // deno-lint-ignore no-explicit-any
    public emit (event: keyof T, ...args: any) {
        let bucket = this.cache.get(event)
        if (!bucket) return
        // deno-lint-ignore ban-types
        for (const item of bucket.values()) (item.callback as unknown as Function)(...args)
        bucket = bucket.filter(item => !item.once)
        this.cache.set(event, bucket)
    }

    private push (slot: keyof T, item: EventListener<T>) {
        const bucket = this.cache.get(slot) ?? []
        bucket.push(item)
        this.cache.set(slot, bucket)
    }
}

export { EventEmitter }
export type { EventListener }