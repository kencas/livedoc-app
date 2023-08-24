import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { LiveDocSettings } from './interfaces/livedoc.service.interface';

export const LIVEDOC_SETTINGS = new InjectionToken<LiveDocSettings>('LiveDoc Settings');

/** Injects stream of Authentication tokens which will be sent down the Web Sockets
 *  for "secure" servers (servers that require authentication) */
export const LIVEDOC_AUTH_TOKEN$ = new InjectionToken<Observable<string>>('Authentication Tokens Stream');
