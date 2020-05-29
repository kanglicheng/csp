// An unbufferred channel is a channel that has 0 buffer size which lets it blocks on pop() and put() methods.
// Bufferred channel implementation will come later when you or I or we need it. GitHub Issues welcome.
export class UnbufferredChannel {
    constructor() {
        this._closed = false;
        this.popActions = [];
        this.putActions = [];
        this.readyListener = [];
    }
    put(ele) {
        if (this._closed) {
            throw new Error('can not put to a closed channel');
        }
        if (this.readyListener.length > 0) {
            for (let { resolve, i } of this.readyListener) {
                resolve(i);
            }
            this.readyListener = [];
        }
        // if no pop action awaiting
        if (this.popActions.length === 0) {
            return new Promise((resolve) => {
                this.putActions.push({ resolver: resolve, ele });
            });
        }
        else {
            return new Promise((resolve) => {
                let onPop = this.popActions.shift();
                if (onPop === undefined) {
                    throw new Error('unreachable');
                }
                onPop({ value: ele, done: false });
                resolve();
            });
        }
    }
    // checks if a channel is ready to be read but dooes not read it
    // it returns only after the channel is ready
    async ready(i) {
        if (this.putActions.length > 0 || this._closed) {
            return i;
        }
        else {
            return new Promise((resolve) => {
                this.readyListener.push({ resolve, i });
            });
        }
    }
    async pop() {
        let next = this.next();
        if (next instanceof Promise) {
            return (await next).value;
        }
        return next.value;
    }
    next() {
        if (this._closed) {
            return { value: undefined, done: true };
        }
        // console.log('poppers', this.putActions, this.popActions);
        if (this.putActions.length === 0) {
            return new Promise((resolve, reject) => {
                this.popActions.push(resolve);
            });
        }
        else {
            return new Promise((resolve) => {
                let putAction = this.putActions.shift();
                if (putAction === undefined) {
                    throw new Error('unreachable');
                }
                let { resolver, ele } = putAction;
                resolver();
                resolve({ value: ele, done: false });
            });
        }
    }
    // put to a closed channel throws an error
    // pop from a closed channel returns undefined
    // close a closed channel throws an error
    async close() {
        if (this._closed) {
            throw Error('can not close a channel twice');
        }
        // A closed channel always pops { value: undefined, done: true }
        for (let pendingPopper of this.popActions) {
            pendingPopper({ value: undefined, done: true });
        }
        this.popActions = [];
        // A closed channel is always ready to be popped.
        for (let { resolve, i } of this.readyListener) {
            resolve(i);
        }
        this.readyListener = [];
        // A closed channel can never be put
        for (let pendingPutter of this.putActions) {
            throw Error('unreachable');
        }
        this._closed = true;
    }
    closed() {
        return this._closed;
    }
    [Symbol.asyncIterator]() {
        return this;
    }
}
// A shorter name for UnbufferredChannel.
export function chan() {
    return new UnbufferredChannel();
}
// select() is modelled after Go's select statement ( https://tour.golang.org/concurrency/5 )
// and does the same thing and should have identical behavior.
// https://stackoverflow.com/questions/37021194/how-are-golang-select-statements-implemented
export async function select(channels, defaultCase) {
    let promises = channels.map(([c, func], i) => {
        return c.ready(i);
    });
    if (defaultCase) {
        promises = promises.concat([Promise.resolve(promises.length)]);
    }
    let i = await Promise.race(promises);
    if (defaultCase && i === promises.length - 1) {
        return await defaultCase();
    }
    let ele = await channels[i][0].pop();
    return await channels[i][1](ele);
}
export async function last(channel) {
    let current = await channel.pop();
    let _break = false;
    while (!_break) {
        await select([
            [channel, async (ele) => {
                    current = ele;
                }]
        ], async () => {
            _break = true;
            return undefined;
        });
    }
    return current;
}
// A promised setTimeout.
export function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
