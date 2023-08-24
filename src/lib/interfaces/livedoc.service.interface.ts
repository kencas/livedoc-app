import { Observable } from 'rxjs';

import { LIVEDOC_DEFAULT_SETTINGS } from '../livedoc.service.settings';
import { StompClient, StompConnectedFrame, StompHeaders } from './stomp.interface';



type LiveDocFullSettings = typeof LIVEDOC_DEFAULT_SETTINGS;

/* LiveDoc Settings is used to define the basic behaviour of the service,
and must be provided to (injected into) the LiveDoc Service at its
instanciation.
LiveDoc Settings is distinct from LiveDoc Config, which specifies
LiveDoc servers for different document types.
*/
export type LiveDocSettings =
    {configUrl: string} & // Must include `confgiUrl` key,
    Partial<LiveDocFullSettings>; // and may optinally include other keys


/* Configuration object, presumably supplied by the Back-End, informing Front-End
   about the available LiveDoc servers, including types of documents each server manages */
export interface LiveDocConfig {
    servers: LiveDocServerConfig[];
}

/* Configuration information of a single LiveDoc server */
export interface LiveDocServerConfig {
    name?: string; // Optional name for the server - for human readability only
    uri: string; // WS URI of the server
    default?: boolean; // Default server manages all documents not explicitly assigned to a specific server
    prefixes?: string[]; // Destination prefixes.
    /* Sample prefix matching for prefix "main/doc":
            Documents Matching Prefix "main/doc"      Documents NOT Matching Prefix "main/doc"
             - "main/doc"                              - "main/docs" (trailing 's' without slash)
             - "main/doc/"                             - "main/do" (missing 'c' at the end)
             - "main/doc/123"                          - "Main/Doc" (wrong capitalisation)
             - "main/doc/anything/nested/"             - "remain/doc" (extra characters at the front)
    */

   headers?: StompHeaders; // Any STOMP headers required for this server to start STOMP connection
   comments?: string;
   secure?: boolean; // If a server needs authentication token
   transports?: Transport[];
}

export type Transport = 'websocket' | 'xdr-streaming' | 'xhr-streaming' | 'iframe-eventsource' | 'iframe-htmlfile' | 'xdr-polling' | 'xhr-polling' | 'iframe-xhr-polling' | 'jsonp-polling';

export type LiveDocServerDialerState = 'Disconnected' | 'Connecting' | 'Connected' | 'Error';

/* Structure necessary for managing WS connection with a specific LiveDoc server */
export interface LiveDocServerDialer {
    server: LiveDocServerConfig;
    state: LiveDocServerDialerState;
    client?: StompClient<never>;
    connection?: Observable<StompConnectedFrame>;
}

/* Includes structures necessary for managing WS connections with all LiveDoc servers */
export interface LiveDocCallCenter {
    configuration: LiveDocConfig;
    serverNotFoundErrorCount: number; // Number of errors where server responsible for a document was not found
    dialers: LiveDocServerDialer[];
}

/* Information on WS connection states accross all available LiveDoc servers */
export interface CallCenterStats {
    total: number; // All available servers (or their corresponding dialers) - regardless of current state
    disconnected: number; // Number of servers (or their corresponding dialers) in the idle state - not connected
    connecting: number; // Number of (dialers with) connections that are currently in the process of being opened
    connected: number; // Number of (dialers with) active connections
    error: number; // Number of (dialers with) broken connections
    serverNotFoundErrorCount: number;  // Number of errors where server responsible for a document was not found
}

export type LiveDocDeltaHandlingStrategy<T> = (previous: T, current: T) => T;
