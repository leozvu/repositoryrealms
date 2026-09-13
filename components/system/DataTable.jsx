'use client';

import { useEffect, useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import { Icon } from '@/components/ui';
import StatePanel from './StatePanel';

function downloadCsv(rows, columns, fileName) {
  const visibleColumns = columns.filter((column) => column.meta?.export !== false && (column.accessorKey || column.meta?.exportValue));
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [visibleColumns.map((column) => escape(column.header)).join(',')];
  for (const row of rows) {
    lines.push(visibleColumns.map((column) => {
      const value = column.meta?.exportValue ? column.meta.exportValue(row) : row[column.accessorKey];
      return escape(value);
    }).join(','));
  }
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export default function DataTable({
  data, columns, searchPlaceholder = 'Tìm trong danh sách', emptyTitle = 'Chưa có dữ liệu',
  emptyDescription, fileName = 'du-lieu.csv', storageKey, actions, renderMobile,
  initialPageSize = 25,
}) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState({});

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`table:${storageKey}`) || '{}');
      if (saved.columnVisibility) setColumnVisibility(saved.columnVisibility);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(`table:${storageKey}`, JSON.stringify({ columnVisibility })); } catch {}
  }, [columnVisibility, storageKey]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    initialState: { pagination: { pageSize: initialPageSize } },
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const mobileRows = useMemo(() => filteredRows.map((row) => row.original), [filteredRows]);

  return (
    <div className="data-table-shell">
      <div className="data-table-toolbar">
        <label className="data-table-search">
          <span className="sr-only">{searchPlaceholder}</span>
          <Icon name="search" size={16} />
          <input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} placeholder={searchPlaceholder} />
        </label>
        <span className="data-table-count">{filteredRows.length} bản ghi</span>
        <div className="data-table-spacer" />
        {actions}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="btn btn-outline btn-sm"><Icon name="columns" size={15} />Cột</button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="workspace-menu" sideOffset={7} align="end">
              <DropdownMenu.Label className="workspace-menu-label">Cột hiển thị</DropdownMenu.Label>
              {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => (
                <DropdownMenu.CheckboxItem
                  key={column.id}
                  className="workspace-menu-item"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                  onSelect={(event) => event.preventDefault()}
                >
                  <span className="menu-check"><Icon name={column.getIsVisible() ? 'check' : 'columns'} size={14} /></span>
                  {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
                </DropdownMenu.CheckboxItem>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <button className="btn btn-outline btn-sm" onClick={() => downloadCsv(mobileRows, columns, fileName)} disabled={!mobileRows.length}>
          <Icon name="download" size={15} />Xuất
        </button>
      </div>

      {!filteredRows.length ? (
        <StatePanel
          state={globalFilter ? 'filtered' : 'empty'}
          title={globalFilter ? 'Không có kết quả phù hợp' : emptyTitle}
          description={globalFilter ? 'Thử từ khóa khác hoặc xóa bộ lọc tìm kiếm.' : emptyDescription}
          action={globalFilter ? <button className="btn btn-outline btn-sm" onClick={() => setGlobalFilter('')}>Xóa tìm kiếm</button> : null}
        />
      ) : (
        <>
          <div className="data-table-desktop table-wrap">
            <table>
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} style={{ width: header.getSize() }}>
                        {header.isPlaceholder ? null : (
                          <button
                            className="data-table-sort"
                            disabled={!header.column.getCanSort()}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && <Icon name="sort" size={13} />}
                          </button>
                        )}
                        {header.column.getCanResize() && (
                          <span
                            className="data-table-resizer"
                            data-resizing={header.column.getIsResizing() || undefined}
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderMobile && <div className="data-table-mobile">{table.getRowModel().rows.map((row) => renderMobile(row.original))}</div>}
          <div className="data-table-pagination">
            <span>Trang {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
            <button className="btn btn-outline btn-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Trước</button>
            <button className="btn btn-outline btn-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Sau</button>
          </div>
        </>
      )}
    </div>
  );
}

