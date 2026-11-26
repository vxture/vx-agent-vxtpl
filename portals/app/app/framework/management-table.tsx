/**
 * Design System table with the combined index and selection column.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import type { ReactNode } from "react";
import { Checkbox, DataTable } from "../ds";
import type { DataTableColumn } from "@vxture/design-system";
import "./management-table.css";

interface TableSelection {
  readonly keys: ReadonlySet<string>;
  readonly onChange: (keys: ReadonlySet<string>) => void;
  readonly selectAll?: boolean;
}

interface ManagementTableProps<Row> {
  readonly rows: ReadonlyArray<Row>;
  readonly columns: ReadonlyArray<DataTableColumn<Row>>;
  readonly rowKey: (row: Row) => string;
  readonly rowLabel: (row: Row) => string;
  readonly rowActions: (row: Row) => ReactNode;
  readonly selection?: TableSelection;
  readonly indexStart?: number;
}

export function ManagementTable<Row>({
  rows, columns, rowKey, rowLabel, rowActions, selection, indexStart = 1,
}: ManagementTableProps<Row>) {
  const visibleKeys = rows.map(rowKey);
  const selectedCount = selection ? visibleKeys.filter((key) => selection.keys.has(key)).length : 0;
  const allSelected = selectedCount > 0 && selectedCount === visibleKeys.length;

  function select(keys: ReadonlyArray<string>, checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.keys);
    for (const key of keys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    selection.onChange(next);
  }

  const indexColumn: DataTableColumn<Row> = {
    id: "index",
    align: "center",
    header: (
      <span className="management-index-header">
        {selection?.selectAll && (
          <Checkbox
            aria-label="Select all visible rows"
            checked={allSelected || (selectedCount > 0 ? "indeterminate" : false)}
            disabled={rows.length === 0}
            onCheckedChange={() => select(visibleKeys, !allSelected)}
          />
        )}
        <span>No.</span>
      </span>
    ),
    cell: (row, index) => {
      const checked = selection?.keys.has(rowKey(row)) ?? false;
      return (
        <span className="management-index-cell" data-checked={checked || undefined}>
          <span className="management-index-number">{indexStart + index}</span>
          {selection && (
            <Checkbox
              className="management-index-checkbox"
              checked={checked}
              aria-label={`Select ${rowLabel(row)}`}
              onCheckedChange={(value) => select([rowKey(row)], value === true)}
            />
          )}
        </span>
      );
    },
  };

  return (
    <DataTable
      className="management-table"
      rows={rows}
      columns={[indexColumn, ...columns]}
      rowKey={rowKey}
      rowActions={rowActions}
    />
  );
}
