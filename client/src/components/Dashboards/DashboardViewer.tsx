import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Share2,
  Edit2,
  Maximize,
  Minimize,
  Download,
  Link2,
  Check,
  Copy,
  Clock,
  Loader2,
  Star,
  ExternalLink,
  X,
} from 'lucide-react';
import {
  useGetDashboardWithChartsQuery,
  useGetPublicDashboardQuery,
  useToggleDashboardStarMutation,
  useUpdateDashboardMutation,
} from 'librechat-data-provider';
import { Skeleton, OGDialog, OGDialogContent, useToastContext, Switch, Dropdown, Button, Input, Separator } from '@librechat/client';
import DashboardGrid from './DashboardGrid';
import DashboardIcon from './DashboardIcon';
import { cn } from '~/utils';

export default function DashboardViewer() {
  const { dashboardId, shareId } = useParams<{ dashboardId?: string; shareId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToastContext();
  const contentRef = useRef<HTMLDivElement>(null);

  const isPublic = location.pathname.includes('/public/');

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [refreshingCharts, setRefreshingCharts] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState<'png' | 'pdf' | null>(null);

  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  } = useGetDashboardWithChartsQuery(dashboardId || '', {
    enabled: !!dashboardId && !isPublic,
  });

  const {
    data: publicDashboardData,
    isLoading: isLoadingPublic,
    error: publicError,
  } = useGetPublicDashboardQuery(shareId || '', {
    enabled: !!shareId && isPublic,
  });

  const dashboard = isPublic ? publicDashboardData : dashboardData;
  const loading = isPublic ? isLoadingPublic : isLoading;
  const loadError = isPublic ? publicError : error;

  const starMutation = useToggleDashboardStarMutation();
  const updateMutation = useUpdateDashboardMutation();

  useEffect(() => {
    if (autoRefresh > 0) {
      const interval = setInterval(
        () => {
          handleRefreshAll();
        },
        autoRefresh * 60 * 1000,
      );

      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  };

  const handleRefreshAll = useCallback(async () => {
    refetch();
    setLastRefreshTime(new Date());
  }, [refetch]);

  const handleRefreshChart = useCallback(async (chartId: string) => {
    setRefreshingCharts((prev) => new Set([...prev, chartId]));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshingCharts((prev) => {
      const newSet = new Set(prev);
      newSet.delete(chartId);
      return newSet;
    });
  }, []);

  const handleToggleStar = async () => {
    if (!dashboardId) return;
    try {
      await starMutation.mutateAsync(dashboardId);
      showToast({
        message: dashboard?.starred ? 'Dashboard unstarred' : 'Dashboard starred',
        status: 'success',
      });
    } catch (error) {
      showToast({
        message: 'Failed to update star status',
        status: 'error',
      });
    }
  };

  const getShareUrl = () => {
    if (!dashboard?.permissions?.shareId) return '';
    return `${window.location.origin}/d/dashboards/public/${dashboard.permissions.shareId}`;
  };

  const handleTogglePublic = async () => {
    if (!dashboardId) return;
    try {
      await updateMutation.mutateAsync({
        dashboardId,
        data: {
          permissions: {
            isPublic: !dashboard?.permissions?.isPublic,
          },
        },
      });
      showToast({
        message: dashboard?.permissions?.isPublic
          ? 'Dashboard is now private'
          : 'Dashboard is now public',
        status: 'success',
      });
    } catch (error) {
      showToast({
        message: 'Failed to update sharing settings',
        status: 'error',
      });
    }
  };

  const handleExportPNG = async () => {
    if (!contentRef.current) return;
    setIsExporting('png');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${dashboard?.name || 'dashboard'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast({
        message: 'Dashboard exported as PNG',
        status: 'success',
      });
    } catch (error) {
      console.error('Export failed:', error);
      showToast({
        message: 'Failed to export dashboard. Please try again.',
        status: 'error',
      });
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportPDF = async () => {
    if (!contentRef.current) return;
    setIsExporting('pdf');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${dashboard?.name || 'dashboard'}.pdf`);
      showToast({
        message: 'Dashboard exported as PDF',
        status: 'success',
      });
    } catch (error) {
      console.error('Export failed:', error);
      showToast({
        message: 'Failed to export dashboard. Please try again.',
        status: 'error',
      });
    } finally {
      setIsExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col bg-surface-primary-alt">
        <div className="flex h-16 items-center justify-between border-b border-border-light/60 px-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="flex-1 p-6">
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !dashboard) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-primary-alt">
        <div className="text-center">
          <div className="mb-4 rounded-xl bg-destructive/10 p-4">
            <X className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium text-text-secondary">
            {isPublic ? 'This dashboard is not available' : 'Failed to load dashboard'}
          </p>
          {!isPublic && (
            <Button
              onClick={() => navigate('/d/dashboards')}
              variant="outline"
              className="mt-3"
            >
              Back to Dashboards
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-screen w-full flex-col overflow-hidden bg-surface-primary-alt',
        isFullscreen && 'fixed inset-0 z-50',
      )}
    >
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border-light/60 bg-surface-primary/80 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          {!isPublic && (
            <>
              <Button
                variant="ghost"
                onClick={() => navigate('/d/dashboards')}
                className="group flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <Separator orientation="vertical" className="h-5 bg-border-light/60" />
            </>
          )}
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background: `linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))`,
                border: `1px solid rgba(59, 130, 246, 0.3)`,
              }}
            >
              <DashboardIcon icon={dashboard.icon} className="text-primary" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-text-primary">{dashboard.name}</h1>
                {!isPublic && dashboard.starred && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/10">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  </div>
                )}
              </div>
              {dashboard.description && (
                <p className="text-xs text-text-secondary">{dashboard.description}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 text-xs text-text-tertiary sm:flex">
            <Clock className="h-3.5 w-3.5" />
            <span>Updated {lastRefreshTime.toLocaleTimeString()}</span>
          </div>

          <Dropdown
            value={String(autoRefresh)}
            onChange={(value) => setAutoRefresh(Number(value))}
            options={[
              { value: '0', label: 'Manual refresh' },
              { value: '5', label: 'Every 5 min' },
              { value: '15', label: 'Every 15 min' },
              { value: '30', label: 'Every 30 min' },
            ]}
            sizeClasses="w-[150px]"
            className="z-50"
          />

          <Button
            variant="outline"
            onClick={handleRefreshAll}
            className="flex items-center gap-2"
            title="Refresh all"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden lg:inline">Refresh</span>
          </Button>

          {!isPublic && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleStar}
                disabled={starMutation.isLoading}
                className="rounded-xl p-2 text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary"
                title={dashboard.starred ? 'Unstar' : 'Star'}
              >
                <Star
                  className={cn('h-5 w-5', dashboard.starred && 'fill-amber-500 text-amber-500')}
                />
              </Button>

              <Button
                variant="outline"
                onClick={() => setIsShareModalOpen(true)}
                className="flex items-center gap-2"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden lg:inline">Share</span>
              </Button>

              <Button
                onClick={() => navigate(`/d/dashboards/${dashboardId}/edit`)}
                variant="submit"
                className="flex items-center gap-2"
              >
                <Edit2 className="h-4 w-4" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="rounded-xl p-2 text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
        <DashboardGrid
          charts={dashboard.chartsWithData}
          layout={dashboard.charts}
          gridCols={dashboard.gridCols}
          isEditing={false}
          showBorders={dashboard.settings?.showBorders ?? true}
          onRefreshChart={handleRefreshChart}
          refreshingCharts={refreshingCharts}
        />
      </div>

      {!isPublic && (
        <ShareModal
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
          isPublic={dashboard.permissions?.isPublic || false}
          shareUrl={getShareUrl()}
          onTogglePublic={handleTogglePublic}
          isLoading={updateMutation.isLoading}
          onExportPNG={handleExportPNG}
          onExportPDF={handleExportPDF}
          isExporting={isExporting}
        />
      )}
    </div>
  );
}

function ShareModal({
  open,
  onOpenChange,
  isPublic,
  shareUrl,
  onTogglePublic,
  isLoading,
  onExportPNG,
  onExportPDF,
  isExporting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPublic: boolean;
  shareUrl: string;
  onTogglePublic: () => void;
  isLoading: boolean;
  onExportPNG: () => void;
  onExportPDF: () => void;
  isExporting: 'png' | 'pdf' | null;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-full max-w-md overflow-hidden rounded-xl rounded-b-lg bg-card p-0 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-border-light px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">Share Dashboard</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="rounded-sm p-1.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-border-xheavy focus:ring-offset-2"
          >
            <X className="h-5 w-5 text-text-primary" />
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-6">
          <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
            <div className="pb-3">
              <div className="flex items-center justify-between rounded-xl border border-border-light/60 bg-surface-secondary/50 p-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">Public link</p>
                  <p className="text-xs text-text-secondary">
                    {isPublic ? 'Anyone with the link can view' : 'Only you can access this dashboard'}
                  </p>
                </div>
                <Switch
                  id="public-toggle"
                  checked={isPublic}
                  onCheckedChange={onTogglePublic}
                  disabled={isLoading}
                  aria-label="Toggle public access"
                />
              </div>
            </div>

            {isPublic && shareUrl && (
              <div className="pb-3">
                <div className="flex items-center gap-2 rounded-xl border border-border-light/60 bg-surface-secondary/50 p-3">
                  <Link2 className="h-4 w-4 flex-shrink-0 text-text-tertiary" />
                  <Input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary focus:outline-none focus:ring-0"
                  />
                  <Button
                    onClick={handleCopy}
                    variant={copied ? 'outline' : 'default'}
                    size="sm"
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      copied
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-primary/10 text-primary hover:bg-primary/20',
                    )}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>

                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in new tab
                </a>
              </div>
            )}

            <div className="pb-3">
              <div className="text-sm font-medium text-text-primary">Export</div>
              <div className="mt-2 flex gap-2">
                <Button
                  onClick={onExportPNG}
                  disabled={isExporting === 'png'}
                  variant="outline"
                  className="flex flex-1 items-center justify-center gap-2 py-2.5"
                >
                  {isExporting === 'png' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  PNG
                </Button>
                <Button
                  onClick={onExportPDF}
                  disabled={isExporting === 'pdf'}
                  variant="outline"
                  className="flex flex-1 items-center justify-center gap-2 py-2.5"
                >
                  {isExporting === 'pdf' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  PDF
                </Button>
              </div>
            </div>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
