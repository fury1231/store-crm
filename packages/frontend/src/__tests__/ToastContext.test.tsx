import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../contexts/ToastContext';
import ToastContainer from '../components/ui/ToastContainer';

function TestComponent() {
  const { addToast } = useToast();

  return (
    <div>
      <button onClick={() => addToast('Success!', 'success')}>Add Success</button>
      <button onClick={() => addToast('Error!', 'error')}>Add Error</button>
      <ToastContainer />
    </div>
  );
}

describe('ToastContext', () => {
  it('shows a toast when addToast is called', async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByText('Add Success'));

    expect(screen.getByText('Success!')).toBeInTheDocument();
  });

  it('shows different toast types', async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByText('Add Error'));

    expect(screen.getByText('Error!')).toBeInTheDocument();
  });

  it('removes toast when dismiss is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByText('Add Success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dismiss'));

    expect(screen.queryByText('Success!')).not.toBeInTheDocument();
  });

  it('auto-dismisses after timeout', async () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    // Use act to wrap the click with fake timers
    await act(async () => {
      screen.getByText('Add Success').click();
    });

    expect(screen.getByText('Success!')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.queryByText('Success!')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('throws when useToast is used outside provider', () => {
    function BadComponent() {
      useToast();
      return null;
    }

    expect(() => render(<BadComponent />)).toThrow(
      'useToast must be used within a ToastProvider',
    );
  });
});
