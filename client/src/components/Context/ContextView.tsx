import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Database,
  Table2,
  ChevronDown,
  ChevronRight,
  Save,
  Edit2,
  FileText,
  MessageSquare,
  Search,
  X,
  Info,
  Check,
} from 'lucide-react';
import { Spinner } from '@librechat/client';
import { useLocalize, useCustomLink } from '~/hooks';
import { useDashboardContext } from '~/Providers';
import {
  useAnalyticsConnections,
  useAnalyticsSchema,
  useTableDescriptions,
  useSaveTableDescriptions,
} from '~/components/Nav/SettingsTabs/Analytics/hooks';
import type { TTableSchema, TColumnSchema } from 'librechat-data-provider';
import { cn } from '~/utils';

export const ContextView: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { prevLocationPath } = useDashboardContext();

  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  // State for table descriptions (local edits)
  const [localTableDescriptions, setLocalTableDescriptions] = useState<Record<string, string>>({});
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [tempTableDescription, setTempTableDescription] = useState('');

  // State for column descriptions (local edits)
  const [localColumnDescriptions, setLocalColumnDescriptions] = useState<Record<string, string>>(
    {},
  );
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [tempColumnDescription, setTempColumnDescription] = useState('');

  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Get last conversation ID for back navigation
  const getConversationId = (prevPath: string) => {
    if (!prevPath || prevPath.includes('/d/')) {
      return 'new';
    }
    const lastPathnameParts = prevPath.split('/');
    return lastPathnameParts[lastPathnameParts.length - 1];
  };

  const lastConversationId = useMemo(
    () => getConversationId(prevLocationPath || ''),
    [prevLocationPath],
  );
  const chatLinkHandler = useCustomLink('/c/' + lastConversationId);

  // Load connections
  const { data: connections, isLoading: isLoadingConnections } =
    useAnalyticsConnections();

  // Load schema for selected connection
  const {
    data: schemaData,
    isLoading: isLoadingSchema,
    error: schemaError,
  } = useAnalyticsSchema(selectedConnection ?? '', {
    enabled: !!selectedConnection && selectedConnection.length > 0,
  });

  // Load saved descriptions from database
  const { data: savedDescriptions, isLoading: isLoadingDescriptions } = useTableDescriptions(
    selectedConnection ?? '',
    {
      enabled: !!selectedConnection && selectedConnection.length > 0,
    },
  );

  // Save descriptions mutation
  const saveDescriptionsMutation = useSaveTableDescriptions();

  // Sync local state with saved descriptions when they load
  useEffect(() => {
    if (savedDescriptions) {
      setLocalTableDescriptions(savedDescriptions.tableDescriptions || {});
      setLocalColumnDescriptions(savedDescriptions.columnDescriptions || {});
      setHasUnsavedChanges(false);
    }
  }, [savedDescriptions]);

  const tables = useMemo(() => {
    return schemaData?.schema?.tables || [];
  }, [schemaData]);

  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    const query = searchQuery.toLowerCase();
    return tables.filter(
      (table) =>
        table.name.toLowerCase().includes(query) ||
        table.columns.some((col) => col.name.toLowerCase().includes(query)),
    );
  }, [tables, searchQuery]);

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  // Table description handlers
  const startEditingTable = (tableName: string, currentDescription: string = '') => {
    setEditingTable(tableName);
    setTempTableDescription(currentDescription);
  };

  const saveTableDescription = (tableName: string) => {
    setLocalTableDescriptions((prev) => ({
      ...prev,
      [tableName]: tempTableDescription,
    }));
    setEditingTable(null);
    setTempTableDescription('');
    setHasUnsavedChanges(true);
  };

  const cancelEditingTable = () => {
    setEditingTable(null);
    setTempTableDescription('');
  };

  // Column description handlers
  // Use a separator that doesn't conflict with MongoDB field names
  const COLUMN_KEY_SEPARATOR = '::';

  const startEditingColumn = (
    tableName: string,
    columnName: string,
    currentDescription: string = '',
  ) => {
    setEditingColumn(`${tableName}${COLUMN_KEY_SEPARATOR}${columnName}`);
    setTempColumnDescription(currentDescription);
  };

  const saveColumnDescription = (tableName: string, columnName: string) => {
    const key = `${tableName}${COLUMN_KEY_SEPARATOR}${columnName}`;
    setLocalColumnDescriptions((prev) => ({
      ...prev,
      [key]: tempColumnDescription,
    }));
    setEditingColumn(null);
    setTempColumnDescription('');
    setHasUnsavedChanges(true);
  };

  const cancelEditingColumn = () => {
    setEditingColumn(null);
    setTempColumnDescription('');
  };

  const getTableDescription = (tableName: string): string => {
    return localTableDescriptions[tableName] || '';
  };

  const getColumnDescription = (tableName: string, columnName: string): string => {
    return localColumnDescriptions[`${tableName}${COLUMN_KEY_SEPARATOR}${columnName}`] || '';
  };

  // Save all descriptions to database
  const handleSaveAll = async () => {
    if (!selectedConnection) return;

    try {
      await saveDescriptionsMutation.mutateAsync({
        connectionId: selectedConnection,
        tableDescriptions: localTableDescriptions,
        columnDescriptions: localColumnDescriptions,
      });
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save descriptions:', error);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary">
      {/* Header */}
      <div className="bg-surface-primary/80 dark:border-border-dark sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-border-light px-4 backdrop-blur-md lg:px-6">
        <div className="flex items-center gap-4">
          <a
            href="/"
            onClick={chatLinkHandler}
            className="flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden text-base sm:inline">{localize('com_ui_back_to_chat')}</span>
          </a>
          <div className="dark:bg-border-dark h-6 w-px shrink-0 bg-border-light" />
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            <h1 className="text-lg font-semibold text-text-primary">
              {localize('com_context_title')}
            </h1>
          </div>
        </div>

        {selectedConnection && hasUnsavedChanges && (
          <button
            onClick={handleSaveAll}
            disabled={saveDescriptionsMutation.isLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saveDescriptionsMutation.isLoading ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {localize('com_ui_save')}
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Connections */}
        <div className="bg-surface-secondary/30 flex w-72 flex-col border-r border-border-light">
          <div className="border-b border-border-light p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <Database className="h-4 w-4" />
              {localize('com_context_connections')}
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              {localize('com_context_select_connection')}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoadingConnections ? (
              <div className="flex justify-center p-4">
                <Spinner className="h-5 w-5" />
              </div>
            ) : !connections || connections.length === 0 ? (
              <div className="p-4 text-center">
                <Database className="mx-auto mb-2 h-8 w-8 text-text-tertiary" />
                <p className="text-sm text-text-secondary">
                  {localize('com_context_no_connections')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {connections.map((connection) => (
                  <button
                    key={connection._id}
                    onClick={() => setSelectedConnection(connection._id)}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                      selectedConnection === connection._id
                        ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
                        : 'border-transparent hover:bg-surface-secondary',
                    )}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      <div
                        className={cn(
                          'h-2 w-2 rounded-full',
                          connection.lastTestSuccess
                            ? 'bg-green-500'
                            : connection.lastTestSuccess === false
                              ? 'bg-red-500'
                              : 'bg-gray-400',
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {connection.name}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {connection.type} • {connection.database}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Content - Tables */}
        <div className="flex-1 overflow-y-auto">
          {!selectedConnection ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <Database className="mb-4 h-16 w-16 text-text-tertiary" />
              <h3 className="mb-2 text-lg font-medium text-text-primary">
                {localize('com_context_select_connection_title')}
              </h3>
              <p className="max-w-md text-center text-sm text-text-secondary">
                {localize('com_context_select_connection_description')}
              </p>
            </div>
          ) : isLoadingSchema || isLoadingDescriptions ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Spinner className="mx-auto mb-4 h-8 w-8" />
                <p className="text-text-secondary">{localize('com_context_loading_schema')}</p>
              </div>
            </div>
          ) : schemaError ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="mb-4 rounded-full bg-red-100 p-4 dark:bg-red-900/20">
                <Database className="h-12 w-12 text-red-500" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-text-primary">
                {localize('com_context_schema_error')}
              </h3>
              <p className="max-w-md text-center text-sm text-text-secondary">
                {schemaError instanceof Error
                  ? schemaError.message
                  : localize('com_context_schema_error_generic')}
              </p>
            </div>
          ) : tables.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <Table2 className="mb-4 h-16 w-16 text-text-tertiary" />
              <h3 className="mb-2 text-lg font-medium text-text-primary">
                {localize('com_context_no_tables')}
              </h3>
              <p className="max-w-md text-center text-sm text-text-secondary">
                {localize('com_context_no_tables_description')}
              </p>
            </div>
          ) : (
            <div className="p-6">
              {/* Connection Info & Search */}
              <div className="mb-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      {connections?.find((c) => c._id === selectedConnection)?.name}
                    </h2>
                    <p className="text-sm text-text-secondary">
                      {tables.length} {tables.length === 1 ? 'table' : 'tables'}
                    </p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                    <input
                      type="text"
                      placeholder={localize('com_context_search_tables')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-surface-primary/50 h-9 w-64 rounded-lg border border-border-light pl-9 pr-3 text-sm text-text-primary transition-all placeholder:text-text-tertiary focus:border-blue-500 focus:bg-surface-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-text-secondary dark:bg-blue-900/20">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                  <p>{localize('com_context_description_hint')}</p>
                </div>
              </div>

              {/* Tables List */}
              <div className="space-y-4">
                {filteredTables.map((table) => (
                  <TableContextCard
                    key={table.name}
                    table={table}
                    isExpanded={expandedTables.has(table.name)}
                    onToggle={() => toggleTable(table.name)}
                    tableDescription={getTableDescription(table.name)}
                    editingTable={editingTable === table.name}
                    tempTableDescription={tempTableDescription}
                    onEditTable={() =>
                      startEditingTable(table.name, getTableDescription(table.name))
                    }
                    onSaveTable={() => saveTableDescription(table.name)}
                    onCancelTable={cancelEditingTable}
                    onTempTableChange={setTempTableDescription}
                    columnDescriptions={localColumnDescriptions}
                    editingColumn={editingColumn}
                    tempColumnDescription={tempColumnDescription}
                    onEditColumn={(columnName) =>
                      startEditingColumn(
                        table.name,
                        columnName,
                        getColumnDescription(table.name, columnName),
                      )
                    }
                    onSaveColumn={(columnName) => saveColumnDescription(table.name, columnName)}
                    onCancelColumn={cancelEditingColumn}
                    onTempColumnChange={setTempColumnDescription}
                    getColumnDescription={(colName) => getColumnDescription(table.name, colName)}
                    localize={localize}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface TableContextCardProps {
  table: TTableSchema;
  isExpanded: boolean;
  onToggle: () => void;
  tableDescription: string;
  editingTable: boolean;
  tempTableDescription: string;
  onEditTable: () => void;
  onSaveTable: () => void;
  onCancelTable: () => void;
  onTempTableChange: (value: string) => void;
  columnDescriptions: Record<string, string>;
  editingColumn: string | null;
  tempColumnDescription: string;
  onEditColumn: (columnName: string) => void;
  onSaveColumn: (columnName: string) => void;
  onCancelColumn: () => void;
  onTempColumnChange: (value: string) => void;
  getColumnDescription: (columnName: string) => string;
  localize: (key: string) => string;
}

function TableContextCard({
  table,
  isExpanded,
  onToggle,
  tableDescription,
  editingTable,
  tempTableDescription,
  onEditTable,
  onSaveTable,
  onCancelTable,
  onTempTableChange,
  editingColumn,
  tempColumnDescription,
  onEditColumn,
  onSaveColumn,
  onCancelColumn,
  onTempColumnChange,
  getColumnDescription,
  localize,
}: TableContextCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border-light bg-surface-primary">
      {/* Table Header */}
      <div className="bg-surface-secondary/50 flex items-center justify-between border-b border-border-light p-4">
        <button onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 flex-shrink-0 text-text-tertiary" />
          ) : (
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-text-tertiary" />
          )}
          <Table2 className="h-5 w-5 flex-shrink-0 text-blue-500" />
          <span className="text-base font-semibold text-text-primary">{table.name}</span>
          <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-tertiary">
            {table.columns.length} columns
          </span>
        </button>

        {!editingTable && (
          <button
            onClick={onEditTable}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-blue-600 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <Edit2 className="h-4 w-4" />
            {tableDescription
              ? localize('com_context_edit')
              : localize('com_context_add_description')}
          </button>
        )}
      </div>

      {/* Table Description Section */}
      {editingTable ? (
        <div className="border-b border-blue-100 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/10">
          <label className="mb-2 block text-sm font-medium text-text-primary">
            {localize('com_context_table_description_label')}
          </label>
          <textarea
            value={tempTableDescription}
            onChange={(e) => onTempTableChange(e.target.value)}
            placeholder={localize('com_context_table_description_placeholder')}
            rows={3}
            className="w-full resize-none rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onSaveTable}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Save className="h-4 w-4" />
              {localize('com_ui_save')}
            </button>
            <button
              onClick={onCancelTable}
              className="px-4 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {localize('com_ui_cancel')}
            </button>
          </div>
        </div>
      ) : tableDescription ? (
        <div className="bg-surface-secondary/30 border-b border-border-light p-4">
          <div className="flex items-start gap-2">
            <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-tertiary" />
            <p className="text-sm text-text-secondary">{tableDescription}</p>
          </div>
        </div>
      ) : null}

      {/* Columns Section */}
      {isExpanded && (
        <div className="p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
            <span>{localize('com_context_columns')}</span>
            <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-tertiary">
              {table.columns.length}
            </span>
          </h4>

          <div className="space-y-3">
            {table.columns.map((column) => (
              <ColumnContextItem
                key={column.name}
                column={column}
                description={getColumnDescription(column.name)}
                isEditing={editingColumn === `${table.name}::${column.name}`}
                tempDescription={tempColumnDescription}
                onEdit={() => onEditColumn(column.name)}
                onSave={() => onSaveColumn(column.name)}
                onCancel={onCancelColumn}
                onTempChange={onTempColumnChange}
                localize={localize}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ColumnContextItemProps {
  column: TColumnSchema;
  description: string;
  isEditing: boolean;
  tempDescription: string;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onTempChange: (value: string) => void;
  localize: (key: string) => string;
}

function ColumnContextItem({
  column,
  description,
  isEditing,
  tempDescription,
  onEdit,
  onSave,
  onCancel,
  onTempChange,
  localize,
}: ColumnContextItemProps) {
  return (
    <div className="bg-surface-secondary/30 hover:bg-surface-secondary/50 flex items-start gap-3 rounded-lg border border-border-light p-3 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{column.name}</span>
          <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-xs text-text-tertiary">
            {column.type}
          </span>
          {column.nullable && <span className="text-text-quaternary text-[10px]">NULLABLE</span>}
        </div>

        {isEditing ? (
          <div className="mt-2">
            <textarea
              value={tempDescription}
              onChange={(e) => onTempChange(e.target.value)}
              placeholder={localize('com_context_column_description_placeholder')}
              rows={2}
              className="w-full resize-none rounded-md border border-border-light bg-surface-primary px-2 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={onSave}
                className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Save className="h-3 w-3" />
                {localize('com_ui_save')}
              </button>
              <button
                onClick={onCancel}
                className="px-3 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
              >
                {localize('com_ui_cancel')}
              </button>
            </div>
          </div>
        ) : description ? (
          <div className="flex items-start gap-2">
            <MessageSquare className="mt-0.5 h-3 w-3 flex-shrink-0 text-text-tertiary" />
            <p className="text-xs text-text-secondary">{description}</p>
          </div>
        ) : (
          <button
            onClick={onEdit}
            className="text-xs text-blue-600 transition-colors hover:text-blue-700"
          >
            {localize('com_context_add_column_description')}
          </button>
        )}
      </div>

      {!isEditing && (
        <button
          onClick={onEdit}
          className="flex-shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          title={
            description ? localize('com_context_edit') : localize('com_context_add_description')
          }
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default ContextView;
