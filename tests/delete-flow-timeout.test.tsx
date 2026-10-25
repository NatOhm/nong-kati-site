// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDeleteFlow } from '../src/components/feedback/DeleteConfirmDialog';

const TARGET = { id: 'p1' };
const TIMEOUT_MSG = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ';

describe('useDeleteFlow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('times out a hung delete: retryable error, dialog unlocks', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDeleteFlow(() => new Promise(() => {})));

    act(() => result.current.open(TARGET));
    let confirmPromise: Promise<void> | undefined;
    act(() => {
      confirmPromise = result.current.confirm();
    });
    expect(result.current.busy).toBe(true);
    // Cancel is disabled mid-flight.
    act(() => result.current.cancel());
    expect(result.current.target).toEqual(TARGET);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await confirmPromise;
    });

    expect(result.current.busy).toBe(false);
    expect(result.current.error?.reason).toContain(TIMEOUT_MSG);
    // Dialog stays open and cancel works again.
    expect(result.current.target).toEqual(TARGET);
    act(() => result.current.cancel());
    expect(result.current.target).toBeNull();
  });

  it('maps a thrown network error to the same retryable message', async () => {
    const { result } = renderHook(() =>
      useDeleteFlow(() => Promise.reject(new Error('offline'))),
    );
    act(() => result.current.open(TARGET));
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error?.reason).toContain(TIMEOUT_MSG);
    expect(result.current.target).toEqual(TARGET);
  });

  it('keeps a server refusal with order numbers; success clears and refreshes', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useDeleteFlow(
        () =>
          Promise.resolve({
            success: false,
            reason: 'มีออเดอร์ที่ยังไม่เสร็จ',
            orderNumbers: ['NK-1'],
          }),
        onSuccess,
      ),
    );
    act(() => result.current.open(TARGET));
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.error).toEqual({
      reason: 'มีออเดอร์ที่ยังไม่เสร็จ',
      orderNumbers: ['NK-1'],
    });
    expect(onSuccess).not.toHaveBeenCalled();

    const { result: ok } = renderHook(() =>
      useDeleteFlow(() => Promise.resolve({ success: true }), onSuccess),
    );
    act(() => ok.current.open(TARGET));
    await act(async () => {
      await ok.current.confirm();
    });
    expect(ok.current.target).toBeNull();
    expect(ok.current.error).toBeNull();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
