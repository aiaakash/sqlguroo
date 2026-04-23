import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { format } from 'sql-formatter';
import { useAnalyticsSchema } from '~/components/Nav/SettingsTabs/Analytics/hooks';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

export interface SqlEditorRef {
  format: () => void;
}

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
  connectionId: string | null;
  readOnly?: boolean;
  className?: string;
}

// Define custom themes
const defineHexThemes = (monaco: Monaco) => {
  // Define custom dark theme
  monaco.editor.defineTheme('hex-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C084FC', fontStyle: 'bold' },
      { token: 'identifier', foreground: 'E5E7EB' },
      { token: 'string', foreground: '86EFAC' },
      { token: 'number', foreground: 'FDBA74' },
      { token: 'operator', foreground: '9CA3AF' },
    ],
    colors: {
      'editor.background': '#0F1115',
      'editor.foreground': '#E5E7EB',
      'editor.lineHighlightBackground': '#1A1D24',
      'editorLineNumber.foreground': '#4B5563',
      'editorLineNumber.activeForeground': '#9CA3AF',
      'editor.selectionBackground': '#3B82F640',
      'editor.inactiveSelectionBackground': '#3B82F620',
      'editorCursor.foreground': '#60A5FA',
      'editor.findMatchBackground': '#F59E0B40',
      'editor.findMatchHighlightBackground': '#F59E0B20',
    },
  });

  // Define custom light theme
  monaco.editor.defineTheme('hex-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '9CA3AF', fontStyle: 'italic' },
      { token: 'keyword', foreground: '9333EA', fontStyle: 'bold' },
      { token: 'identifier', foreground: '#111827' },
      { token: 'string', foreground: '059669' },
      { token: 'number', foreground: 'D97706' },
      { token: 'operator', foreground: '#6B7280' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#111827',
      'editor.lineHighlightBackground': '#F9FAFB',
      'editorLineNumber.foreground': '#9CA3AF',
      'editorLineNumber.activeForeground': '#6B7280',
      'editor.selectionBackground': '#3B82F630',
      'editor.inactiveSelectionBackground': '#3B82F615',
      'editorCursor.foreground': '#2563EB',
      'editor.findMatchBackground': '#F59E0B30',
      'editor.findMatchHighlightBackground': '#F59E0B15',
    },
  });
};

const SqlEditor = forwardRef(function SqlEditor(
  {
    value,
    onChange,
    onExecute,
    connectionId,
    readOnly = false,
    className,
  }: SqlEditorProps,
  ref: React.ForwardedRef<SqlEditorRef>,
) {
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onExecuteRef = useRef(onExecute);
  const { data: schemaData } = useAnalyticsSchema(connectionId || '', {
    enabled: !!connectionId,
  });
  const schema = schemaData?.schema;
  const [isDark, setIsDark] = useState(false);
  const localize = useLocalize();

  // Keep the ref updated with the latest onExecute callback
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  // Detect theme
  useEffect(() => {
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setIsDark(isDarkMode);
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Update editor theme when isDark changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const theme = isDark ? 'hex-dark' : 'hex-light';
      monacoRef.current.editor.setTheme(theme);
    }
  }, [isDark]);

  // Setup autocompletion based on schema
  useEffect(() => {
    if (!monacoRef.current || !schema?.tables?.length) {
      return;
    }

    const monaco = monacoRef.current;
    
    const disposable = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: monaco.languages.CompletionItem[] = [];

        schema.tables.forEach((table) => {
          suggestions.push({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: table.name,
            range,
            detail: 'Table',
          });

          table.columns?.forEach((column) => {
            suggestions.push({
              label: `${table.name}.${column.name}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `${table.name}.${column.name}`,
              range,
              detail: `${column.type || 'Column'} - ${table.name}`,
            });
          });
        });

        return { suggestions };
      },
    });

    return () => {
      disposable.dispose();
    };
  }, [schema]);

  const handleFormat = useCallback(() => {
    if (!value.trim() || !editorRef.current) return;
    try {
      const formatted = format(value, {
        language: 'sql',
        tabWidth: 2,
        keywordCase: 'upper',
        indentStyle: 'standard',
        linesBetweenQueries: 2,
      });
      onChange(formatted);
    } catch {
      // silently ignore formatting errors
    }
  }, [value, onChange]);

  const handleEditorDidMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;

    // Define themes immediately on mount
    defineHexThemes(monaco);

    // Set initial theme
    const isDarkMode = document.documentElement.classList.contains('dark');
    monaco.editor.setTheme(isDarkMode ? 'hex-dark' : 'hex-light');

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onExecuteRef.current) {
        onExecuteRef.current();
      }
    });

    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      handleFormat();
    });
  }, [handleFormat]);

  useImperativeHandle(ref, () => ({
    format: handleFormat,
  }), [handleFormat]);

  const editorTheme = isDark ? 'hex-dark' : 'hex-light';

  return (
    <div className={cn('flex h-full flex-col bg-surface-primary', className)}>
      <Editor
        height="100%"
        defaultLanguage="sql"
        value={value}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorDidMount}
        theme={editorTheme}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 12,
          fontFamily: 'JetBrains Mono, Fira Code, Monaco, Consolas, monospace',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          formatOnPaste: true,
          formatOnType: true,
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          acceptSuggestionOnCommitCharacter: true,
          acceptSuggestionOnEnter: 'on',
          snippetSuggestions: 'top',
          padding: { top: 8, bottom: 8 },
          lineHeight: 20,
          renderLineHighlight: 'line',
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            useShadows: false,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          renderWhitespace: 'boundary',
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
        }}
      />
      <div className="flex items-center justify-between border-t border-border-light bg-surface-secondary px-3 py-1 text-[11px] text-text-secondary">
        <span>{localize('com_ui_sql_editor_hint')}</span>
        <span className="font-mono">Ctrl+Enter {localize('com_ui_to_execute')}</span>
      </div>
    </div>
  );
});

export default SqlEditor;
