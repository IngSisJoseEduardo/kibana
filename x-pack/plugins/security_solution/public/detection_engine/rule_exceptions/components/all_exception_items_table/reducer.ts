/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExceptionListItemSchema, Pagination } from '@kbn/securitysolution-io-ts-list-types';
import type { ExceptionsPagination } from '../../utils/types';

export type ViewerFlyoutName = 'addException' | 'editException' | null;
export type ViewerState =
  | 'error'
  | 'empty'
  | 'empty_search'
  | 'loading'
  | 'searching'
  | 'deleting'
  | null;

export interface State {
  pagination: ExceptionsPagination;
  // Individual exception items
  exceptions: ExceptionListItemSchema[];
  // Exception item selected to update
  exceptionToEdit: ExceptionListItemSchema | null;
  // Flyout to be opened (edit vs add vs none)
  currenFlyout: ViewerFlyoutName;
  viewerState: ViewerState;
}

export type Action =
  | {
      type: 'setExceptions';
      exceptions: ExceptionListItemSchema[];
      pagination: Pagination;
    }
  | { type: 'updateFlyoutOpen'; flyoutType: ViewerFlyoutName }
  | {
      type: 'updateExceptionToEdit';
      exception: ExceptionListItemSchema;
    }
  | {
      type: 'setViewerState';
      state: ViewerState;
    };

export const allExceptionItemsReducer =
  () =>
  (state: State, action: Action): State => {
    switch (action.type) {
      case 'setExceptions': {
        const { exceptions, pagination } = action;

        return {
          ...state,
          pagination: {
            ...state.pagination,
            pageIndex: pagination.page - 1,
            pageSize: pagination.perPage,
            totalItemCount: pagination.total ?? 0,
          },
          exceptions,
        };
      }
      case 'updateExceptionToEdit': {
        const { exception } = action;
        return {
          ...state,
          exceptionToEdit: exception,
        };
      }
      case 'updateFlyoutOpen': {
        return {
          ...state,
          currenFlyout: action.flyoutType,
        };
      }
      case 'setViewerState': {
        return {
          ...state,
          viewerState: action.state,
        };
      }
      default:
        return state;
    }
  };
