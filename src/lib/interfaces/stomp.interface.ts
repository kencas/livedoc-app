export interface StompHeaders {
    login?: string;
    passcode?: string;
    host?: string;
    id?: string;
    subscription?: string;
    'message-id'?: string;
    'content-length'?: string | number;

    [key: string]: string | number;
}

export type StompFrame<T = any> = StompConnectedFrame | StompMessageFrame<T> | StompErrorFrame | StompReceiptFrame;

interface StompBaseFrame {
    headers: StompHeaders;
    body: string;
}

export interface StompConnectedFrame extends StompBaseFrame {
    command: 'CONNECTED';
}
export interface StompMessageFrame<T> extends StompBaseFrame {
    command: 'MESSAGE';
    destination: string;
    'message-id': string;
    subscription: string;
    ack(headers?: StompHeaders): void; // Acknowledge consumption of the message
    nack(headers?: StompHeaders): void; // Negative Acknowledgement - Client did not consume the message
}
export interface StompErrorFrame extends StompBaseFrame {
    command: 'ERROR';
}
export interface StompReceiptFrame extends StompBaseFrame {
    command: 'RECEIPT';
    'receipt-id': string;
}

/* Type `StompClient` is generic and takes a parameter type `Spam`.
   Parameter type `Spam` represents the type of received "unsolicited" messages,
   which are not designated to any subscription.
   Such "unsolicited" are processed by method onreceipt
*/
export interface StompClient<Spam = never> {

    counter: number;
    connected: boolean;
    ws: WebSocket;
    heartbeat: {
        outgoing: number;
        incoming: number;
    };
    maxWebSocketFrameSize: number;
    subscriptions: {
        [key: string]: (messageFrame: StompMessageFrame<any>) => void
    };

    connect(
        headers: StompHeaders,
        connectCallback: (connectFrame: StompConnectedFrame) => void,
        errorCallback?: (errorFrame: StompErrorFrame) => void
    ): void;
    connect(
        login: string,
        passcode: string,
        connectCallback: (connectFrame: StompConnectedFrame) => void,
        errorCallback?: (errorFrame: StompErrorFrame) => void,
        host?: string
    ): void;

    disconnect(): void;
    disconnect<T>(
        disconnectCallback: () => T,
        headers?: StompHeaders
    ): T;

    send(
        destination: string,
        headers?: StompHeaders,
        body?: string
    ): void;

    subscribe<T = any>(
        destination: string,
        callback: (messageFrame: StompMessageFrame<T>) => void,
        headers?: StompHeaders,
    ): {
        id: string;
        unsubscribe: () => void;
    };

    /**
     * Stomp Client has debug handler, which automatically log messages to console.
     * This can be overriden by assigning a custom function.
     * To disable, assign null, undefined, dummy function, or anything other than a function.
     */
    debug?(message: string): void;

    // Optinally, add this handler to process all incoming MESSAGE frames, not addressed to a subscription
    onreceive?(messageFrame: StompMessageFrame<Spam>): void;

    // Optionally, add this handler to process all incoming RECEIPT frames
    onreceipt?(receiptFrame: StompReceiptFrame): void;
}
