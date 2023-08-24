import { Observable } from 'rxjs';
import { LiveDocConfig } from './livedoc.service.interface';

export interface LiveDocConfigLoaderServiceInterface {
    load: () => Observable<LiveDocConfig>;
}
