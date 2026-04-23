import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  Plus,
  Settings,
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
import { OGDialog, OGDialogContent, Skeleton, useToastContext, Switch, Dropdown } from '@librechat/client';
import DashboardGrid from './DashboardGrid';
import ChartLibrarySidebar from './ChartLibrarySidebar';
import DashboardIconComponent from './DashboardIcon';
import { DASHBOARD_ICONS } from './types';
import { cn } from '~/utils';

export default function DashboardEditor() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToastContext();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [localLayout, setLocalLayout] = useState<IDashboardChartItem[]>([]);

  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  } = useGetDashboardWithChartsQuery(dashboardId || '', {
    enabled: !!dashboardId,
  });

  const updateDashboardMutation = useUpdateDashboardMutation();
  const updateLayoutMutation = useUpdateDashboardLayoutMutation();
  const addChartMutation = useAddChartToDashboardMutation();
  const removeChartMutation = useRemoveChartFromDashboardMutation();

  useEffect(() => {
    if (dashboardData?.charts) {
      setLocalLayout(dashboardData.charts);
    }
  }, [dashboardData?.charts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges) {
          handleSaveLayout();
        }
      }
      if (e.key === 'Escape' && isSettingsOpen) {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, isSettingsOpen]);

  const existingChartIds = useMemo(() => {
    return localLayout.map((item) => item.chartId);
  }, [localLayout]);

  const getNextPosition = useCallback(
    (width: number, height: number): { x: number; y: number } => {
      if (localLayout.length === 0) return { x: 0, y: 0 };

      const maxY = Math.max(...localLayout.map((item) => item.y + item.h));
      const gridCols = dashboardData?.gridCols || 12;
      let x = 0;
      let y = maxY;

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

  const handleLayoutChange = (newLayout: IDashboardChartItem[]) => {
    setLocalLayout(newLayout);
    setHasUnsavedChanges(true);
  };

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

  if (isLoading) {
    return (
      <div className="flex h-screen w-full flex-col bg-surface-primary-alt">
        <div className="flex h-16 items-center justify-between border-b border-border-light/60 px-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="flex flex-1">
          <Skeleton className="h-full w-80" />
          <div className="flex-1 p-6">
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-primary-alt">
        <div className="text-center">
          <div className="mb-4 rounded-xl bg-destructive/10 p-4">
            <X className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium text-text-secondary">Failed to load dashboard</p>
          <button
            onClick={() => navigate('/d/dashboards')}
            className="mt-3 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            Back to Dashboards
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary-alt">
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border-light/60 bg-surface-primary/80 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/d/dashboards')}
            className="group flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="h-5 w-px bg-border-light/60" />
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: `linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))`,
                border: `1px solid rgba(59, 130, 246, 0.3)`,
              }}
            >
              <DashboardIconComponent icon={dashboardData.icon} className="text-primary" size={18} />
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/d/dashboards/${dashboardId}`)}
            className="flex items-center gap-2 rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-medium hover:text-text-primary"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3.5 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-medium hover:text-text-primary"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <button
            onClick={handleSaveLayout}
            disabled={!hasUnsavedChanges || updateLayoutMutation.isLoading}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition-all',
              hasUnsavedChanges
                ? 'bg-primary text-white hover:bg-primary/90 hover:shadow-md'
                : 'bg-surface-secondary text-text-tertiary',
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

      <div className="flex flex-1 overflow-hidden">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-lg bg-surface-secondary p-2 text-text-secondary shadow-lg transition-all hover:bg-surface-hover hover:text-text-primary"
          style={{ left: isSidebarOpen ? '318px' : '0' }}
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeft className="h-4 w-4" />
          )}
        </button>

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
      <OGDialogContent className="w-full max-w-lg overflow-hidden rounded-xl rounded-b-lg bg-card p-0 shadow-2xl backdrop-blur-2xl">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between border-b border-border-light px-6 py-4">
            <h2 className="text-lg font-semibold text-text-primary">Dashboard Settings</h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-sm p-1.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-border-xheavy focus:ring-offset-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-text-primary"
              >
                <line x1="18" x2="6" y1="6" y2="18"></line>
                <line x1="6" x2="18" y1="6" y2="18"></line>
              </svg>
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
              <div className="pb-3">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-text-primary">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-text-primary transition-all focus:ring-ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="pb-3">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-text-primary">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-text-primary transition-all focus:ring-ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="pb-3">
                <div className="flex items-center justify-between">
                  <div>Icon</div>
                  <div className="grid grid-cols-8 gap-1.5">
                    {DASHBOARD_ICONS.map(({ icon: iconValue, label }) => (
                      <button
                        key={iconValue}
                        type="button"
                        onClick={() => setIcon(iconValue)}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                          icon === iconValue
                            ? 'bg-primary text-white'
                            : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                        )}
                        title={label}
                      >
                        <DashboardIconComponent icon={iconValue} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pb-3">
                <div className="text-sm font-medium text-text-primary">Display Options</div>
                <div className="mt-2 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Show borders</span>
                    <Switch
                      id="show-borders"
                      checked={settings.showBorders ?? true}
                      onCheckedChange={(checked) => setSettings({ ...settings, showBorders: checked })}
                      aria-label="Show borders"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Compact layout</span>
                    <Switch
                      id="compact-layout"
                      checked={settings.compactLayout ?? false}
                      onCheckedChange={(checked) => setSettings({ ...settings, compactLayout: checked })}
                      aria-label="Compact layout"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Auto-refresh (minutes)</span>
                    <Dropdown
                      value={String(settings.autoRefresh ?? 0)}
                      onChange={(value) => setSettings({ ...settings, autoRefresh: Number(value) })}
                      options={[
                        { value: '0', label: 'Off' },
                        { value: '5', label: '5 min' },
                        { value: '15', label: '15 min' },
                        { value: '30', label: '30 min' },
                        { value: '60', label: '1 hour' },
                      ]}
                      sizeClasses="w-[120px]"
                      className="z-50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-border-light px-6 py-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary/90 disabled:opacity-50"
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
