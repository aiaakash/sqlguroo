import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  Plus,
  Settings,
  Maximize,
  RefreshCw,
  Eye,
  Loader2,
  X,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import {
  useGetDashboardWithChartsQuery,
  useUpdateDashboardMutation,
  useUpdateDashboardLayoutMutation,
  useAddChartToDashboardMutation,
  useRemoveChartFromDashboardMutation,
} from 'librechat-data-provider';
import type {
  IDashboardChartItem,
  IDashboardSettings,
  DashboardIcon,
} from 'librechat-data-provider';
import { OGDialog, OGDialogContent, Skeleton, useToastContext } from '@librechat/client';
import DashboardGrid from './DashboardGrid';
import ChartLibrarySidebar from './ChartLibrarySidebar';
import DashboardIconComponent from './DashboardIcon';
import { DASHBOARD_ICONS } from './types';
import { cn } from '~/utils';

export default function DashboardEditor() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToastContext();

  // State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [localLayout, setLocalLayout] = useState<IDashboardChartItem[]>([]);

  // Queries
  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  } = useGetDashboardWithChartsQuery(dashboardId || '', {
    enabled: !!dashboardId,
  });

  // Mutations
  const updateDashboardMutation = useUpdateDashboardMutation();
  const updateLayoutMutation = useUpdateDashboardLayoutMutation();
  const addChartMutation = useAddChartToDashboardMutation();
  const removeChartMutation = useRemoveChartFromDashboardMutation();

  // Initialize local layout when data loads
  useEffect(() => {
    if (dashboardData?.charts) {
      setLocalLayout(dashboardData.charts);
    }
  }, [dashboardData?.charts]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges) {
          handleSaveLayout();
        }
      }
      // Escape to close settings modal
      if (e.key === 'Escape' && isSettingsOpen) {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, isSettingsOpen]);

  // Get existing chart IDs
  const existingChartIds = useMemo(() => {
    return localLayout.map((item) => item.chartId);
  }, [localLayout]);

  // Calculate next position for new chart
  const getNextPosition = useCallback(
    (width: number, height: number): { x: number; y: number } => {
      if (localLayout.length === 0) return { x: 0, y: 0 };

      // Find the maximum y position
      const maxY = Math.max(...localLayout.map((item) => item.y + item.h));

      // Try to find space in the current row
      const gridCols = dashboardData?.gridCols || 12;
      let x = 0;
      let y = maxY;

      // Check if we can fit in the last row
      const lastRowItems = localLayout.filter(
        (item) => item.y + item.h === maxY || item.y >= maxY - 2,
      );
      if (lastRowItems.length > 0) {
        const rightmostItem = lastRowItems.reduce((prev, curr) =>
          prev.x + prev.w > curr.x + curr.w ? prev : curr,
        );
        const newX = rightmostItem.x + rightmostItem.w;
        if (newX + width <= gridCols) {
          x = newX;
          y = rightmostItem.y;
        }
      }

      return { x, y };
    },
    [localLayout, dashboardData?.gridCols],
  );

  // Handle add chart
  const handleAddChart = async (chartId: string, size: { w: number; h: number }) => {
    if (!dashboardId) return;

    const position = getNextPosition(size.w, size.h);
    const newItem: IDashboardChartItem = {
      chartId,
      x: position.x,
      y: position.y,
      w: size.w,
      h: size.h,
    };

    try {
      await addChartMutation.mutateAsync({
        dashboardId,
        chartItem: newItem,
      });
      refetch();
      showToast({
        message: 'Chart added successfully',
        status: 'success',
      });
    } catch (error) {
      console.error('Failed to add chart:', error);
      showToast({
        message: 'Failed to add chart. Please try again.',
        status: 'error',
      });
    }
  };

  // Handle remove chart
  const handleRemoveChart = async (chartId: string) => {
    if (!dashboardId) return;

    if (!confirm('Remove this chart from the dashboard?')) return;

    try {
      await removeChartMutation.mutateAsync({
        dashboardId,
        chartId,
      });
      refetch();
      showToast({
        message: 'Chart removed successfully',
        status: 'success',
      });
    } catch (error) {
      console.error('Failed to remove chart:', error);
      showToast({
        message: 'Failed to remove chart. Please try again.',
        status: 'error',
      });
    }
  };

  // Handle layout change
  const handleLayoutChange = (newLayout: IDashboardChartItem[]) => {
    setLocalLayout(newLayout);
    setHasUnsavedChanges(true);
  };

  // Handle chart resize
  const handleChartResize = (chartId: string, newSize: { w: number; h: number }) => {
    const updatedLayout = localLayout.map((item) =>
      item.chartId === chartId ? { ...item, w: newSize.w, h: newSize.h } : item,
    );
    setLocalLayout(updatedLayout);
    setHasUnsavedChanges(true);
    showToast({
      message: 'Chart resized. Save to apply changes.',
      status: 'info',
    });
  };

  // Save layout
  const handleSaveLayout = async () => {
    if (!dashboardId) return;

    try {
      await updateLayoutMutation.mutateAsync({
        dashboardId,
        charts: localLayout,
      });
      setHasUnsavedChanges(false);
      showToast({
        message: 'Layout saved successfully',
        status: 'success',
      });
    } catch (error) {
      console.error('Failed to save layout:', error);
      showToast({
        message: 'Failed to save layout. Please try again.',
        status: 'error',
      });
    }
  };

  // Handle settings save
  const handleSettingsSave = async (updates: {
    name?: string;
    description?: string;
    icon?: DashboardIcon;
    settings?: Partial<IDashboardSettings>;
  }) => {
    if (!dashboardId) return;

    try {
      await updateDashboardMutation.mutateAsync({
        dashboardId,
        data: updates,
      });
      setIsSettingsOpen(false);
      refetch();
      showToast({
        message: 'Settings saved successfully',
        status: 'success',
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      showToast({
        message: 'Failed to save settings. Please try again.',
        status: 'error',
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="dark:bg-surface-primary-dark flex h-screen w-full flex-col bg-surface-primary">
        <div className="dark:border-border-dark flex h-16 items-center justify-between border-b border-border-light px-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="flex flex-1">
          <Skeleton className="h-full w-80" />
          <div className="flex-1 p-6">
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !dashboardData) {
    return (
      <div className="dark:bg-surface-primary-dark flex h-screen w-full items-center justify-center bg-surface-primary">
        <div className="text-center">
          <p className="text-text-secondary">Failed to load dashboard</p>
          <button
            onClick={() => navigate('/d/dashboards')}
            className="mt-4 text-blue-500 hover:underline"
          >
            Back to Dashboards
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark:bg-surface-primary-dark flex h-screen w-full flex-col overflow-hidden bg-surface-primary">
      {/* Header */}
      <div className="dark:border-border-dark flex h-16 flex-shrink-0 items-center justify-between border-b border-border-light px-4">
        {/* Left side */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/d/dashboards')}
            className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="dark:bg-border-dark h-6 w-px bg-border-light" />
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
              <DashboardIconComponent icon={dashboardData.icon} className="text-white" size={18} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-text-primary">{dashboardData.name}</h1>
              <p className="text-xs text-text-tertiary">
                {dashboardData.charts.length} charts
                {hasUnsavedChanges && (
                  <span className="ml-2 text-amber-500">• Unsaved changes</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/d/dashboards/${dashboardId}`)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <button
            onClick={handleSaveLayout}
            disabled={!hasUnsavedChanges || updateLayoutMutation.isLoading}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              hasUnsavedChanges
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-600'
                : 'dark:bg-surface-secondary-dark bg-surface-secondary text-text-tertiary',
            )}
          >
            {updateLayoutMutation.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Toggle */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="dark:bg-surface-secondary-dark absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-lg bg-surface-secondary p-2 text-text-secondary shadow-lg transition-all hover:bg-surface-hover hover:text-text-primary"
          style={{ left: isSidebarOpen ? '318px' : '0' }}
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeft className="h-4 w-4" />
          )}
        </button>

        {/* Sidebar */}
        <div
          className={cn(
            'flex-shrink-0 transition-all duration-300',
            isSidebarOpen ? 'w-80' : 'w-0',
          )}
        >
          {isSidebarOpen && (
            <ChartLibrarySidebar existingChartIds={existingChartIds} onAddChart={handleAddChart} />
          )}
        </div>

        {/* Dashboard canvas */}
        <div className="flex-1 overflow-y-auto p-6">
          <DashboardGrid
            charts={dashboardData.chartsWithData}
            layout={localLayout}
            gridCols={dashboardData.gridCols}
            isEditing={true}
            showBorders={dashboardData.settings?.showBorders ?? true}
            onLayoutChange={handleLayoutChange}
            onRemoveChart={handleRemoveChart}
            onChartResize={handleChartResize}
          />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        dashboard={dashboardData}
        onSave={handleSettingsSave}
        isLoading={updateDashboardMutation.isLoading}
      />
    </div>
  );
}

// Settings Modal Component
function SettingsModal({
  open,
  onOpenChange,
  dashboard,
  onSave,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: any;
  onSave: (updates: any) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description || '');
  const [icon, setIcon] = useState(dashboard.icon);
  const [settings, setSettings] = useState<Partial<IDashboardSettings>>(dashboard.settings || {});

  useEffect(() => {
    setName(dashboard.name);
    setDescription(dashboard.description || '');
    setIcon(dashboard.icon);
    setSettings(dashboard.settings || {});
  }, [dashboard]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, description, icon, settings });
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="dark:bg-surface-primary-dark w-full max-w-lg overflow-hidden rounded-2xl border-0 bg-surface-primary p-0 shadow-2xl">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="dark:border-border-dark flex items-center justify-between border-b border-border-light p-6">
            <h2 className="text-lg font-semibold text-text-primary">Dashboard Settings</h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-2 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto p-6">
            {/* Name */}
            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-text-primary">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="dark:border-border-dark dark:bg-surface-secondary-dark w-full rounded-xl border border-border-light bg-surface-secondary px-4 py-3 text-text-primary focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Description */}
            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-text-primary">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="dark:border-border-dark dark:bg-surface-secondary-dark w-full resize-none rounded-xl border border-border-light bg-surface-secondary px-4 py-3 text-text-primary focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Icon */}
            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-text-primary">Icon</label>
              <div className="grid grid-cols-8 gap-2">
                {DASHBOARD_ICONS.map(({ icon: iconValue, label }) => (
                  <button
                    key={iconValue}
                    type="button"
                    onClick={() => setIcon(iconValue)}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl transition-all',
                      icon === iconValue
                        ? 'bg-blue-500 text-white'
                        : 'dark:bg-surface-secondary-dark bg-surface-secondary text-text-secondary hover:bg-surface-hover',
                    )}
                    title={label}
                  >
                    <DashboardIconComponent icon={iconValue} size={18} />
                  </button>
                ))}
              </div>
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-text-primary">Display Options</h4>

              <label className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Show borders</span>
                <input
                  type="checkbox"
                  checked={settings.showBorders ?? true}
                  onChange={(e) => setSettings({ ...settings, showBorders: e.target.checked })}
                  className="h-5 w-5 rounded border-border-light text-blue-500 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Compact layout</span>
                <input
                  type="checkbox"
                  checked={settings.compactLayout ?? false}
                  onChange={(e) => setSettings({ ...settings, compactLayout: e.target.checked })}
                  className="h-5 w-5 rounded border-border-light text-blue-500 focus:ring-blue-500"
                />
              </label>

              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Auto-refresh (minutes)</span>
                <select
                  value={settings.autoRefresh ?? 0}
                  onChange={(e) =>
                    setSettings({ ...settings, autoRefresh: Number(e.target.value) })
                  }
                  className="dark:border-border-dark dark:bg-surface-secondary-dark rounded-lg border border-border-light bg-surface-secondary px-3 py-1.5 text-sm text-text-primary focus:border-blue-500 focus:outline-none"
                >
                  <option value={0}>Off</option>
                  <option value={5}>5 min</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="dark:border-border-dark flex justify-end gap-3 border-t border-border-light p-6">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
}
