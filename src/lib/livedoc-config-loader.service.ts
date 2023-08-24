import { Injectable, Inject, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, concat } from 'rxjs';

import { LIVEDOC_SETTINGS } from './livedoc.injection-token';
import { LiveDocConfig, LiveDocSettings } from './interfaces/livedoc.service.interface';
import { LiveDocConfigLoaderServiceInterface } from './interfaces/livedoc-config-loader.interface';


@Injectable({
  providedIn: 'root'
})
export class LiveDocConfigLoaderService implements LiveDocConfigLoaderServiceInterface {

  // Allows changing of the configuration on the fly.
  newConfig = new Subject<LiveDocConfig>();

  constructor(
    private http: HttpClient,
    @Inject(LIVEDOC_SETTINGS) private liveDocSettings: LiveDocSettings
  ) { }

  load() {
    return concat(
      this.http.get<LiveDocConfig>(this.liveDocSettings.configUrl),
      this.newConfig
    );
  }

}
