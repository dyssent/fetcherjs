import { unmountComponentAtNode } from 'react-dom';
import { renderHook } from '../testUtils';
import { useMemoUnstable } from '../useMemoUnstable';
import { act } from 'react-dom/test-utils';

describe('useMemoUnstable', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (!container) {
      return;
    }
    document.body.removeChild(container);
    unmountComponentAtNode(container);
    container.remove();
  });

  it('can update memo when value changes at depth', async () => {
    let memoVal = 0;
    const memoFunc = () => {
      memoVal++;
      return memoVal;
    };
    const hook = renderHook(
      container,
      useMemoUnstable,
      memoFunc,
      [[{a: 1}]]
    );
    expect(hook.result.current).toBe(1);
    act(() => {
      hook.rerender();
    });
    expect(hook.result.current).toBe(1);
    act(() => {
      hook.updateArgs(
        memoFunc,
        [[{a: 1}]]
      );
    });
    expect(hook.result.current).toBe(1);
    act(() => {
      hook.updateArgs(
        memoFunc,
        [[{a: 2}]]
      );
    });
    expect(hook.result.current).toBe(2);
  });
});
