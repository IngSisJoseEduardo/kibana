/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { useMemo, useEffect, useState, useCallback } from 'react';
import { isEqual } from 'lodash';
import { History } from 'history';
import { DataViewListItem, DataViewType } from '@kbn/data-views-plugin/public';
import { SavedSearch, getSavedSearch } from '@kbn/saved-search-plugin/public';
import type { SortOrder } from '@kbn/saved-search-plugin/public';
import { useTextBasedQueryLanguage } from './use_text_based_query_language';
import { getState } from '../services/discover_state';
import { getStateDefaults } from '../utils/get_state_defaults';
import { DiscoverServices } from '../../../build_services';
import { loadDataView } from '../utils/resolve_data_view';
import { useSavedSearch as useSavedSearchData } from './use_saved_search';
import {
  MODIFY_COLUMNS_ON_SWITCH,
  SEARCH_FIELDS_FROM_SOURCE,
  SEARCH_ON_PAGE_LOAD_SETTING,
  SORT_DEFAULT_ORDER_SETTING,
} from '../../../../common';
import { useSearchSession } from './use_search_session';
import { FetchStatus } from '../../types';
import { getDataViewAppState } from '../utils/get_switch_data_view_app_state';
import { DataTableRecord } from '../../../types';
import { restoreStateFromSavedSearch } from '../../../services/saved_searches/restore_from_saved_search';

export function useDiscoverState({
  services,
  history,
  savedSearch,
  setExpandedDoc,
  dataViewList,
}: {
  services: DiscoverServices;
  savedSearch: SavedSearch;
  history: History;
  setExpandedDoc: (doc?: DataTableRecord) => void;
  dataViewList: DataViewListItem[];
}) {
  const { uiSettings, data, filterManager, dataViews, storage } = services;
  const useNewFieldsApi = useMemo(() => !uiSettings.get(SEARCH_FIELDS_FROM_SOURCE), [uiSettings]);
  const { timefilter } = data.query.timefilter;

  const dataView = savedSearch.searchSource.getField('index')!;

  const searchSource = useMemo(() => {
    savedSearch.searchSource.setField('index', dataView);
    return savedSearch.searchSource.createChild();
  }, [savedSearch, dataView]);

  const stateContainer = useMemo(
    () =>
      getState({
        getStateDefaults: () =>
          getStateDefaults({
            config: uiSettings,
            data,
            savedSearch,
            storage,
          }),
        storeInSessionStorage: uiSettings.get('state:storeInSessionStorage'),
        history,
        toasts: services.core.notifications.toasts,
        uiSettings,
      }),
    [uiSettings, data, history, savedSearch, services.core.notifications.toasts, storage]
  );

  const { appStateContainer } = stateContainer;

  const [state, setState] = useState(appStateContainer.getState());

  /**
   * Search session logic
   */
  const searchSessionManager = useSearchSession({ services, history, stateContainer, savedSearch });

  const initialFetchStatus: FetchStatus = useMemo(() => {
    // A saved search is created on every page load, so we check the ID to see if we're loading a
    // previously saved search or if it is just transient
    const shouldSearchOnPageLoad =
      uiSettings.get<boolean>(SEARCH_ON_PAGE_LOAD_SETTING) ||
      savedSearch.id !== undefined ||
      timefilter.getRefreshInterval().pause === false ||
      searchSessionManager.hasSearchSessionIdInURL();
    return shouldSearchOnPageLoad ? FetchStatus.LOADING : FetchStatus.UNINITIALIZED;
  }, [uiSettings, savedSearch.id, searchSessionManager, timefilter]);

  /**
   * Data fetching logic
   */
  const { data$, refetch$, reset, inspectorAdapters } = useSavedSearchData({
    initialFetchStatus,
    searchSessionManager,
    savedSearch,
    searchSource,
    services,
    stateContainer,
    useNewFieldsApi,
  });
  /**
   * State changes (data view, columns), when a text base query result is returned
   */
  useTextBasedQueryLanguage({
    documents$: data$.documents$,
    dataViews,
    stateContainer,
    dataViewList,
    savedSearch,
  });

  /**
   * Reset to display loading spinner when savedSearch is changing
   */
  useEffect(() => reset(), [savedSearch.id, reset]);

  /**
   * Sync URL state with local app state on saved search load
   * or dataView / savedSearch switch
   */
  useEffect(() => {
    const stopSync = stateContainer.initializeAndSync(dataView, filterManager, data);
    setState(stateContainer.appStateContainer.getState());

    return () => stopSync();
  }, [stateContainer, filterManager, data, dataView]);

  /**
   * Track state changes that should trigger a fetch
   */
  useEffect(() => {
    const unsubscribe = appStateContainer.subscribe(async (nextState) => {
      const { hideChart, interval, sort, index } = state;
      // chart was hidden, now it should be displayed, so data is needed
      const chartDisplayChanged = nextState.hideChart !== hideChart && hideChart;
      const chartIntervalChanged = nextState.interval !== interval;
      const docTableSortChanged = !isEqual(nextState.sort, sort);
      const dataViewChanged = !isEqual(nextState.index, index);
      // NOTE: this is also called when navigating from discover app to context app
      if (nextState.index && dataViewChanged) {
        /**
         *  Without resetting the fetch state, e.g. a time column would be displayed when switching
         *  from a data view without to a data view with time filter for a brief moment
         *  That's because appState is updated before savedSearchData$
         *  The following line of code catches this, but should be improved
         */
        const nextDataView = await loadDataView(
          nextState.index,
          services.dataViews,
          services.uiSettings
        );
        savedSearch.searchSource.setField('index', nextDataView.loaded);

        reset();
      }

      if (chartDisplayChanged || chartIntervalChanged || docTableSortChanged) {
        refetch$.next(undefined);
      }
      setState(nextState);
    });
    return () => unsubscribe();
  }, [services, appStateContainer, state, refetch$, data$, reset, savedSearch.searchSource]);

  /**
   * function to revert any changes to a given saved search
   */
  const resetSavedSearch = useCallback(
    async (id?: string) => {
      const newSavedSearch = await getSavedSearch(id, {
        search: services.data.search,
        savedObjectsClient: services.core.savedObjects.client,
        spaces: services.spaces,
        savedObjectsTagging: services.savedObjectsTagging,
      });

      const newDataView = newSavedSearch.searchSource.getField('index') || dataView;
      newSavedSearch.searchSource.setField('index', newDataView);
      const newAppState = getStateDefaults({
        config: uiSettings,
        data,
        savedSearch: newSavedSearch,
        storage,
      });

      restoreStateFromSavedSearch({
        savedSearch: newSavedSearch,
        timefilter: services.timefilter,
      });

      await stateContainer.replaceUrlAppState(newAppState);
      setState(newAppState);
    },
    [services, dataView, uiSettings, data, storage, stateContainer]
  );

  /**
   * Function triggered when user changes data view in the sidebar
   */
  const onChangeDataView = useCallback(
    async (id: string) => {
      const nextDataView = await dataViews.get(id);
      if (nextDataView && dataView) {
        const nextAppState = getDataViewAppState(
          dataView,
          nextDataView,
          state.columns || [],
          (state.sort || []) as SortOrder[],
          uiSettings.get(MODIFY_COLUMNS_ON_SWITCH),
          uiSettings.get(SORT_DEFAULT_ORDER_SETTING),
          state.query
        );
        stateContainer.setAppState(nextAppState);
      }
      setExpandedDoc(undefined);
    },
    [
      uiSettings,
      dataView,
      dataViews,
      setExpandedDoc,
      state.columns,
      state.query,
      state.sort,
      stateContainer,
    ]
  );
  /**
   * Function triggered when the user changes the query in the search bar
   */
  const onUpdateQuery = useCallback(
    (_payload, isUpdate?: boolean) => {
      if (isUpdate === false) {
        searchSessionManager.removeSearchSessionIdFromURL({ replace: false });
        refetch$.next(undefined);
      }
    },
    [refetch$, searchSessionManager]
  );

  /**
   * Trigger data fetching on dataView or savedSearch changes
   */
  useEffect(() => {
    if (dataView) {
      refetch$.next(undefined);
    }
  }, [initialFetchStatus, refetch$, dataView, savedSearch.id]);

  /**
   * We need to make sure the auto refresh interval is disabled for
   * non-time series data or rollups since we don't show the date picker
   */
  useEffect(() => {
    if (dataView && (!dataView.isTimeBased() || dataView.type === DataViewType.ROLLUP)) {
      stateContainer.pauseAutoRefreshInterval();
    }
  }, [dataView, stateContainer]);

  return {
    data$,
    dataView,
    inspectorAdapters,
    refetch$,
    resetSavedSearch,
    onChangeDataView,
    onUpdateQuery,
    searchSource,
    setState,
    state,
    stateContainer,
  };
}
