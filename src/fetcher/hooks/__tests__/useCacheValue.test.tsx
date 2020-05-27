import React from 'react';
import { clear } from 'jest-date-mock';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';

import { wait } from '../../cache/testUtils';
import { useCacheValue } from '../useCacheValue';
import { Manager, createManagerWithMemoryCache } from '../../manager';

describe('useCacheValue', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    clear();
    jest.useRealTimers();
    if (!container) {
      return;
    }
    document.body.removeChild(container);
    unmountComponentAtNode(container);
    container.remove();
  });

  it('can observe a value', async () => {
    const manager = createManagerWithMemoryCache();
    // Hiject updates so we can run them in the act scope
    manager.updateConfig({hooks: {
      onNotifySub: (sub, state, reason) => {
        act(() => sub(state, reason));
        return false;
      }
    }});

    const Component = (props: {cacheKey: string, manager: Manager}) => {
      const state = useCacheValue<string>(props.cacheKey, {manager: props.manager});
      return (
        <span>{state.data || 'Undefined'}</span>
      );
    };

    await act(async () => {
      render(
        <Component cacheKey='key1' manager={manager} />,
        container
      );
    });
    expect(container.textContent).toContain('Undefined');

    act(() => {
      manager.request('key1', () => new Promise(resolve => resolve('100')));
    });
    await wait(1);
    expect(container.textContent).toContain('100');
  });
});
