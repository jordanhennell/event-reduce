import { action, observable } from 'mobx';
import { combineEventAndObservable, IObservableEvent } from "./events";
import { createSubscriptionObserver, IObservable, IObserver, ISubscription } from './observable';
import { accessed, IReduction } from "./reduction";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    return {
        set(this: any, value: any) {
            let reduction = accessed.reductions.pop()!;
            if (typeof key == 'string')
                setReducedProperty(this, key, reduction);
            let box = observable.box(reduction.value, { name: String(key), deep: false });
            reduction.subscribe(value => box.set(value));
            Object.defineProperty(this, key, { get: () => box.get(), enumerable: true });
        }
    };
}

let reducedProperties = Symbol('ReducedProperties');

export function getReducedProperties(target: any) {
    return target[reducedProperties] as { [key: string]: IReduction<any> };
}

export function setReducedProperty(target: any, key: string, reduction: IReduction<any>) {
    (target[reducedProperties] || (target[reducedProperties] = {}))[key] = reduction;
}

export let events = <T extends { new(...args: any[]): any }>(target: T): T => {
    const className = (target as any).displayName || target.name;
    return {
        [className]: class extends target {
            constructor(...args: any[]) {
                super(...args);
                Object.keys(this).forEach(key => {
                    let prop = this[key];
                    if (isObservableEvent(prop)) {
                        let wrappedEvent = action(key, (item: any) => prop(wrapAsync(key, item)));
                        this[key] = combineEventAndObservable(wrappedEvent, prop.asObservable());
                    }
                });
            }
        }
    }[className];
}

function wrapAsync(name: string, async: any): any {
    if (isObservable(async)) {
        return Object.assign(Object.create(async), {
            subscribe(nextOrObserver: IObserver<any> | ((value: any) => void), error?: (error: any) => void, complete?: () => void): ISubscription {
                let observer = createSubscriptionObserver(nextOrObserver, error, complete);
                return async.subscribe(
                    value => isObservable(value)
                        ? wrapAsync(name, value)
                        : action(name + '.merge', observer.next)(value)
                    ,
                    action(name + '.errored', observer.error),
                    action(name + '.completed', observer.complete)
                );
            }
        });
    }

    if (isPromise(async))
        return Object.assign(Object.create(async), {
            then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
                return wrapAsync(name, async.then(
                    onfulfilled && action(name + '.resolved', onfulfilled),
                    onrejected && action(name + '.rejected', onrejected)));
            },

            catch(onrejected?: (reason: any) => any): Promise<any> {
                return this.then(undefined, onrejected);
            }
        });

    return async;
}

function isObservableEvent(e: any): e is IObservableEvent<any, any> {
    return typeof e === 'function' && !!e.subscribe;
}


function isObservable(o: any): o is IObservable<any> {
    return typeof o === 'object' && typeof o.subscribe === 'function';
}

function isPromise(p: any): p is Promise<any> {
    return typeof p === 'object' && typeof p.then === 'function'
}