import React from 'react';
import { Key, Link2, Type, MessageSquare, Circle } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import type { TColumnSchema } from 'librechat-data-provider';

interface ColumnItemProps {
  column: TColumnSchema;
  isHighlighted?: boolean;
}

export default function ColumnItem({ column, isHighlighted = false }: ColumnItemProps) {
  const { name, type, nullable, primaryKey, foreignKey, comment } = column;

  // Get the SQL type display
  const typeDisplay = formatSqlType(type);

  return (
    <div
      className={`flex items-center gap-2 rounded px-1 py-0.5 transition-colors ${
        isHighlighted ? 'bg-yellow-100/50 dark:bg-yellow-900/20' : 'hover:bg-surface-hover'
      }`}
    >
      {/* Key indicator */}
      <div className="flex w-4 flex-shrink-0 items-center justify-center">
        {primaryKey ? (
          <TooltipAnchor
            description="Primary Key"
            side="left"
            render={<Key className="h-2.5 w-2.5 text-amber-500" />}
          />
        ) : foreignKey ? (
          <TooltipAnchor
            description={`Foreign Key → ${foreignKey.table}.${foreignKey.column}`}
            side="left"
            render={<Link2 className="h-2.5 w-2.5 text-blue-500" />}
          />
        ) : (
          <Circle className="h-1.5 w-1.5 text-text-quaternary" />
        )}
      </div>

      {/* Column name */}
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>

      {/* Type */}
      <TooltipAnchor
        description={type}
        side="top"
        render={
          <span className="flex items-center gap-0.5 rounded bg-surface-tertiary px-1 py-0.5 text-[10px] text-text-tertiary">
            <Type className="h-2 w-2" />
            {typeDisplay}
          </span>
        }
      />

      {/* Nullable indicator */}
      {nullable && (
        <span className="text-[10px] text-text-quaternary" title="Nullable">
          ?
        </span>
      )}

      {/* Comment indicator */}
      {comment && (
        <TooltipAnchor
          description={comment}
          side="left"
          render={<MessageSquare className="h-2.5 w-2.5 text-text-quaternary" />}
        />
      )}
    </div>
  );
}

function formatSqlType(type: string): string {
  // Simplify common SQL types for display
  const typeMap: Record<string, string> = {
    'character varying': 'varchar',
    'character': 'char',
    'timestamp without time zone': 'timestamp',
    'timestamp with time zone': 'timestamptz',
    'double precision': 'double',
    'numeric': 'decimal',
    'integer': 'int',
    'bigint': 'bigint',
    'smallint': 'smallint',
    'boolean': 'bool',
    'text': 'text',
    'jsonb': 'jsonb',
    'json': 'json',
    'uuid': 'uuid',
    'date': 'date',
    'time': 'time',
    'bytea': 'bytes',
    'array': 'array',
    'real': 'real',
  };

  const lowerType = type.toLowerCase();
  
  // Check for exact match
  if (typeMap[lowerType]) return typeMap[lowerType];
  
  // Check for partial match (e.g., "character varying(255)" -> "varchar")
  for (const [key, value] of Object.entries(typeMap)) {
    if (lowerType.startsWith(key)) {
      // Extract length if present
      const match = lowerType.match(/\((\d+)\)/);
      if (match) return `${value}(${match[1]})`;
      return value;
    }
  }

  // Handle varchar with length
  const varcharMatch = lowerType.match(/^varchar\((\d+)\)/i);
  if (varcharMatch) return `varchar(${varcharMatch[1]})`;

  // Handle array types
  if (lowerType.endsWith('[]')) {
    return lowerType.replace('[]', '[]');
  }

  // Truncate long type names
  if (type.length > 12) {
    return type.slice(0, 10) + '…';
  }

  return type;
}

