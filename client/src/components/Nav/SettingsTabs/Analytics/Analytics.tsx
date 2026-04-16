import React, { useState } from 'react';
import { Database, Plus } from 'lucide-react';
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { OGDialog, OGDialogTrigger, Spinner } from '@librechat/client';
import ConnectionForm from './ConnectionForm';
import GitHubConnectionsPanel from './GitHubConnectionsPanel';
import { useAnalyticsConnections, useDeleteConnection, useTestConnection } from './hooks';
import { ConnectionCard, DbTypeIcon } from '~/components/SidePanel/shared';

const SUPPORTED_DATABASES = [
  {
    name: 'ClickHouse',
    desc: 'Data warehouse',
    initials: 'CH',
    bgClass: 'bg-yellow-100 dark:bg-yellow-900',
    textClass: 'text-yellow-800 dark:text-yellow-200',
  },
  {
    name: 'MySQL',
    desc: 'Relational database',
    initials: 'My',
    bgClass: 'bg-blue-100 dark:bg-blue-900',
    textClass: 'text-blue-800 dark:text-blue-200',
  },
  {
    name: 'PostgreSQL',
    desc: 'Relational database',
    initials: 'PG',
    bgClass: 'bg-indigo-100 dark:bg-indigo-900',
    textClass: 'text-indigo-800 dark:text-indigo-200',
  },
  {
    name: 'BigQuery',
    desc: 'Data warehouse',
    initials: 'BQ',
    bgClass: 'bg-green-100 dark:bg-green-900',
    textClass: 'text-green-800 dark:text-green-200',
  },
  {
    name: 'Redshift',
    desc: 'Data warehouse',
    initials: 'RS',
    bgClass: 'bg-red-100 dark:bg-red-900',
    textClass: 'text-red-800 dark:text-red-200',
  },
  {
    name: 'Snowflake',
    desc: 'Data warehouse',
    initials: 'SF',
    bgClass: 'bg-cyan-100 dark:bg-cyan-900',
    textClass: 'text-cyan-800 dark:text-cyan-200',
  },
  {
    name: 'Oracle',
    desc: 'Relational database',
    initials: 'OR',
    bgClass: 'bg-orange-100 dark:bg-orange-900',
    textClass: 'text-orange-800 dark:text-orange-200',
  },
  {
    name: 'SQL Server',
    desc: 'Relational database',
    initials: 'MS',
    bgClass: 'bg-red-100 dark:bg-red-900',
    textClass: 'text-red-800 dark:text-red-200',
  },
];

export default function Analytics() {
  const localize = useLocalize();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const organizationId = 'default-org';

  const { data: connections, isLoading, refetch } = useAnalyticsConnections(organizationId);
  const deleteConnection = useDeleteConnection();
  const testConnection = useTestConnection();

  const handleTest = async (connectionId: string) => {
    setTestingConnection(connectionId);
    try {
      await testConnection.mutateAsync(connectionId);
    } finally {
      setTestingConnection(null);
    }
  };

  const handleDelete = async (connectionId: string) => {
    if (window.confirm('Are you sure you want to delete this connection?')) {
      await deleteConnection.mutateAsync(connectionId);
    }
  };

  const handleEdit = (connectionId: string) => {
    setEditingConnection(connectionId);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingConnection(null);
    refetch();
  };

  return (
    <div className="flex flex-col text-sm text-text-primary">
      <Accordion.Root
        type="multiple"
        defaultValue={['connections', 'github', 'databases']}
        className="flex flex-col gap-1"
      >
        {/* Database Connections Section */}
        <Accordion.Item value="connections" className="border-b border-border-light">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between py-3 text-left font-medium text-text-primary [&[data-state=open]>svg]:rotate-180">
              <div className="flex items-center gap-2">
                <Database className="icon-md" />
                <span>Database Connections</span>
                {connections && (
                  <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-[10px] text-text-secondary">
                    {connections.length}
                  </span>
                )}
              </div>
              <ChevronDown className="h-4 w-4 text-text-secondary transition-transform duration-200" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="pb-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-text-secondary">
                  Connect your databases to enable AI-powered analytics queries
                </p>
                <OGDialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                  <OGDialogTrigger asChild>
                    <button
                      className="flex items-center gap-1 rounded-lg bg-surface-submit px-3 py-1.5 text-sm text-white hover:bg-surface-submit-hover"
                      onClick={() => {
                        setEditingConnection(null);
                        setIsFormOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add Connection
                    </button>
                  </OGDialogTrigger>
                  <ConnectionForm
                    organizationId={organizationId}
                    connectionId={editingConnection}
                    onClose={handleCloseForm}
                  />
                </OGDialog>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : connections && connections.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {connections.map((connection) => (
                    <ConnectionCard
                      key={connection._id}
                      connection={connection}
                      testingId={testingConnection}
                      showDetails={expandedId === connection._id}
                      actions={{
                        onTest: handleTest,
                        onEdit: handleEdit,
                        onDelete: handleDelete,
                        onToggleDetails: (id) => setExpandedId(expandedId === id ? null : id),
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-surface-secondary/50 flex flex-col items-center justify-center rounded-xl border border-dashed border-border-light py-8 text-center">
                  <Database className="mb-2 h-8 w-8 text-text-tertiary" />
                  <p className="text-sm text-text-secondary">No database connections configured</p>
                  <p className="text-xs text-text-tertiary">
                    Add a connection to start asking questions about your data
                  </p>
                </div>
              )}
            </div>
          </Accordion.Content>
        </Accordion.Item>

        {/* GitHub Repositories Section */}
        <Accordion.Item value="github" className="border-b border-border-light">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between py-3 text-left font-medium text-text-primary [&[data-state=open]>svg]:rotate-180">
              <div className="flex items-center gap-2">
                <svg className="icon-md" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span>GitHub Repositories</span>
              </div>
              <ChevronDown className="h-4 w-4 text-text-secondary transition-transform duration-200" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="pb-4">
              <GitHubConnectionsPanel />
            </div>
          </Accordion.Content>
        </Accordion.Item>

        {/* Supported Databases Section */}
        <Accordion.Item value="databases">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between py-3 text-left font-medium text-text-primary [&[data-state=open]>svg]:rotate-180">
              <div className="flex items-center gap-2">
                <DbTypeIcon type="mysql" className="h-4 w-4" />
                <span>Supported Databases</span>
              </div>
              <ChevronDown className="h-4 w-4 text-text-secondary transition-transform duration-200" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="pb-4">
              <div className="grid grid-cols-2 gap-2">
                {SUPPORTED_DATABASES.map((db) => (
                  <div
                    key={db.name}
                    className="flex items-center gap-2 rounded-lg border border-border-light p-2"
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded ${db.bgClass}`}
                    >
                      <span className={`text-sm font-bold ${db.textClass}`}>{db.initials}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium">{db.name}</span>
                      <p className="text-xs text-text-tertiary">{db.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </div>
  );
}
