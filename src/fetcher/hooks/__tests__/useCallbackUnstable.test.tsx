import { unmountComponentAtNode } from 'react-dom';
import { renderHook } from '../testUtils';
import { useCallbackUnstable } from '../useCallbackUnstable';
import { act } from 'react-dom/test-utils';

describe('useCallbackUnstable', () => {
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

  it('can update callback when value changes at depth', async () => {
    let cbValue = 0;
    const cb1 = () => {
      cbValue = 1;
    };
    const cb2 = () => {
      cbValue = 1;
    };

    const hook = renderHook(
      container,
      useCallbackUnstable,
      cb1,
      [[{a: 1}]]
    );
    expect(hook.result.current).toBe(cb1);
    act(() => {
      hook.rerender();
    });
    expect(hook.result.current).toBe(cb1);
    act(() => {
      hook.updateArgs(
        cb2,
        [[{a: 1}]]
      );
    });
    expect(hook.result.current).toBe(cb1);
    act(() => {
      hook.updateArgs(
        cb2,
        [[{a: 2}]]
      );
    });
    expect(hook.result.current).toBe(cb2);
  });
});
