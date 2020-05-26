import React, { useState, useRef, useCallback } from 'react';
import { clear } from 'jest-date-mock';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';

import { wait } from '../../cache/testUtils';
import { useTimer } from '../useTimer';

const Component = (props: {interval: number}) => {
  const counter = useRef(0);
  const [count, setCounter] = useState(0);

  const increment = useCallback(() => {
    counter.current = counter.current + 1;
    setCounter(counter.current);
  }, []);

  useTimer(props.interval, increment);
  return (<span>{count}</span>);
};

describe('useTimer', () => {
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

  it('should call on timer', async () => {
    await act(async () => {
      render(
        <Component interval={100} />,
        container
      );
    });
    await wait(250);
    expect(container.textContent).toContain('2');
  });
});
