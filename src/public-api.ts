/*
 * Public API Surface of livedoc
 */

export {
    LiveDocConfig,
    LiveDocSettings,
    LiveDocDeltaHandlingStrategy,
    CallCenterStats,
} from './lib/interfaces/livedoc.service.interface';
export { LIVEDOC_SETTINGS } from './lib/livedoc.injection-token';
export { StompHeaders } from './lib/interfaces/stomp.interface';
export { LiveDocService } from './lib/livedoc.service';
export { LiveDocConfigLoaderService } from './lib/livedoc-config-loader.service';
