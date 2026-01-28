import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GridColumn, GridRow, GridCell, CellType } from '../types';
import { Cell } from './Cell';
import { ResizeHandle } from './ResizeHandle';
import { Plus, Download, FileJson, FileSpreadsheet, FileCode, ChevronDown, X, FileText, Upload, Check, Pencil, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { saveImage, getAllImages, deleteImage, clearAllImages } from '../services/imageStorage';

const DEFAULT_COL_WIDTH = 200;
const DEFAULT_ROW_HEIGHT = 150;
const INITIAL_COLS = 4;
const INITIAL_ROWS = 4;

const generateId = () => Math.random().toString(36).substr(2, 9);

const LOCAL_STORAGE_KEY = 'promptgrid_data';

export const Grid: React.FC = () => {
  const [columns, setColumns] = useState<GridColumn[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [sheetName, setSheetName] = useState("PromptGrid");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnLabel, setEditingColumnLabel] = useState<string>('');
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showMultiTabWarning, setShowMultiTabWarning] = useState(false);

  // Multi-tab detection using BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel('promptgrid_tab_channel');
    const tabId = Math.random().toString(36).substr(2, 9);

    // Announce this tab
    channel.postMessage({ type: 'TAB_OPEN', tabId });

    // Listen for other tabs
    channel.onmessage = (event) => {
      if (event.data.type === 'TAB_OPEN' && event.data.tabId !== tabId) {
        setShowMultiTabWarning(true);
        // Also notify the other tab
        channel.postMessage({ type: 'TAB_EXISTS', tabId });
      }
      if (event.data.type === 'TAB_EXISTS' && event.data.tabId !== tabId) {
        setShowMultiTabWarning(true);
      }
    };

    return () => {
      channel.close();
    };
  }, []);



  // Initialize Grid - Load from localStorage and IndexedDB
  useEffect(() => {
    const loadData = async () => {
      const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      let loadedRows: GridRow[] | null = null;
      let loadedCols: GridColumn[] | null = null;
      let loadedSheetName = 'PromptGrid';

      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          if (parsed.columns && parsed.rows) {
            loadedCols = parsed.columns;
            loadedRows = parsed.rows;
            if (parsed.sheetName) {
              loadedSheetName = parsed.sheetName;
            }
          }
        } catch (e) {
          console.warn('Failed to load saved data from localStorage:', e);
        }
      }

      // Load images from IndexedDB and merge with rows
      if (loadedRows) {
        try {
          const imageMap = await getAllImages();

          // Merge images back into rows
          loadedRows = loadedRows.map(row => ({
            ...row,
            cells: Object.fromEntries(
              Object.entries(row.cells).map(([colId, cell]: [string, GridCell]) => {
                // Check if this cell has an image stored in IndexedDB
                const storedImage = imageMap.get(cell.id);
                if (storedImage) {
                  return [colId, { ...cell, type: CellType.IMAGE, content: storedImage }];
                }
                // If cell content is placeholder, clear it
                if (cell.content === '[IMAGE_TOO_LARGE]') {
                  return [colId, { ...cell, type: CellType.TEXT, content: '' }];
                }
                return [colId, cell];
              })
            )
          }));
        } catch (e) {
          console.warn('Failed to load images from IndexedDB:', e);
        }

        setColumns(loadedCols!);
        setRows(loadedRows);
        setSheetName(loadedSheetName);
        return;
      }

      // No saved data or failed to load - initialize fresh grid
      const initCols: GridColumn[] = Array.from({ length: INITIAL_COLS }).map((_, i) => ({
        id: generateId(),
        label: `Col ${i + 1}`,
        width: DEFAULT_COL_WIDTH
      }));

      const initRows: GridRow[] = Array.from({ length: INITIAL_ROWS }).map(() => ({
        id: generateId(),
        height: DEFAULT_ROW_HEIGHT,
        cells: {}
      }));

      // Pre-populate cells map structure
      initRows.forEach(row => {
        initCols.forEach(col => {
          row.cells[col.id] = {
            id: generateId(),
            type: CellType.TEXT,
            content: ''
          };
        });
      });

      setColumns(initCols);
      setRows(initRows);
    };

    loadData();
  }, []);

  // Save to localStorage and IndexedDB whenever data changes
  useEffect(() => {
    // Don't save if grid hasn't been initialized yet
    if (columns.length === 0 && rows.length === 0) return;

    // Save images to IndexedDB and prepare rows for localStorage
    const saveData = async () => {
      const rowsForStorage = await Promise.all(
        rows.map(async (row) => {
          const cellEntries = await Promise.all(
            Object.entries(row.cells).map(async ([colId, cell]: [string, GridCell]) => {
              // If it's an image, save to IndexedDB
              if (cell.type === CellType.IMAGE && cell.content && cell.content.startsWith('data:')) {
                try {
                  await saveImage(cell.id, cell.content);
                  // Store a placeholder in localStorage
                  return [colId, { ...cell, content: '[INDEXED_DB]' }];
                } catch (e) {
                  console.warn('Failed to save image to IndexedDB:', e);
                  return [colId, cell];
                }
              }
              return [colId, cell];
            })
          );
          return {
            ...row,
            cells: Object.fromEntries(cellEntries)
          };
        })
      );

      const dataToSave = {
        columns,
        rows: rowsForStorage,
        sheetName,
        savedAt: new Date().toISOString()
      };

      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.warn('localStorage quota exceeded. Data saved to IndexedDB.');
        } else {
          console.error('Failed to save to localStorage:', error);
        }
      }
    };

    saveData();
  }, [columns, rows, sheetName]);

  const handleColResize = (colId: string, delta: number) => {
    setColumns(prev => prev.map(col => {
      if (col.id === colId) {
        return { ...col, width: Math.max(50, col.width + delta) };
      }
      return col;
    }));
  };

  const handleRowResize = (rowId: string, delta: number) => {
    setRows(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, height: Math.max(50, row.height + delta) };
      }
      return row;
    }));
  };

  const handleCellChange = (rowId: string, colId: string, newCell: GridCell) => {
    setRows(prev => prev.map(row => {
      if (row.id === rowId) {
        const oldCell = row.cells[colId];

        // If old cell was an image and new cell is not (or is empty), clean up IndexedDB
        if (oldCell && oldCell.type === CellType.IMAGE && oldCell.id) {
          if (newCell.type !== CellType.IMAGE || !newCell.content) {
            deleteImage(oldCell.id).catch(e => console.warn('Failed to delete orphaned image:', e));
          }
        }

        return {
          ...row,
          cells: {
            ...row.cells,
            [colId]: newCell
          }
        };
      }
      return row;
    }));
  };

  const addColumn = () => {
    const newCol: GridColumn = {
      id: generateId(),
      label: `Col ${columns.length + 1}`,
      width: DEFAULT_COL_WIDTH
    };

    setColumns(prev => [...prev, newCol]);
    setRows(prev => prev.map(row => ({
      ...row,
      cells: {
        ...row.cells,
        [newCol.id]: { id: generateId(), type: CellType.TEXT, content: '' }
      }
    })));
  };

  const deleteColumn = (colId: string) => {
    const hasData = rows.some(row => {
      const cell = row.cells[colId];
      return cell && cell.content && cell.content.trim() !== '';
    });

    if (hasData) {
      if (!window.confirm("This column contains data. Are you sure you want to delete it?")) {
        return;
      }
    }

    // Clean up images from IndexedDB for this column
    rows.forEach(row => {
      const cell = row.cells[colId];
      if (cell && cell.type === CellType.IMAGE && cell.id) {
        deleteImage(cell.id).catch(e => console.warn('Failed to delete column image:', e));
      }
    });

    setColumns(prev => prev.filter(c => c.id !== colId));
  };

  const handleColumnLabelChange = (colId: string, newLabel: string) => {
    setColumns(prev => prev.map(col => {
      if (col.id === colId) {
        return { ...col, label: newLabel };
      }
      return col;
    }));
  };

  const startEditingColumn = (colId: string, currentLabel: string) => {
    setEditingColumnId(colId);
    setEditingColumnLabel(currentLabel);
  };

  const finishEditingColumn = () => {
    if (editingColumnId && editingColumnLabel.trim()) {
      handleColumnLabelChange(editingColumnId, editingColumnLabel.trim());
    }
    setEditingColumnId(null);
    setEditingColumnLabel('');
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    // Handle JSON files (PromptGrid backup format)
    if (fileExtension === 'json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonContent = JSON.parse(e.target?.result as string);

          if (jsonContent.columns && jsonContent.rows) {
            // Clear all images from IndexedDB before importing new data
            clearAllImages().catch(err => console.warn('Failed to clear IndexedDB images:', err));

            setColumns(jsonContent.columns);
            setRows(jsonContent.rows);
            if (jsonContent.sheetName) {
              setSheetName(jsonContent.sheetName);
            }
          } else {
            alert('Invalid JSON format. Please use a PromptGrid JSON export file.');
          }
        } catch (error) {
          console.error('JSON import error:', error);
          alert('Failed to import JSON file. Please ensure it is a valid PromptGrid JSON export.');
        }
      };
      reader.onerror = () => alert('Failed to read JSON file.');
      reader.readAsText(file);
      event.target.value = '';
      return;
    }

    // Handle Excel/CSV files
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

        if (jsonData.length === 0) {
          alert('The file appears to be empty.');
          return;
        }

        // First row is headers
        const headers = jsonData[0] as string[];
        const dataRows = jsonData.slice(1);

        // Create new columns
        const newColumns: GridColumn[] = headers.map((header, i) => ({
          id: generateId(),
          label: header?.toString() || `Col ${i + 1}`,
          width: DEFAULT_COL_WIDTH
        }));

        // Create new rows with cells
        const newRows: GridRow[] = dataRows.map((rowData) => {
          const row: GridRow = {
            id: generateId(),
            height: DEFAULT_ROW_HEIGHT,
            cells: {}
          };

          newColumns.forEach((col, colIndex) => {
            const cellValue = (rowData as unknown[])[colIndex];
            row.cells[col.id] = {
              id: generateId(),
              type: CellType.TEXT,
              content: cellValue?.toString() || ''
            };
          });

          return row;
        });

        // Clear all images from IndexedDB before importing new data
        clearAllImages().catch(err => console.warn('Failed to clear IndexedDB images:', err));

        // Update grid state
        setColumns(newColumns);
        setRows(newRows);

        // Optionally set sheet name from file
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        setSheetName(fileName);

      } catch (error) {
        console.error('Import error:', error);
        alert('Failed to import file. Please ensure it is a valid Excel or CSV file.');
      }
    };

    reader.onerror = () => {
      alert('Failed to read file.');
    };

    reader.readAsBinaryString(file);

    // Reset input so the same file can be imported again if needed
    event.target.value = '';
  };

  const addRow = () => {
    const newRow: GridRow = {
      id: generateId(),
      height: DEFAULT_ROW_HEIGHT,
      cells: {}
    };
    columns.forEach(col => {
      newRow.cells[col.id] = { id: generateId(), type: CellType.TEXT, content: '' };
    });
    setRows(prev => [...prev, newRow]);
  };

  const exportJson = () => {
    const data = JSON.stringify({ sheetName, columns, rows }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheetName.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportHtml = () => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sheetName} Export</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 20px; }
    h1 { color: #818cf8; margin-bottom: 20px; }
    .table-container { overflow-x: auto; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border-radius: 0.5rem; }
    table { width: max-content; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #334155; padding: 12px; text-align: left; vertical-align: top; background: #1e293b; position: relative; }
    th { background: #0f172a; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; color: #94a3b8; letter-spacing: 0.05em; user-select: none; }
    img { display: block; max-width: 100%; height: auto; border-radius: 4px; }
    .cell-text { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 0.875rem; }
    
    /* Resize Handle */
    .resizer {
      position: absolute;
      right: 0;
      top: 0;
      height: 100%;
      width: 5px;
      background: rgba(255, 255, 255, 0.1);
      cursor: col-resize;
      user-select: none;
      touch-action: none;
    }
    .resizer:hover, .resizing {
      background: #3b82f6;
    }
  </style>
</head>
<body>
  <h1>${sheetName}</h1>
  <div class="table-container">
    <table id="exportTable">
      <thead>
        <tr>
          ${columns.map(c => `<th style="width: ${c.width}px">${c.label}<div class="resizer"></div></th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr style="height: ${r.height}px">
            ${columns.map(c => {
      const cell = r.cells[c.id];
      let content = '';
      if (cell) {
        if (cell.type === 'IMAGE' && cell.content) {
          content = `<img src="${cell.content}" alt="Generated Image" />`;
        } else {
          content = `<div class="cell-text">${cell.content || ''}</div>`;
        }
      }
      return `<td>${content}</td>`;
    }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const table = document.getElementById('exportTable');
      const cols = table.querySelectorAll('th');
      [].forEach.call(cols, function(col) {
        const resizer = col.querySelector('.resizer');
        createResizableColumn(col, resizer);
      });
    });

    function createResizableColumn(col, resizer) {
      let x = 0;
      let w = 0;

      const mouseDownHandler = function(e) {
        x = e.clientX;
        const styles = window.getComputedStyle(col);
        w = parseInt(styles.width, 10);
        resizer.classList.add('resizing');
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
      };

      const mouseMoveHandler = function(e) {
        const dx = e.clientX - x;
        col.style.width = \`\${w + dx}px\`;
      };

      const mouseUpHandler = function() {
        resizer.classList.remove('resizing');
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
      };

      resizer.addEventListener('mousedown', mouseDownHandler);
    }
  </script>
</body>
</html>
    `;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheetName.toLowerCase().replace(/\s+/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportExcel = () => {
    // Prepare data for SheetJS
    const header = columns.map(c => c.label);
    const data = rows.map(r => {
      return columns.map(c => {
        const cell = r.cells[c.id];
        if (!cell) return '';
        if (cell.type === 'IMAGE') return '[Image]'; // Basic Excel export doesn't support embedded images easily
        return cell.content;
      });
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grid Data");
    XLSX.writeFile(wb, `${sheetName.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
    setShowExportMenu(false);
  };

  const exportPdf = async () => {
    // We create a temporary hidden div to render the full table for the PDF
    // This allows capturing the full scrollable area
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.top = '-9999px';
    tempContainer.style.left = '-9999px';
    tempContainer.style.width = 'max-content'; // Allow full width
    tempContainer.style.background = '#0f172a'; // Match theme
    tempContainer.style.padding = '20px';
    tempContainer.style.color = 'white';

    // Construct HTML structure manually for the capture
    let tableHtml = `
      <h1 style="color: #818cf8; font-family: sans-serif; margin-bottom: 20px;">${sheetName}</h1>
      <table style="border-collapse: collapse; font-family: sans-serif; color: #e2e8f0;">
        <thead>
          <tr>
            ${columns.map(c => `<th style="width: ${c.width}px; border: 1px solid #334155; padding: 12px; background: #0f172a; color: #94a3b8; text-transform: uppercase; font-size: 12px;">${c.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(r => {
      tableHtml += `<tr style="height: ${r.height}px;">`;
      columns.forEach(c => {
        const cell = r.cells[c.id];
        let content = '';
        if (cell) {
          if (cell.type === 'IMAGE' && cell.content) {
            content = `<img src="${cell.content}" style="max-width: ${c.width - 24}px; max-height: ${r.height - 24}px; object-fit: contain;" />`;
          } else {
            content = `<div style="white-space: pre-wrap; font-size: 14px;">${cell.content || ''}</div>`;
          }
        }
        tableHtml += `<td style="border: 1px solid #334155; padding: 12px; vertical-align: top; background: #1e293b; width: ${c.width}px;">${content}</td>`;
      });
      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';
    tempContainer.innerHTML = tableHtml;
    document.body.appendChild(tempContainer);

    try {
      const canvas = await html2canvas(tempContainer, {
        backgroundColor: '#0f172a',
        logging: false,
        scale: 2 // Better resolution
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height] // Custom format to fit the table exactly
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${sheetName.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    } catch (err) {
      console.error("PDF Export failed", err);
      alert("Failed to export PDF");
    } finally {
      document.body.removeChild(tempContainer);
      setShowExportMenu(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
      {/* Toolbar */}
      <div className="h-14 border-b border-slate-800 bg-slate-900 flex items-center px-4 justify-between shrink-0 z-30">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            className="text-xl font-bold bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 outline-none text-indigo-400 focus:text-indigo-300 transition-colors px-1"
            title="Rename Sheet"
          />
          <div className="h-6 w-px bg-slate-700 mx-2"></div>
          <button
            onClick={addColumn}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm transition-colors"
          >
            <Plus size={16} /> Add Column
          </button>
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm transition-colors"
          >
            <Plus size={16} /> Add Row
          </button>
          <div className="h-6 w-px bg-slate-700 mx-2"></div>
          <label
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm transition-colors cursor-pointer"
          >
            <Upload size={16} /> Import
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm transition-colors shadow-sm"
          >
            <Download size={16} /> Export <ChevronDown size={14} />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-md shadow-xl z-50 overflow-hidden">
              <button
                onClick={exportJson}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 hover:text-white text-left transition-colors"
              >
                <FileJson size={16} className="text-yellow-400" /> JSON (Backup)
              </button>
              <button
                onClick={exportHtml}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 hover:text-white text-left transition-colors border-t border-slate-700/50"
              >
                <FileCode size={16} className="text-orange-400" /> HTML (Visual)
              </button>
              <button
                onClick={exportPdf}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 hover:text-white text-left transition-colors border-t border-slate-700/50"
              >
                <FileText size={16} className="text-red-400" /> PDF (Print)
              </button>
              <button
                onClick={exportExcel}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 hover:text-white text-left transition-colors border-t border-slate-700/50"
              >
                <FileSpreadsheet size={16} className="text-green-400" /> Excel (Data)
              </button>
            </div>
          )}

          {/* Overlay to close menu on click outside */}
          {showExportMenu && (
            <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)}></div>
          )}
        </div>
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-auto relative">
        <div className="inline-block align-top relative min-w-full">

          {/* Header Row */}
          <div className="sticky top-0 z-20 flex bg-slate-900 shadow-md">
            {/* Corner Cell */}
            <div className="w-12 shrink-0 border-r border-b border-slate-800 bg-slate-900 sticky left-0 z-30"></div>

            {columns.map(col => (
              <div
                key={col.id}
                className="relative shrink-0 h-10 flex items-center justify-center border-r border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider select-none group/header"
                style={{ width: col.width }}
                onDoubleClick={() => startEditingColumn(col.id, col.label)}
              >
                {editingColumnId === col.id ? (
                  <div className="flex items-center gap-1 px-2">
                    <input
                      type="text"
                      value={editingColumnLabel}
                      onChange={(e) => setEditingColumnLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') finishEditingColumn();
                        if (e.key === 'Escape') {
                          setEditingColumnId(null);
                          setEditingColumnLabel('');
                        }
                      }}
                      onBlur={finishEditingColumn}
                      autoFocus
                      className="bg-slate-800 border border-indigo-500 rounded px-2 py-0.5 text-sm text-slate-200 outline-none w-full max-w-[120px]"
                    />
                    <button
                      onClick={finishEditingColumn}
                      className="text-green-400 hover:text-green-300 p-0.5"
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="truncate px-4" title={col.label}>{col.label}</span>

                    {/* Edit Column Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingColumn(col.id, col.label);
                      }}
                      className="absolute left-2 top-2 opacity-0 group-hover/header:opacity-100 hover:bg-indigo-500/20 hover:text-indigo-400 p-0.5 rounded transition-all z-40"
                      title="Rename Column"
                    >
                      <Pencil size={12} />
                    </button>

                    {/* Delete Column Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteColumn(col.id);
                      }}
                      className="absolute right-2 top-2 opacity-0 group-hover/header:opacity-100 hover:bg-red-500/20 hover:text-red-400 p-0.5 rounded transition-all z-40"
                      title="Delete Column"
                    >
                      <X size={12} />
                    </button>
                  </>
                )}

                <ResizeHandle
                  orientation="horizontal"
                  onResize={(delta) => handleColResize(col.id, delta)}
                />
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="relative">
            {rows.map((row, index) => (
              <div key={row.id} className="flex relative group/row">

                {/* Row Header (Number + Resize) */}
                <div
                  className="sticky left-0 z-10 w-12 shrink-0 bg-slate-900 border-r border-b border-slate-800 flex items-center justify-center text-xs text-slate-500 font-mono select-none"
                  style={{ height: row.height }}
                >
                  {index + 1}
                  <ResizeHandle
                    orientation="vertical"
                    onResize={(delta) => handleRowResize(row.id, delta)}
                  />
                </div>

                {/* Cells */}
                {columns.map(col => {
                  const cell = row.cells[col.id];
                  return (
                    <div key={`${row.id}-${col.id}`} className="shrink-0" style={{ width: col.width, height: row.height }}>
                      {cell ? (
                        <Cell
                          cell={cell}
                          rowId={row.id}
                          colId={col.id}
                          width={col.width}
                          height={row.height}
                          onChange={(newCell) => handleCellChange(row.id, col.id, newCell)}
                        />
                      ) : <div className="w-full h-full bg-slate-950 border-r border-b border-slate-800" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Empty Space Filler (Visual polish) */}
          <div className="h-full w-full absolute -z-10 bg-slate-950"></div>
        </div>
      </div>

      {/* Exit Warning Modal */}
      {showExitWarning && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-amber-500/10 border-b border-slate-700 px-6 py-4 flex items-center gap-3">
              <div className="bg-amber-500/20 p-2 rounded-full">
                <AlertTriangle className="text-amber-400" size={24} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Unsaved Data</h2>
                <p className="text-sm text-slate-400">You have data that hasn't been exported</p>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-slate-300 mb-4">Would you like to export your work before leaving?</p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { exportJson(); setShowExitWarning(false); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
                >
                  <FileJson size={18} className="text-yellow-400" />
                  JSON
                </button>
                <button
                  onClick={() => { exportExcel(); setShowExitWarning(false); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
                >
                  <FileSpreadsheet size={18} className="text-green-400" />
                  Excel
                </button>
                <button
                  onClick={() => { exportHtml(); setShowExitWarning(false); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
                >
                  <FileCode size={18} className="text-orange-400" />
                  HTML
                </button>
                <button
                  onClick={() => { exportPdf(); setShowExitWarning(false); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
                >
                  <FileText size={18} className="text-red-400" />
                  PDF
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-900/50 border-t border-slate-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowExitWarning(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Continue Editing
              </button>
              <button
                onClick={() => setShowExitWarning(false)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
              >
                Leave Without Saving
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Tab Warning Banner */}
      {showMultiTabWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} />
            <span className="text-sm font-medium">
              ⚠️ Multiple tabs detected! Editing in multiple tabs may cause data conflicts. Please close other tabs.
            </span>
          </div>
          <button
            onClick={() => setShowMultiTabWarning(false)}
            className="p-1 hover:bg-amber-700 rounded transition-colors"
            title="Dismiss"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
};