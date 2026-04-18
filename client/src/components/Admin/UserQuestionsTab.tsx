import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader,
  X,
  Filter,
  Clock,
  User,
  Cpu,
  Calendar,
  ArrowUpDown,
  Maximize2,
  Minimize2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { Button, Input } from '@librechat/client';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

interface TQuestion {
  id: string;
  messageId: string;
  conversationId: string;
  text: string;
  sender: string;
  model: string;
  endpoint: string;
  user: string;
  userName: string;
  userEmail: string;
  conversationTitle: string;
  createdAt: string;
}

interface TPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type SortField = 'createdAt' | 'userEmail' | 'model' | 'endpoint';
type SortDir = 'asc' | 'desc';
type TimeFilter = 'all' | 'today' | 'week' | 'month' | 'quarter';

const ENDPOINT_COLORS: Record<string, string> = {
  openAI: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  azureOpenAI: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  anthropic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  google: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  groq: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  ollama: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};

function getEndpointColor(endpoint: string): string {
  if (!endpoint) return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  const key = endpoint.replace(/\s+/g, '').toLowerCase();
  return ENDPOINT_COLORS[key] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function truncateText(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

export default function UserQuestionsTab() {
  const localize = useLocalize();
  const [questions, setQuestions] = useState<TQuestion[]>([]);
  const [pagination, setPagination] = useState<TPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<TQuestion | null>(null);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [stats, setStats] = useState({ totalByEndpoint: {} as Record<string, number>, totalByUser: 0, totalQuestions: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const fetchQuestions = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
        sort: sortField,
        dir: sortDir,
      });
      if (search) params.set('search', search);
      if (userFilter) params.set('user', userFilter);
      if (endpointFilter) params.set('endpoint', endpointFilter);
      if (timeFilter !== 'all') params.set('time', timeFilter);

      const res = await fetch(`/api/admin/questions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions);
        setPagination(data.pagination);
        if (data.stats) setStats(data.stats);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [search, userFilter, endpointFilter, timeFilter, sortField, sortDir]);

  useEffect(() => {
    fetchQuestions(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (q: TQuestion) => {
    setSelectedQuestion(q);
    setShowDetail(true);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    fetchQuestions(1);
  };

  const handleApplyFilters = () => {
    fetchQuestions(1);
    listRef.current?.scrollTo({ top: 0 });
  };

  const handleClearFilters = () => {
    setSearch('');
    setUserFilter('');
    setEndpointFilter('');
    setTimeFilter('all');
    fetchQuestions(1);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const activeFilterCount = [search, userFilter, endpointFilter, timeFilter !== 'all' ? '1' : ''].filter(Boolean).length;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 text-text-tertiary" />;
    return sortDir === 'asc'
      ? <ChevronLeft className="ml-1 h-3 w-3 rotate-90 text-text-primary" />
      : <ChevronRight className="ml-1 h-3 w-3 rotate-90 text-text-primary" />;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top Bar - Search + Actions */}
      <div className="flex-shrink-0 border-b border-border-light px-4 py-2 dark:border-border-dark">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              type="text"
              placeholder="Search questions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
              className="w-full pl-9 pr-20"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); handleApplyFilters(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-surface-hover"
              >
                <X className="h-3.5 w-3.5 text-text-tertiary" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn('relative', showFilters && 'bg-surface-tertiary')}
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchQuestions(pagination?.page || 1)} disabled={loading}>
            <Loader className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border-light bg-surface-tertiary p-2 dark:border-border-dark">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-text-tertiary" />
              <select
                value={timeFilter}
                onChange={e => setTimeFilter(e.target.value as TimeFilter)}
                className="rounded border border-border-light bg-surface-primary px-2 py-1 text-xs dark:border-border-dark"
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
                <option value="quarter">Last 3 months</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-text-tertiary" />
              <Input
                type="text"
                placeholder="User..."
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                className="h-7 w-36 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-text-tertiary" />
              <Input
                type="text"
                placeholder="Endpoint..."
                value={endpointFilter}
                onChange={e => setEndpointFilter(e.target.value)}
                className="h-7 w-32 text-xs"
              />
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={handleApplyFilters}>Apply</Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClearFilters}>Clear all</Button>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1">
        {/* Questions List */}
        <div className={cn('flex flex-col border-r border-border-light dark:border-border-dark transition-all', showDetail ? 'w-1/2' : 'w-full')}>
          {/* Column Headers */}
          <div className="flex-shrink-0 border-b border-border-light bg-surface-tertiary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary dark:border-border-dark">
            <div className="flex items-center">
              <button className="flex-1 text-left" onClick={() => handleSort('createdAt')}>
                <span className="flex items-center">Date <SortIcon field="createdAt" /></span>
              </button>
              <button className="w-48 text-left" onClick={() => handleSort('userEmail')}>
                <span className="flex items-center">User <SortIcon field="userEmail" /></span>
              </button>
              <span className="w-56 truncate pl-1">Question</span>
              <button className="w-28 text-left" onClick={() => handleSort('model')}>
                <span className="flex items-center">Model <SortIcon field="model" /></span>
              </button>
              <button className="w-24 text-left" onClick={() => handleSort('endpoint')}>
                <span className="flex items-center">Source <SortIcon field="endpoint" /></span>
              </button>
            </div>
          </div>

          {/* List */}
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader className="h-6 w-6 animate-spin text-text-secondary" />
              </div>
            ) : questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="mb-2 h-10 w-10 text-text-tertiary" />
                <p className="text-text-secondary">No questions found</p>
                <p className="mt-1 text-xs text-text-tertiary">Adjust filters or search terms</p>
              </div>
            ) : (
              <div className="divide-y divide-border-light dark:divide-border-dark">
                {questions.map(q => (
                  <div
                    key={q.id}
                    className={cn(
                      'flex cursor-pointer items-center px-3 py-2 text-sm transition-colors hover:bg-surface-hover',
                      selectedQuestion?.id === q.id && 'bg-surface-active'
                    )}
                    onClick={() => handleSelect(q)}
                  >
                    <span className="w-16 flex-shrink-0 text-xs text-text-tertiary">
                      {formatDate(q.createdAt)}
                    </span>
                    <span className="w-48 flex-shrink-0 truncate pr-2 text-xs text-text-secondary">
                      {q.userName || q.userEmail || '—'}
                    </span>
                    <span className="w-56 flex-1 truncate pr-2 text-text-primary">
                      {truncateText(q.text, 80)}
                    </span>
                    <span className="w-28 flex-shrink-0 pr-1">
                      {q.model ? (
                        <span className="truncate text-xs text-text-secondary" title={q.model}>
                          {q.model.split('/').pop()?.substring(0, 20) || q.model}
                        </span>
                      ) : '—'}
                    </span>
                    <span className="w-24 flex-shrink-0">
                      {q.endpoint && (
                        <span className={cn('inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium', getEndpointColor(q.endpoint))}>
                          {q.endpoint.substring(0, 12)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex-shrink-0 flex items-center justify-between border-t border-border-light px-3 py-1.5 text-xs dark:border-border-dark">
              <span className="text-text-tertiary">
                {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => fetchQuestions(1)} disabled={pagination.page === 1}>
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => fetchQuestions(pagination.page - 1)} disabled={pagination.page === 1}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="mx-1 text-text-secondary">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => fetchQuestions(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => fetchQuestions(pagination.totalPages)} disabled={pagination.page >= pagination.totalPages}>
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {showDetail && selectedQuestion && (
          <div className="flex w-1/2 flex-col">
            {/* Detail Header */}
            <div className="flex-shrink-0 flex items-center justify-between border-b border-border-light px-4 py-2 dark:border-border-dark">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-text-secondary" />
                <h3 className="text-sm font-medium text-text-primary">Question Details</h3>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleCopyText(selectedQuestion.text)} title="Copy question">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowDetail(false)} title="Close">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Detail Content */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* Meta */}
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">Conversation:</span>
                  <span className="text-sm font-medium text-text-primary">{selectedQuestion.conversationTitle}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-text-tertiary" />
                    <span className="text-xs text-text-secondary">{selectedQuestion.userName || selectedQuestion.userEmail}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-text-tertiary" />
                    <span className="text-xs text-text-secondary">{formatFullDate(selectedQuestion.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedQuestion.model && (
                    <span className="rounded-full bg-surface-tertiary px-2.5 py-0.5 text-xs text-text-secondary">
                      {selectedQuestion.model}
                    </span>
                  )}
                  {selectedQuestion.endpoint && (
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', getEndpointColor(selectedQuestion.endpoint))}>
                      {selectedQuestion.endpoint}
                    </span>
                  )}
                </div>
              </div>

              {/* Question Text */}
              <div className="rounded-lg border border-border-light bg-surface-tertiary p-4 dark:border-border-dark">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Question</h4>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{selectedQuestion.text}</p>
              </div>

              {/* IDs */}
              <div className="mt-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-text-tertiary">
                  <span className="w-20 flex-shrink-0">Message ID:</span>
                  <code className="truncate font-mono">{selectedQuestion.messageId}</code>
                  <button onClick={() => navigator.clipboard.writeText(selectedQuestion.messageId)} className="flex-shrink-0 hover:text-text-primary">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-tertiary">
                  <span className="w-20 flex-shrink-0">Conv ID:</span>
                  <code className="truncate font-mono">{selectedQuestion.conversationId}</code>
                  <button onClick={() => navigator.clipboard.writeText(selectedQuestion.conversationId)} className="flex-shrink-0 hover:text-text-primary">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-tertiary">
                  <span className="w-20 flex-shrink-0">User ID:</span>
                  <code className="truncate font-mono">{selectedQuestion.user}</code>
                  <button onClick={() => navigator.clipboard.writeText(selectedQuestion.user)} className="flex-shrink-0 hover:text-text-primary">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
