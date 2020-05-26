import { advanceBy } from 'jest-date-mock';
import { act } from 'react-dom/test-utils';

const flushPromises = () => new Promise(res => process.nextTick(res));
export const wait = async (time: number) => {
  advanceBy(time);
  jest.advanceTimersByTime(time);
  await flushPromises();
  await act(async () => {
    await new Promise(res => res());
  });
};
