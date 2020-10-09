import { Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { GlobalConfigActionTypes, UpdateGlobalConfigSection } from '../../config/store/global-config.actions';
import { catchError, filter, map, pairwise, shareReplay, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { DropboxApiService } from '../dropbox-api.service';
import { DataInitService } from '../../../core/data-init/data-init.service';
import { EMPTY, from, Observable } from 'rxjs';
import { SnackService } from '../../../core/snack/snack.service';
import { T } from '../../../t.const';
import { SyncConfig } from '../../config/global-config.model';

@Injectable()
export class DropboxEffects {
  private _isChangedAuthCode$: Observable<boolean> = this._dataInitService.isAllDataLoadedInitially$.pipe(
    // NOTE: it is important that we don't use distinct until changed here
    switchMap(() => this._dropboxApiService.authCode$),
    pairwise(),
    map(([a, b]) => a !== b),
    shareReplay(),
  );

  @Effect() generateAccessCode$: any = this._actions$.pipe(
    ofType(
      GlobalConfigActionTypes.UpdateGlobalConfigSection,
    ),
    filter(({payload}: UpdateGlobalConfigSection): boolean => payload.sectionKey === 'sync'),
    withLatestFrom(this._isChangedAuthCode$),
    switchMap(([{payload}, isChanged]: [UpdateGlobalConfigSection, boolean]) => {
      const syncConfig = payload.sectionCfg as SyncConfig;
      if (isChanged && typeof syncConfig.dropboxSync.authCode === 'string') {
        return from(this._dropboxApiService.getAccessTokenFromAuthCode(syncConfig.dropboxSync.authCode)).pipe(
          // NOTE: catch needs to be limited to request only, otherwise we break the chain
          catchError((e) => {
            console.error(e);
            this._snackService.open({type: 'ERROR', msg: T.F.DROPBOX.S.ACCESS_TOKEN_ERROR});
            // filter
            return EMPTY;
          }),
          map((accessToken) => ({accessToken, sync: syncConfig as SyncConfig})),
        );
      } else {
        return EMPTY;
      }
    }),
    tap((): any => setTimeout(() => this._snackService.open({
        type: 'SUCCESS',
        msg: T.F.DROPBOX.S.ACCESS_TOKEN_GENERATED
      }), 200)
    ),
    map(({accessToken, sync}: { accessToken: string, sync: SyncConfig }) => new UpdateGlobalConfigSection({
      sectionKey: 'sync',
      sectionCfg: ({
        ...sync,
        dropboxSync: {
          ...sync.dropboxSync,
          accessToken
        }
      } as SyncConfig)
    })),
  );

  constructor(
    private _actions$: Actions,
    private _dropboxApiService: DropboxApiService,
    private _snackService: SnackService,
    private _dataInitService: DataInitService,
  ) {
  }
}
