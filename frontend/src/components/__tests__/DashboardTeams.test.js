import React from 'react';
import { render, screen, act } from '@testing-library/react';
import Dashboard from '../Dashboard';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { useWebSocket } from '../../hooks/useWebSocket';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../services/api', () => ({
  api: {
    getFailedPods: jest.fn().mockResolvedValue([]),
    getSecurityFindings: jest.fn().mockResolvedValue([]),
    getConfig: jest.fn().mockResolvedValue({ ai_enabled: false, features: {} }),
  },
}));

jest.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: jest.fn(() => ({ connected: true })),
}));

describe('Dashboard Team Permissions and Empty State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWebSocket.mockImplementation(() => ({ connected: true }));
  });

  test('renders empty state when non-admin has no team assigned', async () => {
    useAuth.mockReturnValue({
      user: { id: 2, username: 'testuser', role: 'member', has_team: false, effective_tabs: [] },
      userRole: 'member',
      logout: jest.fn(),
    });

    render(<Dashboard />);

    expect(screen.getByText('No Team Assigned')).toBeInTheDocument();
    expect(
      screen.getByText('You are not currently assigned to any team. Contact an admin to get access.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Pod Monitoring')).not.toBeInTheDocument();
  });

  test('renders only allowed tabs when non-admin is in a team', async () => {
    useAuth.mockReturnValue({
      user: {
        id: 2,
        username: 'testuser',
        role: 'member',
        has_team: true,
        effective_access_level: 'read',
        effective_tabs: ['pod_monitoring'],
      },
      userRole: 'member',
      logout: jest.fn(),
    });

    render(<Dashboard />);

    expect(await screen.findByText('Pod Monitoring')).toBeInTheDocument();
    expect(screen.queryByText('Security Scan')).not.toBeInTheDocument();
    expect(screen.queryByText('Diagram')).not.toBeInTheDocument();
    expect(screen.queryByText('Advice')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  test('renders all tabs and admin panel when user is admin', async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: 'admin', role: 'admin' },
      userRole: 'admin',
      logout: jest.fn(),
    });

    render(<Dashboard />);

    expect(await screen.findByText('Pod Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Security Scan')).toBeInTheDocument();
    expect(screen.getByText('Advice')).toBeInTheDocument();
    expect(screen.getByText('Diagram')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  test('filters incoming WebSocket pod_failure and pod_status_change by effective_namespaces', async () => {
    let wsHandler = null;
    useWebSocket.mockImplementation((handler) => {
      wsHandler = handler;
      return { connected: true };
    });

    useAuth.mockReturnValue({
      user: {
        id: 2,
        username: 'testuser',
        role: 'member',
        has_team: true,
        all_namespaces: false,
        effective_namespaces: ['allowed-ns'],
        effective_access_level: 'read',
        effective_tabs: ['pod_monitoring'],
      },
      userRole: 'member',
      logout: jest.fn(),
    });

    render(<Dashboard />);
    expect(await screen.findByText('Pod Monitoring')).toBeInTheDocument();

    // Send pod_failure from restricted namespace -> should be ignored
    act(() => {
      wsHandler({
        type: 'pod_failure',
        data: {
          id: 101,
          pod_name: 'secret-pod-1',
          namespace: 'restricted-ns',
          failure_reason: 'CrashLoopBackOff',
          status: 'new',
          timestamp: new Date().toISOString(),
        },
      });
    });

    expect(screen.queryByText('secret-pod-1')).not.toBeInTheDocument();

    // Send pod_failure from allowed namespace -> should appear
    act(() => {
      wsHandler({
        type: 'pod_failure',
        data: {
          id: 102,
          pod_name: 'allowed-pod-1',
          namespace: 'allowed-ns',
          failure_reason: 'CrashLoopBackOff',
          status: 'new',
          timestamp: new Date().toISOString(),
        },
      });
    });

    expect(screen.getByText('allowed-pod-1')).toBeInTheDocument();

    // Send pod_status_change from restricted namespace -> should be ignored
    act(() => {
      wsHandler({
        type: 'pod_status_change',
        data: {
          id: 103,
          pod_name: 'secret-pod-2',
          namespace: 'restricted-ns',
          failure_reason: 'Error',
          status: 'investigating',
          timestamp: new Date().toISOString(),
        },
      });
    });

    expect(screen.queryByText('secret-pod-2')).not.toBeInTheDocument();
  });
});
