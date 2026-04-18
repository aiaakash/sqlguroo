import React, { useState } from 'react';
import { Database, Plus, AlertTriangle } from 'lucide-react';
import { useLocalize } from '~/hooks';
import {
  OGDialog,
  OGDialogTrigger,
  Spinner,
  Button,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogClose,
  OGDialogFooter,
} from '@librechat/client';
import ConnectionForm from '~/components/Nav/SettingsTabs/Analytics/ConnectionForm';
import {
  useAnalyticsConnections,
  useDeleteConnection,
  useTestConnection,
} from '~/components/Nav/SettingsTabs/Analytics/hooks';
import { ConnectionCard } from '~/components/SidePanel/shared';

export default function DatabaseConnectionsPanel() {
  const localize = useLocalize();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: connections, isLoading, refetch } = useAnalyticsConnections();
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

  const handleDeleteClick = (connectionId: string) => {
    setConnectionToDelete(connectionId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (connectionToDelete) {
      await deleteConnection.mutateAsync(connectionToDelete);
      setDeleteDialogOpen(false);
      setConnectionToDelete(null);
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

  const handleAddNew = () => {
    setEditingConnection(null);
    setIsFormOpen(true);
  };

  return (
    <div className="flex h-auto max-w-full flex-col gap-3 overflow-x-hidden p-3 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="icon-md" />
            <span className="font-medium">Database Connections</span>
          </div>
          <OGDialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <OGDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={handleAddNew}
              >
                <Plus className="h-4 w-4" />
                Add Connection
              </Button>
            </OGDialogTrigger>
            <ConnectionForm
              connectionId={editingConnection}
              onClose={handleCloseForm}
            />
          </OGDialog>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Connect your databases to enable AI-powered analytics queries
        </p>
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
              showEdit={false}
              actions={{
                onTest: handleTest,
                onDelete: handleDeleteClick,
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

      {/* Delete Confirmation Dialog */}
      <OGDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <OGDialogContent className="w-[400px]">
          <OGDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <OGDialogTitle>Delete Database Connection</OGDialogTitle>
              </div>
            </div>
          </OGDialogHeader>
          <p className="text-sm text-text-secondary">
            Are you sure you want to delete this database connection? This action cannot be undone.
          </p>
          <OGDialogFooter>
            <OGDialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </OGDialogClose>
            <Button type="button" variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </OGDialogFooter>
        </OGDialogContent>
      </OGDialog>

      {/* Supported Databases Section - DO NOT MODIFY */}
      <div className="mt-4 border-t border-border-medium pt-4">
        <h4 className="mb-3 font-medium">Supported Databases</h4>
        <div className="flex flex-wrap items-center gap-4 px-1">
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/clickhouse.svg"
            alt="ClickHouse"
            title="ClickHouse"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/mysql.svg"
            alt="MySQL"
            title="MySQL"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/postgresql.svg"
            alt="PostgreSQL"
            title="PostgreSQL"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlecloud.svg"
            alt="BigQuery"
            title="BigQuery"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazonaws.svg"
            alt="Redshift"
            title="Redshift"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/snowflake.svg"
            alt="Snowflake"
            title="Snowflake"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/oracle.svg"
            alt="Oracle"
            title="Oracle"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/microsoftsqlserver.svg"
            alt="SQL Server"
            title="SQL Server"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
        </div>
      </div>
    </div>
  );
}
