import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { TestTube } from 'lucide-react';
import {
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogClose,
  Spinner,
} from '@librechat/client';
import { useCreateConnection, useUpdateConnection, useTestNewConnection, useAnalyticsConnection } from './hooks';
import type { TCreateDatabaseConnectionRequest, DatabaseType, QueryMode } from 'librechat-data-provider';

interface ConnectionFormProps {
  organizationId: string;
  connectionId?: string | null;
  onClose: () => void;
}

interface FormData {
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  queryMode: QueryMode;
  queryTimeout: number;
  maxRows: number;
}

export default function ConnectionForm({ organizationId, connectionId, onClose }: ConnectionFormProps) {
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const testNewConnection = useTestNewConnection();
  const { data: existingConnection, isLoading: isLoadingConnection } = useAnalyticsConnection(
    connectionId || '',
    { enabled: !!connectionId }
  );

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      name: '',
      type: 'mysql' as DatabaseType,
      host: 'localhost',
      port: 3306,
      database: '',
      username: '',
      password: '',
      ssl: false,
      queryMode: 'read_only' as QueryMode,
      queryTimeout: 30000,
      maxRows: undefined,
    },
  });

  // Load existing connection data when editing
  useEffect(() => {
    if (existingConnection && connectionId) {
      reset({
        name: existingConnection.name,
        type: existingConnection.type,
        host: existingConnection.host,
        port: existingConnection.port,
        database: existingConnection.database,
        username: existingConnection.username,
        password: '', // Don't populate password for security
        ssl: existingConnection.ssl,
        queryMode: existingConnection.queryMode,
        queryTimeout: existingConnection.queryTimeout,
        maxRows: existingConnection.maxRows || undefined,
      });
    }
  }, [existingConnection, connectionId, reset]);

  const selectedType = watch('type');

  // Update default port when database type changes
  useEffect(() => {
    if (selectedType === 'clickhouse') {
      reset((prev) => ({ ...prev, port: 8123 }));
    } else if (selectedType === 'mysql') {
      reset((prev) => ({ ...prev, port: 3306 }));
    } else if (selectedType === 'postgresql') {
      reset((prev) => ({ ...prev, port: 5432 }));
    } else if (selectedType === 'redshift') {
      reset((prev) => ({ ...prev, port: 5439 }));
    } else if (selectedType === 'snowflake') {
      reset((prev) => ({ ...prev, port: 443 }));
    } else if (selectedType === 'oracle') {
      reset((prev) => ({ ...prev, port: 1521 }));
    } else if (selectedType === 'mssql') {
      reset((prev) => ({ ...prev, port: 1433 }));
    } else if (selectedType === 'bigquery') {
      // BigQuery doesn't use host/port, reset to defaults
      reset((prev) => ({ ...prev, host: '', port: 0 }));
    }
  }, [selectedType, reset]);

  const isBigQuery = selectedType === 'bigquery';

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    const formData = watch();

    // Prepare data based on database type
    const testData = { ...formData };

    // For BigQuery, set empty values for host, port, username
    if (isBigQuery) {
      testData.host = '';
      testData.port = 0;
      testData.username = '';
      testData.ssl = false;
    }

    try {
      const result = await testNewConnection.mutateAsync({
        ...testData,
        organizationId,
      } as TCreateDatabaseConnectionRequest);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setSubmitError(null);
    try {
      // Prepare data based on database type
      const submitData = { ...data };

      // For BigQuery, set empty values for host, port, username
      if (isBigQuery) {
        submitData.host = '';
        submitData.port = 0;
        submitData.username = '';
        submitData.ssl = false;
      }

      if (connectionId) {
        // For updates, only include password if it's a non-empty string
        const updateData = { ...submitData };
        if (!updateData.password || updateData.password === '') {
          delete updateData.password;
        }
        await updateConnection.mutateAsync({
          id: connectionId,
          data: updateData,
        });
      } else {
        await createConnection.mutateAsync({
          ...submitData,
          organizationId,
        } as TCreateDatabaseConnectionRequest);
      }
      onClose();
    } catch (error: any) {
      console.error('Failed to save connection:', error);
      const errorMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Failed to save connection';
      setSubmitError(errorMessage);
    }
  };

  // Check if this is a system connection that cannot be edited
  if (existingConnection?.isSystem) {
    return (
      <OGDialogContent className="w-[500px] !bg-card">
        <OGDialogHeader>
          <OGDialogTitle>System Database Connection</OGDialogTitle>
        </OGDialogHeader>
        <div className="py-6 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="mb-2 text-text-primary">
            <strong>{existingConnection.name}</strong> is a shared sample database.
          </p>
          <p className="text-sm text-text-secondary">
            This connection is managed by the system administrator and cannot be modified.
            You can use it to run read-only queries and explore the sample data.
          </p>
        </div>
        <div className="flex justify-end">
          <OGDialogClose asChild>
            <button
              type="button"
              className="rounded-lg border border-border-medium px-4 py-2 text-sm hover:bg-surface-hover"
            >
              Close
            </button>
          </OGDialogClose>
        </div>
      </OGDialogContent>
    );
  }

  if (isLoadingConnection && connectionId) {
    return (
      <OGDialogContent className="w-[500px]">
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      </OGDialogContent>
    );
  }

  return (
    <OGDialogContent className="w-[500px] !bg-card">
      <OGDialogHeader>
        <OGDialogTitle>
          {connectionId ? 'Edit Database Connection' : 'Add Database Connection'}
        </OGDialogTitle>
      </OGDialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium">Connection Name</label>
            <input
              {...register('name', { required: 'Name is required' })}
              className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
              placeholder="My Database"
            />
            {errors.name && (
              <span className="text-xs text-red-500">{errors.name.message}</span>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Database Type</label>
            <select
              {...register('type')}
              className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
            >
              <option value="mysql">MySQL</option>
              <option value="clickhouse">ClickHouse</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="bigquery">BigQuery</option>
              <option value="redshift">Redshift</option>
              <option value="snowflake">Snowflake</option>
              <option value="oracle">Oracle</option>
              <option value="mssql">SQL Server</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Query Mode</label>
            <select
              {...register('queryMode')}
              className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
            >
              <option value="read_only">Read Only (Recommended)</option>
              <option value="read_write">Read/Write</option>
            </select>
          </div>

          {!isBigQuery && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Host</label>
                <input
                  {...register('host', { required: !isBigQuery && 'Host is required' })}
                  className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
                  placeholder="localhost"
                />
                {errors.host && (
                  <span className="text-xs text-red-500">{errors.host.message}</span>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Port</label>
                <input
                  type="number"
                  {...register('port', { required: !isBigQuery && 'Port is required', valueAsNumber: true })}
                  className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
                />
                {errors.port && (
                  <span className="text-xs text-red-500">{errors.port.message}</span>
                )}
              </div>
            </>
          )}

          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium">
              {isBigQuery ? 'Project ID' : 'Database Name'}
            </label>
            <input
              {...register('database', { required: 'Database name is required' })}
              className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
              placeholder={isBigQuery ? 'my-project-id' : 'my_database'}
            />
            {errors.database && (
              <span className="text-xs text-red-500">{errors.database.message}</span>
            )}
            {isBigQuery && (
              <p className="mt-1 text-xs text-text-tertiary">
                Your Google Cloud Project ID
              </p>
            )}
          </div>

          {!isBigQuery && (
            <div>
              <label className="mb-1 block text-sm font-medium">Username</label>
              <input
                {...register('username', { required: !isBigQuery && 'Username is required' })}
                className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
                placeholder="root"
              />
              {errors.username && (
                <span className="text-xs text-red-500">{errors.username.message}</span>
              )}
            </div>
          )}

          <div className={isBigQuery ? 'col-span-2' : ''}>
            <label className="mb-1 block text-sm font-medium">
              {isBigQuery ? 'Service Account Credentials' : 'Password'} {connectionId && !isBigQuery && '(leave blank to keep existing)'}
            </label>
            {isBigQuery ? (
              <textarea
                {...register('password', { required: !connectionId && 'Service account credentials are required' })}
                className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
                placeholder='{"type": "service_account", "project_id": "...", ...}'
                rows={4}
              />
            ) : (
              <input
                type="password"
                {...register('password', { required: !connectionId && 'Password is required' })}
                className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
                placeholder="••••••••"
              />
            )}
            {errors.password && (
              <span className="text-xs text-red-500">{errors.password.message}</span>
            )}
            {isBigQuery && (
              <p className="mt-1 text-xs text-text-tertiary">
                Paste your service account JSON key or enter the path to your key file
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Query Timeout (ms)</label>
            <input
              type="number"
              {...register('queryTimeout', { valueAsNumber: true })}
              className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Max Rows <span className="text-text-tertiary">(optional)</span></label>
            <input
              type="number"
              placeholder="No limit"
              {...register('maxRows', { valueAsNumber: true })}
              className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-border-heavy focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-tertiary">Leave empty for no row limit</p>
          </div>

          {!isBigQuery && (
            <div className="col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register('ssl')}
                  className="rounded border-border-medium"
                />
                <span className="text-sm">Use SSL/TLS connection</span>
              </label>
            </div>
          )}
        </div>

        {testResult && (
          <div
            className={`rounded-lg p-3 text-sm ${testResult.success
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}
          >
            {testResult.message}
          </div>
        )}

        {submitError && (
          <div className="rounded-lg bg-red-100 p-3 text-sm text-red-800 dark:bg-red-900 dark:text-red-200">
            <p className="font-medium">Error</p>
            <p className="mt-1">{submitError}</p>
          </div>
        )}

        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting}
            className="flex items-center gap-1 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-50"
          >
            {isTesting ? <Spinner className="h-4 w-4" /> : <TestTube className="h-4 w-4" />}
            Test Connection
          </button>

          <div className="flex gap-2">
            <OGDialogClose asChild>
              <button
                type="button"
                className="rounded-lg border border-border-medium px-4 py-2 text-sm hover:bg-surface-hover"
              >
                Cancel
              </button>
            </OGDialogClose>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1 rounded-lg !bg-primary !text-primary-foreground px-4 py-2 text-sm hover:!bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting && <Spinner className="h-4 w-4" />}
              {connectionId ? 'Update' : 'Create'} Connection
            </button>
          </div>
        </div>
      </form>
    </OGDialogContent>
  );
}

