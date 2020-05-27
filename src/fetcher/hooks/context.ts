import React from 'react';

import { Manager, createManager } from '../manager';
import { Cache, createMemoryCache } from '../cache';
import { QueryOptionsBase } from './useQuery';

export const defaultCache = createMemoryCache();
export const defaultManager = createManager({}, defaultCache);

export const CacheContext = React.createContext<Cache>(defaultCache);
export const ManagerContext = React.createContext<Manager>(defaultManager);
export const QueryOptionsContext = React.createContext<QueryOptionsBase<unknown> | undefined>(undefined);
