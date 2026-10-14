import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LivePodsTable from '../LivePodsTable';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    getClusterNamespaces: jest.fn(),
    getAllNamespaces: jest.fn(),
    getLivePods: jest.fn(),
  },
}));

jest.mock('../PodLogsModal', () => {
  return function MockPodLogsModal({ isOpen, pod, onClose }) {
    if (!isOpen) return null;
    return (
      <div data-testid="mock-pod-logs-modal">
        <span>Logs for {pod?.name}</span>
        <button onClick={onClose}>Close</button>
      </div>
    );
  };
});

describe('LivePodsTable', () => {
  const mockPods = [
    {
      name: 'kure-monitor-backend-6b7986b6c5-ntqbm',
      namespace: 'kure-system',
      phase: 'Running',
      status_reason: 'Running',
      ready: '1/1',
      ready_count: 1,
      total_containers: 1,
      restarts: 0,
      created_at: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      node_name: 'node-1',
      pod_ip: '10.244.0.12',
      container_statuses: [{ name: 'backend', ready: true, restart_count: 0, image: 'backend:latest' }],
    },
    {
      name: 'kure-monitor-frontend-596cc7d97d-74kkd',
      namespace: 'kure-system',
      phase: 'Running',
      status_reason: 'Running',
      ready: '1/1',
      ready_count: 1,
      total_containers: 1,
      restarts: 2,
      created_at: new Date(Date.now() - 1000 * 60 * 68).toISOString(),
      node_name: 'node-1',
      pod_ip: '10.244.0.13',
      container_statuses: [{ name: 'frontend', ready: true, restart_count: 2, image: 'frontend:latest' }],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    api.getClusterNamespaces.mockResolvedValue(['default', 'kure-system', 'kube-system']);
    api.getLivePods.mockResolvedValue({ pods: mockPods });
  });

  test('renders live pods table with fetched pods', async () => {
    render(<LivePodsTable isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText('kure-monitor-backend-6b7986b6c5-ntqbm')).toBeInTheDocument();
      expect(screen.getByText('kure-monitor-frontend-596cc7d97d-74kkd')).toBeInTheDocument();
    });

    expect(screen.getAllByText('kure-system').length).toBeGreaterThan(0);
  });

  test('filters pods by search query', async () => {
    render(<LivePodsTable isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText('kure-monitor-backend-6b7986b6c5-ntqbm')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search pods...');
    fireEvent.change(searchInput, { target: { value: 'frontend' } });

    expect(screen.queryByText('kure-monitor-backend-6b7986b6c5-ntqbm')).not.toBeInTheDocument();
    expect(screen.getByText('kure-monitor-frontend-596cc7d97d-74kkd')).toBeInTheDocument();
  });

  test('opens logs modal on pod row or button click', async () => {
    render(<LivePodsTable isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText('kure-monitor-backend-6b7986b6c5-ntqbm')).toBeInTheDocument();
    });

    const logButtons = screen.getAllByTitle('View logs snapshot');
    fireEvent.click(logButtons[0]);

    expect(screen.getByTestId('mock-pod-logs-modal')).toBeInTheDocument();
    expect(screen.getByText('Logs for kure-monitor-backend-6b7986b6c5-ntqbm')).toBeInTheDocument();
  });

  test('opens logs modal with autoStream on Live button click', async () => {
    render(<LivePodsTable isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText('kure-monitor-backend-6b7986b6c5-ntqbm')).toBeInTheDocument();
    });

    const liveButtons = screen.getAllByTitle('Live stream logs');
    fireEvent.click(liveButtons[0]);

    expect(screen.getByTestId('mock-pod-logs-modal')).toBeInTheDocument();
    expect(screen.getByText('Logs for kure-monitor-backend-6b7986b6c5-ntqbm')).toBeInTheDocument();
  });
});
