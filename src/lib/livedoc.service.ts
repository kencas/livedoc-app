import { Injectable, Inject, Optional } from '@angular/core';

import { Observable, Subject, combineLatest, fromEventPattern, of, throwError, asyncScheduler } from 'rxjs';
import {
    startWith,
    map,
    scan,
    switchMap,
    distinctUntilChanged,
    shareReplay,
    withLatestFrom,
    share,
    throttleTime,
    takeUntil,
    tap,
    filter,
} from 'rxjs/operators';
import { distribute, retryReset } from './helpers/rxjs-extend';

import { applyPatch, Operation } from 'fast-json-patch';
import SockJS from 'sockjs-client/dist/sockjs.js';
import { Stomp } from 'stompjs/lib/stomp.js';

import {
    LiveDocConfig, // Defines LiveDoc servers for document types.
    LiveDocSettings, // Defines basic behaviour, e.g. how to find LiveDocConfig
    CallCenterStats,
    LiveDocCallCenter,
    LiveDocServerDialer,
    LiveDocServerDialerState,
    LiveDocDeltaHandlingStrategy
} from './interfaces/livedoc.service.interface';
import { LiveDocConfigLoaderService } from './livedoc-config-loader.service';
import { LiveDocConfigLoaderServiceInterface } from './interfaces/livedoc-config-loader.interface';
import { StompClient, StompHeaders, StompConnectedFrame, StompErrorFrame, StompMessageFrame } from './interfaces/stomp.interface';
import { SimpleCache } from './helpers/simple-cache';

import { LIVEDOC_DEFAULT_SETTINGS } from './livedoc.service.settings';
import { LIVEDOC_AUTH_TOKEN$, LIVEDOC_SETTINGS } from './livedoc.injection-token';
import { timedlog } from './helpers/timedlog';

// Identity combinator
const I = <T>(a: T) => a;

@Injectable({
    providedIn: 'root'
})
export class LiveDocService {

    connectionStatistics: Observable<CallCenterStats>;

    private connectionStateUpdate = new Subject<void>();
    private callCenter: Observable<LiveDocCallCenter>;

    private socketTerminator = new Subject<void>();
    private sender = new Subject<{destination: string, headers?: StompHeaders, body?: string}>();

    /* Cache of observables representing PARTIAL STOMP subscription: for specific combination of
       destination and headers, but ignoring Delta Merging Strategy. This stream does not include retry on error. */
    private partialStompStreams = new Map<string, Observable<any>>();

    /* Cache of observables representing FULL STOMP subscription: for specific combination of
       destination, headers, and the Delta Merging Strategy. This stream also includes retry on error. */
    private fullStompStreams = new SimpleCache<Observable<any>, {
        document: string;
        headers?: StompHeaders;
    }, LiveDocDeltaHandlingStrategy<any>>();

    liveDocSettings: LiveDocSettings;
    logLevel: number;

    constructor(
        livedocConfigLoaderService: LiveDocConfigLoaderService, // LiveDocConfigLoaderMockService
        @Optional() @Inject(LIVEDOC_SETTINGS) liveDocSettings: LiveDocSettings,
        @Optional() @Inject(LIVEDOC_AUTH_TOKEN$) private authToken: Observable<string>,
    ) {
        this.liveDocSettings = Object.assign({}, LIVEDOC_DEFAULT_SETTINGS, liveDocSettings);
        this.logLevel = this.numericLogLevel(this.liveDocSettings.logLevel);
        this.setupCallCenterStream(livedocConfigLoaderService);
        this.setupSenderStream(); // Needs callCenter stream to be already set up
        this.setupConnectionStatisticsStream(); // Needs callCenter stream to be already set up
    }

    private setupConnectionStatisticsStream() {
        this.connectionStatistics = combineLatest([
            this.callCenter,
            this.connectionStateUpdate.pipe(startWith(null as void))
        ]).pipe(
            map(([callCenter, ]) => this.getConnectionStatistics(callCenter)),
            distinctUntilChanged(this.connectionStatsAreSame),
            share()
        );
    }

    /** Compares Call Center statistics, past to present. Used for not emitting same statistics multiple times consuqutively */
    private connectionStatsAreSame(stats1: CallCenterStats, stats2: CallCenterStats) {
        return Object.getOwnPropertyNames(stats1)
            .every(property => stats1[property] === stats2[property]);
    }

    private getConnectionStatistics(callCenter: LiveDocCallCenter): CallCenterStats {
        return callCenter.dialers.map(server => server.state).reduce((stats, state) => ({
            total: stats.total + 1,
            disconnected: stats.disconnected + (state === 'Disconnected' ? 1 : 0),
            connecting: stats.connecting + (state === 'Connecting' ? 1 : 0),
            connected: stats.connected + (state === 'Connected' ? 1 : 0),
            error: stats.error + (state === 'Error' ? 1 : 0),
            serverNotFoundErrorCount: stats.serverNotFoundErrorCount
        }), {
            total: 0,
            disconnected: 0,
            connecting: 0,
            connected: 0,
            error: 0,
            serverNotFoundErrorCount: callCenter.serverNotFoundErrorCount
        });
    }

    getConnectionStatus(document: string) {
        return combineLatest([
            this.callCenter,
            this.connectionStateUpdate.pipe(startWith(null as void))
        ]).pipe(
            map(([callCenter, ]) => this.findServerDialer(document, callCenter)?.state),
            scan((prevState, newState) => prevState === 'Error' && newState !== 'Connected' ? prevState : newState),
            distinctUntilChanged()
        );
    }

    private setupCallCenterStream(livedocConfigLoaderService: LiveDocConfigLoaderServiceInterface) {
        this.callCenter = livedocConfigLoaderService.load().pipe(
            map(this.prepareCallCenter),
            shareReplay(1) // Do not unsubscribe from source when all children unsubscribe
        );
    }

    private prepareCallCenter(configuration: LiveDocConfig): LiveDocCallCenter {
        const dialers: LiveDocServerDialer[] = configuration.servers.map(serverConfig => ({
            server: serverConfig,
            client: null, // Client will be created before actually trying to establish the connection
            state: 'Disconnected' as 'Disconnected'
        }));

        return {
            configuration,
            serverNotFoundErrorCount: 0,
            dialers
        };
    }


    private setupSenderStream() {
        this.sender.pipe(
            withLatestFrom(this.callCenter)
        ).subscribe(([{destination, headers, body}, callCenter]) => {
            let dialers: LiveDocServerDialer[];
            if ( destination ) {
                const matchingDialer = this.findServerDialer(destination, callCenter);
                dialers = matchingDialer ? [matchingDialer] : [];
            } else {
                dialers = callCenter.dialers;
            }
            dialers
                .filter(dialer => dialer.state === 'Connected') // Find dialers with active connections
                .forEach(dialer => dialer.client.send(destination, headers, body)); // Send through dialers
        });
    }

    /** Closes all open WS sockets and terminates all subscriptions */
    closeAllSockets() {
        this.socketTerminator.next();
    }

    /**
     * Send message to connected servers.
     *
     * @param destination If destination if falsy, send to all connected servers. Otherwise - only to connected server matching destination
     */
    send(params: {destination: string, headers?: StompHeaders, body?: string}): void;
    send(destination: string, headers?: StompHeaders, body?: string): void;
    send(destination: string | {destination: string, headers?: StompHeaders, body?: string}, headers?: StompHeaders, body?: string) {

        const parameters = typeof destination === 'object' ? destination : {destination, headers, body};

        this.sender.next(parameters);
    }

    /**
     * Get observable which allows subscribing to a specific STOMP destination
     */
    getStream<T = any>(params: {
        document: string;
        headers?: StompHeaders,
        deltaHandlingStrategy?: LiveDocDeltaHandlingStrategy<T>,
        notFromCache?: boolean
    }): Observable<T>;
    getStream<T = any>(
        document: string,
        headers?: StompHeaders,
        deltaHandlingStrategy?: LiveDocDeltaHandlingStrategy<T>,
        notFromCache?: boolean
        ): Observable<T>;
    getStream<T = any>(
        document: string | {
            document: string;
            headers?: StompHeaders,
            deltaHandlingStrategy?: LiveDocDeltaHandlingStrategy<T>,
            notFromCache?: boolean
        },
        headers?: StompHeaders,
        deltaHandlingStrategy?: LiveDocDeltaHandlingStrategy<T>,
        notFromCache?: boolean
    ): Observable<T> {

        const parameters = typeof document === 'object' ? document : { document, headers, deltaHandlingStrategy, notFromCache };

        if ( typeof parameters.deltaHandlingStrategy !== 'function' ) {
            parameters.deltaHandlingStrategy = null; // Avoid undefined for correct operation of the hash. Also other garbage
        }

        const keyHashed = this.fullStompStreams.simpleHash({document: parameters.document, headers: parameters.headers});
        // Check if the cache already has a stream for this exact set of parameters: destination, header, delta strategy

        let partialStream: Observable<T>;

        if ( ! parameters.notFromCache ) {
            const cachedFullStream: Observable<T> = this.fullStompStreams.getAssetByHashAndPass(
                keyHashed,
                parameters.deltaHandlingStrategy
            );
            if ( cachedFullStream ) { // So, do we have a cached stream?
                return cachedFullStream; // return the cached stream
            }

            // There is no cached stream for full set of parameters. Let's now try just destination and headers.
            const cachedPartialStream: Observable<T> = this.partialStompStreams.get(keyHashed);

            if ( cachedPartialStream ) {
                // There is a STOMP subscription with the same destination and headers, but without current Delta Strategy
                // Just add the Delta Mergin Strategy and retry later, before returning
                partialStream = cachedPartialStream;
            }
        }

        if ( ! partialStream ) {
            // There is no STOMP subscription, which could be used for this stream. Must create new STOMP subscription
            partialStream = combineLatest([
                this.callCenter,
                of(parameters)
            ]).pipe(
                switchMap(([callCenter, params]) => {
                    const dialer = this.findServerDialer(params.document, callCenter);

                    if ( ! dialer ) {
                        ++callCenter.serverNotFoundErrorCount;
                        return throwError(new Error(`Cannot find LiveDoc server for document ${params.document}`));
                    }

                    let serverConnection: Observable<StompConnectedFrame>;

                    /* Does client already exist and is usable - that is, not closing or closed? (Latter includes errors)
                       (readyState < 2) captures these values:
                         `null` - WS not yet open (SockJS undocumented feature),
                         `0` - WS connecting. (official spec) https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
                         `1` - WS open (official spec)
                    */
                    if ( dialer.client && dialer.client.ws.readyState < 2 ) {
                        serverConnection = dialer.connection;
                    } else {
                        serverConnection = dialer.connection = this.connectServer(dialer, dialer.server.headers);
                    }

                    return serverConnection.pipe(
                        switchMap(() => this.subscribeStompClient<T>(dialer.client, params.document, this.shallowClone(params.headers))),
                        map<StompMessageFrame<Operation[]>, Operation[]>(frame => JSON.parse(frame.body)),
                        scan<Operation[], T>((livedoc, patch) => applyPatch<T>(livedoc, patch, false, false).newDocument, {} as T )
                    );
                }),
                distribute(1, asyncScheduler)
            );

            // Add partialStream into the cache
            this.partialStompStreams.set(keyHashed, partialStream);
        }

        // First, add Delta Merging Strategy to the partial stream
        let partialWithDelta: Observable<T>;
        if ( ! parameters.deltaHandlingStrategy ) {
            // No delta handling strategy - thus no need to add anything to the partial stream, and it is already cached
            partialWithDelta = partialStream;
        } else {
            partialWithDelta = partialStream.pipe(
                scan((previous, current) => parameters.deltaHandlingStrategy(previous, current))
            );
        }

        // Finally, add error handling
        const newFullStream = partialWithDelta.pipe(
            retryReset(this.liveDocSettings.retryCount, this.liveDocSettings.retryDelay),
            // retryWhen(errorStream => errorStream.pipe(
            //     switchMap((error, index) => 0 <= index && index < LIVEDOC_SETTINGS.retryCount // Delay or throw?
            //         ? timer(LIVEDOC_SETTINGS.retryDelay) // Must delay retry
            //         : throwError(error) // Must throw this error here, otherwise retryWhen will piecefully complete the observable
            //     )
            // )),
            this.liveDocSettings.throttle // Should we throttle?
                ? throttleTime(this.liveDocSettings.throttleTime, asyncScheduler, {leading: true, trailing: true})
                : I, // No throttling - then keep the stream the same (Identity )
            distribute(1, asyncScheduler)
        );


        // Add newFullStream into the cache
        this.fullStompStreams.blindlyAddAssetByLock(newFullStream, {keyHashed, pass: parameters.deltaHandlingStrategy});

        return newFullStream;
    }

    /** Find Dialer for the server, responsible for a specific document */
    private findServerDialer(document: string, callCenter: LiveDocCallCenter): LiveDocServerDialer {
        return callCenter.dialers.find( // Find server that explictely matches the destination
            dialer => dialer.server.prefixes && dialer.server.prefixes.some(prefix => matchPrefix(prefix, document))
        )
        ||
        callCenter.dialers.find( dialer => dialer.server.default ); // or, otherwise the default server

        /** Match document to prefix - Used to find a server responsible for the document. */
        function matchPrefix(prefix: string, title: string): boolean {
            return title === prefix || title.startsWith(prefix + '/');
        }
    }

    private connectServer(dialer: LiveDocServerDialer, headers: StompHeaders = {}) {

        const rawConnection = fromEventPattern<{ message: StompConnectedFrame } | { error: StompErrorFrame | string }>(
            handler => {
                this.updateDialerState(dialer, 'Connecting');
                const transports =
                    typeof dialer.server.transports === 'string' ? [dialer.server.transports] :
                    Array.isArray(dialer.server.transports) ? dialer.server.transports :
                    null;
                const options = transports && {transports};
                console.log("Dialer", dialer)
                dialer.client = Stomp.over(new SockJS(dialer.server.uri, null, options));

                dialer.client = Stomp.over(new SockJS(dialer.server.uri));

                dialer.client.debug = this.logLevel ? timedlog : undefined;
                console.log("Headers", headers)
                dialer.client.connect(
                    headers,
                    message => (handler({message}), this.updateDialerState(dialer, 'Connected')),
                    error => (handler({error}), this.updateDialerState(dialer, 'Error'))
                );
                return dialer.client;
            },
            (handler, stompClient: StompClient<never>) => {
                if ( this.logLevel ) {
                    timedlog(
                        '%cSocket Tare Down%c',
                        'color:white;background:red;margin-top:24px;padding:10px;font-size:24px;border-radius:8px;',
                        '', 'readyState:', stompClient.ws.readyState, 'URL:', stompClient.ws.url,
                    );
                }
                try {
                    if ( stompClient.ws.readyState < 2 ) {
                        stompClient.disconnect();
                        this.updateDialerState(dialer, 'Disconnected');
                    }
                } catch (e) {
                    console.warn('LiveDoc encountered the following error while dicsonnecting from STOP socket:\n', e);
                }
            }
        ).pipe(
            switchMap(result => 'error' in result ? throwError(result.error) : of(result.message)),
        );

        const connectionAuthorized = ! (dialer.server.secure && this.authToken)
            ? rawConnection
            : combineLatest([ rawConnection, this.authToken ]).pipe(
                tap(([result, token]) => dialer.client.send('', null, token)),
                filter(( _ , i) => ! i), // Use only firt emission: when WS connection is established
                map(([result, token]) => result)
            );

        return connectionAuthorized.pipe(
            takeUntil(this.socketTerminator),
            this.liveDocSettings.keepWsOpen // Should WebSocket be kept open?
                ? shareReplay(1) // Yes - use shareReplay(), which keeps subscribed to source even when all its observers unsubscribe
                : distribute(1, asyncScheduler) // No - use custom operator `distribute`, which unsubscribes from source as needed
        );

    }

    private subscribeStompClient<T>(client: StompClient<never>, document: string, headers: StompHeaders = {}) {
        return fromEventPattern<StompMessageFrame<Operation[]>>(
            handler => {
                return client.subscribe(
                    document,
                    handler as (messageFrame: StompMessageFrame<T>) => void,
                    headers
                );
            },
            (handler, subscription: {id: string, unsubscribe: () => void}) => {
                subscription.unsubscribe();
            }
        );
    }

    private updateDialerState(dialer: LiveDocServerDialer, state: LiveDocServerDialerState) {
        dialer.state = state;
        this.connectionStateUpdate.next();
    }

    private numericLogLevel(logLevelName: Pick<LiveDocSettings, 'logLevel'>['logLevel']): number {
        switch (logLevelName) {
            case 'none': return 0;
            case 'some': return 100;
            case 'all' : return 1000;
            default: return 0;
        }
    }

    private shallowClone<T extends object>(obj: T) {
        return Object.entries(obj || {}).reduce((clone, [key, value]) => (clone[key] = value, clone), {} as T);
    }

}
