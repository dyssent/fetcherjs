import React from 'react';

import { createManager, Manager } from './manager';

export const defaultManager = createManager();
export const ManagerContext = React.createContext<Manager>(defaultManager);
