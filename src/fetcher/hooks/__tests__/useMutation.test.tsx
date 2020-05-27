// tslint:disable:react-hooks-nesting
import { clear } from 'jest-date-mock';
import { unmountComponentAtNode } from 'react-dom';
// tslint:disable-next-line:no-submodule-imports
import { act } from 'react-dom/test-utils';

import { wait } from '../../cache/testUtils';
import { useMutation } from '../useMutation';
import { Manager, createManagerWithMemoryCache } from '../../manager';
import { renderHook } from '../testUtils';

describe('useMutation', () => {
  let container: HTMLDivElement;
  let manager: Manager;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    manager = createManagerWithMemoryCache();
    // Hiject updates so we can run them in the act scope
    manager.updateConfig({hooks: {
      onNotifySub: (sub, state, reason) => {
        act(() => sub(state, reason));
        return false;
      }
    }});
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

  it('can call a mutation', async () => {
    const request = () => new Promise(resolve => resolve(100));
    const hook = renderHook(
      container,
      () => useMutation(request, {manager})
    );
    expect(hook.result.current[1]?.data).toBeUndefined();
    act(() => {
      hook.result.current[0]();
    });
    await wait(1);
    expect(hook.result.current[1]?.data).toBe(100);
  });

  it('reports callbacks', async () => {
    const hits = {
      success: 0,
      error: 0,
      retry: 0,
      request: 0,
      complete: 0,
      update: 0
    };
    const callbacks = {
      onComplete: () => hits.complete = hits.complete + 1,
      onError: () => hits.error = hits.error + 1,
      onSuccess: () => hits.success = hits.success + 1,
      onRetry: () => hits.retry = hits.retry + 1,
      onRequest: () => hits.request = hits.request + 1,
      onUpdate: () => {
        hits.update = hits.update + 1;
      }
    };

    const instanceHits = {
      success: 0,
      error: 0,
      retry: 0,
      complete: 0,
      update: 0
    };
    const instanceCallbacks = {
      onComplete: () => instanceHits.complete = instanceHits.complete + 1,
      onError: () => instanceHits.error = instanceHits.error + 1,
      onSuccess: () => instanceHits.success = instanceHits.success + 1,
      onRetry: () => instanceHits.retry = instanceHits.retry + 1,
      onUpdate: () => {
        instanceHits.update = instanceHits.update + 1;
      }
    };

    let value = 0;
    const request = () => new Promise((resolve, reject) => {
      value++;
      if (value < 2) {
        reject('Error');
        return;
      }
      resolve(value);
    });

    const hook = renderHook(
      container,
      () => useMutation(request, {manager, retries: 2, ...callbacks})
    );
    expect(hook.result.current[1]?.data).toBeUndefined();
    act(() => {
      hook.result.current[0]().on(instanceCallbacks);
    });
    await wait(1);
    // By this time we'll have:
    // Update: pending, fetching, error but with a retry
    expect(hits.update).toBe(3);
    expect(hits.request).toBe(1);
    expect(instanceHits.update).toBe(1);
    await wait(2500);
    // By this time we should have:
    // Update: fetching, success
    expect(hits.update).toBe(5);
    expect(hits.success).toBe(1);
    expect(hits.retry).toBe(1);
    // There are fewer updates here as we don't get request pending / fetching switch
    expect(instanceHits.update).toBe(3);
    expect(instanceHits.success).toBe(1);
    expect(instanceHits.retry).toBe(1);
  });

  it('reports error callbacks', async () => {
    let error = false;
    let complete = false;
    const callbacks = {
      onError: () => error = true,
      onComplete: () => complete = true
    };

    let instanceError = false;
    let instanceComplete = false;
    const instanceCallbacks = {
      onError: () => instanceError = true,
      onComplete: () => instanceComplete = true
    };

    const request = () => new Promise((resolve, reject) => {
      reject('Error');
    });

    const hook = renderHook(
      container,
      () => useMutation(request, {manager, retries: 1, ...callbacks})
    );
    expect(hook.result.current[1]?.data).toBeUndefined();
    act(() => {
      hook.result.current[0]().on(instanceCallbacks);
    });
    await wait(1);
    // Should not be called yet, but will retry
    expect(hook.result.current[1]?.error).toBeUndefined();
    expect(error).toBe(false);
    expect(complete).toBe(false);
    expect(instanceError).toBe(false);
    expect(instanceComplete).toBe(false);
    await wait(2500);
    expect(hook.result.current[1]?.error).toBe('Error');
    expect(error).toBe(true);
    expect(complete).toBe(true);
    expect(instanceError).toBe(true);
    expect(instanceComplete).toBe(true);
  });
});
