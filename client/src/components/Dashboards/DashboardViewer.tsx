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
} from 'lucide-react';
import {
  useGetDashboardWithChartsQuery,
  useGetPublicDashboardQuery,
  useToggleDashboardStarMutation,
  useUpdateDashboardMutation,
} from 'librechat-data-provider';
import { Skeleton, OGDialog, OGDialogContent, useToastContext } from '@librechat/client';
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

  // State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [refreshingCharts, setRefreshingCharts] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState<'png' | 'pdf' | null>(null);

  // Queries
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

  // Mutations
  const starMutation = useToggleDashboardStarMutation();
  const updateMutation = useUpdateDashboardMutation();

  // Auto-refresh
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

  // Fullscreen handling
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

  // Refresh handlers
  const handleRefreshAll = useCallback(async () => {
    refetch();
    setLastRefreshTime(new Date());
  }, [refetch]);

  const handleRefreshChart = useCallback(async (chartId: string) => {
    setRefreshingCharts((prev) => new Set([...prev, chartId]));
    // Simulate refresh - in real app, this would refetch chart data
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshingCharts((prev) => {
      const newSet = new Set(prev);
      newSet.delete(chartId);
      return newSet;
    });
  }, []);

  // Toggle star
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

  // Generate share URL
  const getShareUrl = () => {
    if (!dashboard?.permissions?.shareId) return '';
    return `${window.location.origin}/d/dashboards/public/${dashboard.permissions.shareId}`;
  };

  // Toggle public
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

  // Export to PNG
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

  // Export to PDF
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

  // Loading state
  if (loading) {
    return (
      <div className="dark:bg-surface-primary-dark flex h-screen w-full flex-col bg-surface-primary">
        <div className="dark:border-border-dark flex h-16 items-center justify-between border-b border-border-light px-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="flex-1 p-6">
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError || !dashboard) {
    return (
      <div className="dark:bg-surface-primary-dark flex h-screen w-full items-center justify-center bg-surface-primary">
        <div className="text-center">
          <p className="text-text-secondary">
            {isPublic ? 'This dashboard is not available' : 'Failed to load dashboard'}
          </p>
          {!isPublic && (
            <button
              onClick={() => navigate('/d/dashboards')}
              className="mt-4 text-blue-500 hover:underline"
            >
              Back to Dashboards
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'dark:bg-surface-primary-dark flex h-screen w-full flex-col overflow-hidden bg-surface-primary',
        isFullscreen && 'fixed inset-0 z-50',
      )}
    >
      {/* Header */}
      <div className="dark:border-border-dark flex h-16 flex-shrink-0 items-center justify-between border-b border-border-light px-4">
        {/* Left side */}
        <div className="flex items-center gap-4">
          {!isPublic && (
            <>
              <button
                onClick={() => navigate('/d/dashboards')}
                className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back</span>
              </button>
              <div className="dark:bg-border-dark h-6 w-px bg-border-light" />
            </>
          )}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
              <DashboardIcon icon={dashboard.icon} className="text-white" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-text-primary">{dashboard.name}</h1>
                {!isPublic && dashboard.starred && (
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                )}
              </div>
              {dashboard.description && (
                <p className="text-xs text-text-secondary">{dashboard.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Last refresh */}
          <div className="hidden items-center gap-1.5 text-xs text-text-tertiary sm:flex">
            <Clock className="h-3.5 w-3.5" />
            <span>Updated {lastRefreshTime.toLocaleTimeString()}</span>
          </div>

          {/* Auto-refresh dropdown */}
          <div className="relative">
            <select
              value={autoRefresh}
              onChange={(e) => setAutoRefresh(Number(e.target.value))}
              className="dark:border-border-dark dark:bg-surface-secondary-dark rounded-lg border border-border-light bg-surface-secondary px-2 py-1.5 text-xs text-text-secondary focus:outline-none"
            >
              <option value={0}>Manual refresh</option>
              <option value={5}>Every 5 min</option>
              <option value={15}>Every 15 min</option>
              <option value={30}>Every 30 min</option>
            </select>
          </div>

          {/* Refresh all */}
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            title="Refresh all"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden lg:inline">Refresh</span>
          </button>

          {!isPublic && (
            <>
              {/* Star */}
              <button
                onClick={handleToggleStar}
                disabled={starMutation.isLoading}
                className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                title={dashboard.starred ? 'Unstar' : 'Star'}
              >
                <Star
                  className={cn('h-5 w-5', dashboard.starred && 'fill-amber-400 text-amber-400')}
                />
              </button>

              {/* Share */}
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden lg:inline">Share</span>
              </button>

              {/* Edit */}
              <button
                onClick={() => navigate(`/d/dashboards/${dashboardId}/edit`)}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
              >
                <Edit2 className="h-4 w-4" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            </>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
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

      {/* Share Modal */}
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

// Share Modal Component
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
      <OGDialogContent className="dark:bg-surface-primary-dark w-full max-w-md overflow-hidden rounded-2xl border-0 bg-surface-primary p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Share Dashboard</h2>

        {/* Public toggle */}
        <div className="dark:border-border-dark dark:bg-surface-secondary-dark mb-6 flex items-center justify-between rounded-xl border border-border-light bg-surface-secondary p-4">
          <div>
            <p className="text-sm font-medium text-text-primary">Public link</p>
            <p className="text-xs text-text-secondary">
              {isPublic ? 'Anyone with the link can view' : 'Only you can access this dashboard'}
            </p>
          </div>
          <button
            onClick={onTogglePublic}
            disabled={isLoading}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors',
              isPublic ? 'bg-blue-500' : 'bg-surface-hover',
            )}
          >
            {isLoading ? (
              <Loader2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
            ) : (
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                  isPublic ? 'left-[22px]' : 'left-0.5',
                )}
              />
            )}
          </button>
        </div>

        {/* Share link */}
        {isPublic && shareUrl && (
          <div className="space-y-3">
            <div className="dark:border-border-dark dark:bg-surface-secondary-dark flex items-center gap-2 rounded-xl border border-border-light bg-surface-secondary p-3">
              <Link2 className="h-4 w-4 flex-shrink-0 text-text-tertiary" />
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="min-w-0 flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  copied
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20',
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
              </button>
            </div>

            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </a>
          </div>
        )}

        {/* Export options */}
        <div className="dark:border-border-dark mt-6 border-t border-border-light pt-6">
          <p className="mb-3 text-sm font-medium text-text-primary">Export</p>
          <div className="flex gap-2">
            <button
              onClick={onExportPNG}
              disabled={isExporting === 'png'}
              className="dark:border-border-dark flex flex-1 items-center justify-center gap-2 rounded-xl border border-border-light py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            >
              {isExporting === 'png' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              PNG
            </button>
            <button
              onClick={onExportPDF}
              disabled={isExporting === 'pdf'}
              className="dark:border-border-dark flex flex-1 items-center justify-center gap-2 rounded-xl border border-border-light py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            >
              {isExporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              PDF
            </button>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
