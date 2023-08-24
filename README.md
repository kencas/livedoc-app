# Livedoc

## Using LiveDoc Service

If the LiveDoc library was published to an NPM registry, then it will be consumed normally.

Below will be examples of consuming the library from a git repo. For more details
on building the URL, see [Git URLs as Dependencies](https://docs.npmjs.com/files/package.json#git-urls-as-dependencies).

### Installing using the command line

`npm install livedoc@git+https://git.server.url`

### Instlling using `package.json`

```json
  "dependencies": {
    "livedoc": "git+https://git.server.url"
  }
```

### Providing settings

The service must receive basic settings during instantiation. LiveDoc service
expects settings to conform to LiveDocSettings interface.

For example, this could be placed in file `\src\app\app.settings.ts`:

```typescript
import { LiveDocSettings } from '@livedoc';

export const APP_LIVEDOC_SETTINGS: LiveDocSettings = {

        /* Location of the configuration file. Must conform to interface LiveDocConfig declared in `./livdoc.interface` */
        configUrl: '/ldbckcfg',

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
        retryCount: -1,

        // Delay, in milliseconds, for retrying
        retryDelay: 2000,

        // 'none', 'some' or 'all'
        logLevel: 'all',
};
```

Notice that only `configUrl` key is mandatory and represents a full or partial URL for the configuration file for LiveDoc servers. The other keys are optional.

### Injecting Settings

To inject the settings (defined above) into the LiveDoc service,
provide the `LIVEDOC_SETTINGS` Injection token.

For example, the following could be added to file `\src\app\app.module.ts`:

```TypeScript
import { LIVEDOC_SETTINGS } from '@livedoc'; // Injection token to provide settings
import { APP_LIVEDOC_SETTINGS } from './app.settings'; // Actual LiveDoc settngs

@NgModule({
  // ...
  providers: [
    {
      provide: LIVEDOC_SETTINGS,
      useValue: APP_LIVEDOC_SETTINGS
    }
  ],
  // ...
})
export class AppModule { }

```

## LiveDoc server configuration

LiveDoc Service needs to get a configuration for LiveDoc servers. This file should be accessible via web protocols. The URL of the configuration file was provided to LiveDoc service as the only mandatory key `configUrl` to the `LiveDocSettings` object.

The `configuration` file should conform to the LiveDocConfig interface.

### Using in a Component

Here is a sample use of LiveDoc service inside a Component:

```typescript
import { LiveDocService, StompHeaders, CallCenterStats } from 'livedoc';

export class StompTesterComponent {

  callCenterStats: CallCenterStats;

  constructor(
    public liveDocService: LiveDocService
  ) { }

  method() {

    this.liveDocService = this.liveDocService.getStream({
      document: destination,
      headers: {'X-Lang': 'En', Top: 20},
      deltaHandlingStrategy: (old, new) => new
    }).subscribe(/* ... */);

    this.liveDocService.connectionStatistics.subscribe(stats => this.callCenterStats = stats);

  }

```

## Data Model

See file [livedoc.info.txt](livedoc.info.txt) in this folder.
