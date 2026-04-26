import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
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
  Loader2,
} from 'lucide-react';
import { Spinner, Button, Input, Textarea, Label, Separator } from '@librechat/client';
import { useLocalize, useCustomLink, type TranslationKeys } from '~/hooks';
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

  const [localTableDescriptions, setLocalTableDescriptions] = useState<Record<string, string>>({});
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [tempTableDescription, setTempTableDescription] = useState('');

  const [localColumnDescriptions, setLocalColumnDescriptions] = useState<Record<string, string>>(
    {},
  );
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [tempColumnDescription, setTempColumnDescription] = useState('');

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  const { data: connections, isLoading: isLoadingConnections } = useAnalyticsConnections();

  const {
    data: schemaData,
    isLoading: isLoadingSchema,
    error: schemaError,
  } = useAnalyticsSchema(selectedConnection ?? '', {
    enabled: !!selectedConnection && selectedConnection.length > 0,
  });

  const { data: savedDescriptions, isLoading: isLoadingDescriptions } = useTableDescriptions(
    selectedConnection ?? '',
    {
      enabled: !!selectedConnection && selectedConnection.length > 0,
    },
  );

  const saveDescriptionsMutation = useSaveTableDescriptions();

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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary-alt">
      <Header
        selectedConnection={selectedConnection}
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={saveDescriptionsMutation.isLoading}
        onSave={handleSaveAll}
        chatLinkHandler={chatLinkHandler}
        localize={localize}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-72 flex-col border-r border-border-light/60 bg-surface-primary-alt">
          <div className="border-b border-border-light/60 p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Database className="h-4 w-4 text-primary" />
              Connections
            </h2>
            <p className="text-xs text-text-tertiary">Select a database connection</p>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoadingConnections ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : !connections || connections.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-secondary/50">
                  <Database className="h-6 w-6 text-text-tertiary" />
                </div>
                <p className="text-sm text-text-secondary">No connections found</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {connections.map((connection) => (
                  <Button
                    key={connection._id}
                    variant="ghost"
                    onClick={() => setSelectedConnection(connection._id)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 text-left transition-all h-auto justify-start',
                      selectedConnection === connection._id
                        ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10'
                        : 'border-border-light/60 bg-surface-secondary/50 hover:border-border-medium hover:bg-surface-hover',
                    )}
                  >
                    <div className="mt-1 flex h-2.5 w-2.5 flex-shrink-0">
                      <span
                        className={cn(
                          'absolute h-2.5 w-2.5 rounded-full',
                          connection.lastTestSuccess
                            ? 'bg-emerald-500'
                            : connection.lastTestSuccess === false
                              ? 'bg-destructive'
                              : 'bg-text-tertiary',
                        )}
                      />
                      <span
                        className={cn(
                          'h-2.5 w-2.5 animate-ping rounded-full opacity-75',
                          connection.lastTestSuccess
                            ? 'bg-emerald-500'
                            : connection.lastTestSuccess === false
                              ? 'bg-destructive'
                              : 'bg-text-tertiary',
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
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!selectedConnection ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
                <Database className="h-10 w-10 text-primary/70" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-text-primary">
                Select a connection
              </h3>
              <p className="max-w-md text-center text-sm leading-relaxed text-text-secondary">
                Choose a database connection from the sidebar to view and manage table schemas and
                descriptions.
              </p>
            </div>
          ) : isLoadingSchema || isLoadingDescriptions ? (
            <div className="flex h-full flex-col items-center justify-center">
              <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-text-secondary">Loading schema...</p>
            </div>
          ) : schemaError ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="mb-4 rounded-xl bg-destructive/10 p-4">
                <Database className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-text-primary">
                Failed to load schema
              </h3>
              <p className="max-w-md text-center text-sm text-text-secondary">
                {schemaError instanceof Error
                  ? schemaError.message
                  : 'An unexpected error occurred'}
              </p>
            </div>
          ) : tables.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
                <Table2 className="h-10 w-10 text-primary/70" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-text-primary">No tables found</h3>
              <p className="max-w-md text-center text-sm leading-relaxed text-text-secondary">
                This connection does not have any tables in its schema.
              </p>
            </div>
          ) : (
            <div className="p-4 lg:p-6">
              <div className="mb-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      {connections?.find((c) => c._id === selectedConnection)?.name}
                    </h2>
                    <p className="text-sm text-text-tertiary">
                      {tables.length} {tables.length === 1 ? 'table' : 'tables'}
                    </p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                    <Input
                      type="text"
                      placeholder="Search tables..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 w-64 rounded-xl border border-border-light/60 bg-surface-secondary/50 pl-9 pr-8 text-sm text-text-primary transition-all placeholder:text-text-tertiary focus:border-primary/30 focus:bg-surface-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                    />
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 h-auto w-auto p-0.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <p className="text-sm leading-relaxed text-text-secondary">
                    Add descriptions to tables and columns to provide context for AI-generated
                    queries. These descriptions help the AI understand your database structure.
                  </p>
                </div>
              </div>

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
                    onSaveColumn={(columnName) =>
                      saveColumnDescription(table.name, columnName)
                    }
                    onCancelColumn={cancelEditingColumn}
                    onTempColumnChange={setTempColumnDescription}
                    getColumnDescription={(colName) =>
                      getColumnDescription(table.name, colName)
                    }
                    localize={localize}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Outlet />
    </div>
  );
};

function Header({
  selectedConnection,
  hasUnsavedChanges,
  isSaving,
  onSave,
  chatLinkHandler,
  localize,
}: {
  selectedConnection: string | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  chatLinkHandler: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  localize: (phraseKey: TranslationKeys) => string;
}) {
  return (
    <div className="sticky top-0 z-20 w-full border-b border-border-light/60 bg-surface-primary/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <a
            href="/"
            onClick={chatLinkHandler}
            className="group flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden text-sm font-medium sm:inline">
              {localize('com_ui_back_to_chat')}
            </span>
          </a>
          <Separator orientation="vertical" className="h-5 bg-border-light/60" />
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-text-primary">
              {localize('com_context_title')}
            </h1>
          </div>
        </div>

        {selectedConnection && hasUnsavedChanges && (
          <Button
            onClick={onSave}
            disabled={isSaving}
            variant="submit"
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-sm"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {localize('com_ui_save')}
          </Button>
        )}
      </div>
    </div>
  );
}

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
  localize: (phraseKey: TranslationKeys) => string;
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
    <div className="overflow-hidden rounded-2xl border border-border-light/60 bg-surface-primary shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="flex items-center justify-between border-b border-border-light/60 p-4">
        <Button variant="ghost" onClick={onToggle} className="flex flex-1 items-center gap-3 text-left h-auto justify-start">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 flex-shrink-0 text-text-tertiary" />
          ) : (
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-text-tertiary" />
          )}
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
            <Table2 className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-text-primary">{table.name}</span>
          <span className="inline-flex items-center rounded-lg bg-surface-secondary px-2 py-1 text-[11px] font-medium text-text-secondary ring-1 ring-border-light/50">
            {table.columns.length} columns
           </span>
         </Button>

         {!editingTable && (
          <Button
            variant="ghost"
            onClick={onEditTable}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <Edit2 className="h-3.5 w-3.5" />
            {tableDescription
              ? localize('com_context_edit')
              : localize('com_context_add_description')}
          </Button>
        )}
      </div>

      {editingTable ? (
        <div className="border-b border-border-light/60 bg-surface-secondary/30 p-4">
          <Label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {localize('com_context_table_description_label')}
          </Label>
          <Textarea
            value={tempTableDescription}
            onChange={(e) => onTempTableChange(e.target.value)}
            placeholder={localize('com_context_table_description_placeholder')}
            rows={3}
            className="w-full resize-none rounded-xl border border-border-light/60 bg-surface-primary px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
          <div className="mt-3 flex items-center gap-2">
            <Button
              onClick={onSaveTable}
              variant="submit"
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              {localize('com_ui_save')}
            </Button>
            <Button
              onClick={onCancelTable}
              variant="outline"
              className="rounded-xl px-4 py-2 text-sm font-medium"
            >
              {localize('com_ui_cancel')}
            </Button>
          </div>
        </div>
      ) : tableDescription ? (
        <div className="border-b border-border-light/60 bg-surface-secondary/30 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">{tableDescription}</p>
          </div>
        </div>
      ) : null}

      {isExpanded && (
        <div className="p-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Columns
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-secondary px-1.5 text-[10px] font-semibold text-text-tertiary ring-1 ring-border-light/50">
              {table.columns.length}
            </span>
          </h4>

          <div className="space-y-2">
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
  localize: (phraseKey: TranslationKeys) => string;
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
    <div className="group flex items-start gap-3 rounded-xl border border-border-light/60 bg-surface-secondary/30 p-3 transition-all hover:border-border-medium hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{column.name}</span>
          <span className="inline-flex items-center rounded-lg bg-surface-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary ring-1 ring-border-light/50">
            {column.type}
          </span>
          {column.nullable && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
              Nullable
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="mt-2">
          <Textarea
            value={tempDescription}
            onChange={(e) => onTempChange(e.target.value)}
            placeholder={localize('com_context_column_description_placeholder')}
            rows={2}
            className="w-full resize-none rounded-xl border border-border-light/60 bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              onClick={onSave}
              variant="submit"
              size="sm"
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium shadow-sm"
            >
              <Save className="h-3 w-3" />
              {localize('com_ui_save')}
            </Button>
            <Button
              onClick={onCancel}
              variant="outline"
              size="sm"
              className="rounded-xl px-3 py-1.5 text-xs font-medium"
            >
              {localize('com_ui_cancel')}
            </Button>
          </div>
          </div>
        ) : description ? (
          <div className="flex items-start gap-2">
            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
              <MessageSquare className="h-3 w-3 text-primary" />
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">{description}</p>
          </div>
        ) : (
          <Button
            variant="link"
            size="sm"
            onClick={onEdit}
            className="text-xs font-medium text-primary transition-colors hover:text-primary/80 h-auto p-0"
          >
            {localize('com_context_add_column_description')}
          </Button>
        )}
      </div>

      {!isEditing && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          className="flex-shrink-0 rounded-lg p-1.5 text-text-tertiary opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
          title={
            description ? localize('com_context_edit') : localize('com_context_add_description')
          }
        >
           <Edit2 className="h-3.5 w-3.5" />
         </Button>
       )}
     </div>
   );
 }

export default ContextView;
