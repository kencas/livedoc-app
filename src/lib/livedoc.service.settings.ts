
export const LIVEDOC_DEFAULT_SETTINGS = {

    /* Location of the configuration file. Must conform to interface LiveDocConfig declared in `./livdoc.interface` */
    // configUrl: '',

    /* When all STOMP subscriptions are closed for a WS socket,
    the socket may be closed or kept open until all sockets are closed explicitely */
    keepWsOpen: false,

    /* This service can throttle emissions on all streams. */
    throttle: true,

    /* If throttling is enabled above, emission of a new value will be delayed for the period specified by this setting.
    If, during this pause (or a throttle period), any newer values are received,
    the last such value will be emitted when the throttle period ends.
    The latest value is always emitted with the maximum delay, specified by `throttleTime` */
    throttleTime: 300, // Milliseconds

    // Number of times to retry each STOMP subscription before quiting. Use any negative number for retrying infinitely
    retryCount: 10,

    // Delay, in milliseconds, for retrying
    retryDelay: 2000,


    // Controls the level of detail logged to console
    logLevel: 'none' as 'none' | 'some' | 'all'

};
