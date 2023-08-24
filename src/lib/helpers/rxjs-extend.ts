import { Subject, Observable, SchedulerLike, MonoTypeOperatorFunction, Subscription, asyncScheduler } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * `distribute` is an Rx operator, similar to RxJS operator `share`, or the combination of RxJS `publishReplay` and `refCount`.
 * However, `distribute` differs from both in a few subtle, but important ways.
 *
 * The following is the behaviour of `distribute`:
 *
 * 1. `distribute` will subscribe to the source, when first observers subscribes.
 *
 * 2. While `distribute` stays subscribed to the source, all of its new subscribers
 *    will receive last `replayBufferSize` emissions of the source,
 *    starting from the moment when `distribute` last subscribed to the source
 *
 * 3. When all observers unsubscribe from `distribute`, it will itself unsubscribe from the source.
 *
 * 4. Unsubscribing from the source will happen with the provided scheduler.
 *    Thus, if new observers subscribe to `distribute` before the scheduler fires, source will stay subscribed
 *    and the new subscriber will receive the last emissions from the source.
 *
 * 5. When new observer(s) subscribe to `distribute`, it will re-subscribe to the source with a clear buffer.
 *
 * 6. If the source errs, `distribute` will conduct the error to all observers.
 *
 * 7. After the error, if new observers subscribe to `distribute`, they will not be replayed the old error.
 *    Instead, `distribute` will re-subscribe to its source.
 *
 *
 *
 * The following is the list of differences from `shareReplay` and `publishReplay`+`refCount`
 *
 * 1. `distribute` will unsubscribe from the source when all its own observers unsubscribe.
 *    > This differs from `shareReplay`. Note that `share` does unsubscribe from the source.
 *
 * 2. After `distribute` subscribes from the source due to all of its own observers unsubscribing,
 *    its new subscribers will not receive previous values from the source.
 *    > This differs from `publishReplay`+`refCount`
 *
 * 3. `distribute` will not replay the error to new subscribers. Instead it will re-subscribe to source.
 *    > This differes from `publishReplay`+`refCount`
 *
 * @param replayBufferSize Number of last emissions of the source to be replayed to observers. Default is 0 and will replay all emissions
 * @param scheduler Schedules unsubscription from the source when all children unsubscribe. By default unsubscription happens instantly
 */


export function distribute<T>(replayBufferSize: number = 0, scheduler?: SchedulerLike): MonoTypeOperatorFunction<T> {

    replayBufferSize = replayBufferSize < 0 ? 0 : replayBufferSize;

    return source => {
        let replayBuffer: T[];
        let observerCount: number;
        let bridge: Subject<T>;
        let sourceSubscription: Subscription;
        let sourceSubscribed: boolean;

        reset();

        function reset() {
            sourceSubscribed = false;
            bridge = new Subject();
            observerCount = 0;
            replayBuffer = [];
        }

        function unsubscribeSource() {
            if ( observerCount < 1 ) {
                sourceSubscription.unsubscribe();
                reset();
            }
        }

        return new Observable(observer => {
            replayBuffer.forEach(observer.next.bind(observer));
            const subscription = bridge.subscribe(observer);
            if ( !observerCount++ && !sourceSubscribed ) {
                sourceSubscription = source.pipe(
                    tap(value => {
                        replayBuffer.push(value); // Put the value at the end of the buffer
                        if ( replayBufferSize ) { // If buffer maxium size is specified,
                            replayBuffer.splice(0, replayBuffer.length - replayBufferSize); // make sure buffer stays under max size
                        }
                    })
                ).subscribe(bridge);
                sourceSubscribed = true;
            }
            return function taredown() {
                subscription.unsubscribe();
                if ( --observerCount < 1 ) {
                    if ( scheduler ) {
                        scheduler.schedule(unsubscribeSource);
                    } else {
                        unsubscribeSource();
                    }
                }
            };
        });
    };
}

/**
 * Retry an observable for a specific number of consecutive errors.
 * If, during a retry, a value is emitted by the source, error count is reset to 0.
 *
 * @param consecutiveErrorLimit Number of errors to forgive
 * @param retryDelay number of milliseconds to delay
 */

export function retryReset<T>(consecutiveErrorsToForgive: number, retryDelay: number = 0): MonoTypeOperatorFunction<T> {
    return source => {
        return new Observable<T>(observer => {

            let consecutiveErrors = 0;
            let subscription: Subscription;
            let schedule: Subscription;
            subscription = subscribeToSource();

            function subscribeToSource() {
                return source.subscribe({
                    next(value) { consecutiveErrors = 0; observer.next(value); },
                    error(e) {
                        if ( consecutiveErrorsToForgive < 0 || ++consecutiveErrors <= consecutiveErrorsToForgive ) {
                            // Re-subscribe to source
                            schedule = asyncScheduler.schedule(() => {
                                schedule = null;
                                subscription = subscribeToSource();
                            }, retryDelay);
                        } else {
                            // Do not re-subscribe to source.
                            observer.error(e); // Instead, propagate the error to subscribers
                        }
                    },
                    complete() { observer.complete(); }
                });
            }
            return function taredown() {
                if ( schedule ) {
                    schedule.unsubscribe();
                }
                subscription.unsubscribe();
            };
        });
    };
}
