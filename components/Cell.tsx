import React, { useState, useRef } from 'react';
import { CellType, GridCell } from '../types';
import { X, Upload, Eye } from 'lucide-react';

interface CellProps {
  cell: GridCell;
  rowId: string;
  colId: string;
  width: number;
  height: number;
  onChange: (newCell: GridCell) => void;
}

export const Cell: React.FC<CellProps> = ({ cell, width, height, onChange }) => {
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...cell, content: e.target.value });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              onChange({
                ...cell,
                type: CellType.IMAGE,
                content: event.target.result as string
              });
            }
          };
          reader.readAsDataURL(file);
        }
        return; // Stop after finding an image
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange({
          ...cell,
          type: CellType.IMAGE,
          content: reader.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const clearCell = () => {
    onChange({ ...cell, type: CellType.TEXT, content: '' });
  };

  // Render Image Cell
  if (cell.type === CellType.IMAGE) {
    return (
      <div
        className="relative group w-full h-full bg-slate-900 border-r border-b border-slate-800 outline-none"
        style={{ width, height }}
        tabIndex={0}
        onPaste={handlePaste}
      >
        {/* Background pattern for transparency check */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>

        <img
          src={cell.content}
          alt="Cell content"
          className="w-full h-full object-contain p-1"
        />

        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            onClick={clearCell}
            className="p-1 bg-red-500/80 hover:bg-red-500 text-white rounded shadow-lg backdrop-blur-sm"
            title="Clear Image"
          >
            <X size={14} />
          </button>
        </div>

        {/* Preview button at bottom right */}
        <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              // Convert base64 to blob for reliable opening in new tab
              const byteString = atob(cell.content.split(',')[1]);
              const mimeType = cell.content.match(/data:([^;]+)/)?.[1] || 'image/png';
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              const blob = new Blob([ab], { type: mimeType });
              const blobUrl = URL.createObjectURL(blob);
              window.open(blobUrl, '_blank');
            }}
            className="p-1.5 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded shadow-lg backdrop-blur-sm"
            title="Open Image in New Tab"
          >
            <Eye size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Render Text Cell
  return (
    <div
      className={`relative w-full h-full border-r border-b border-slate-800 group transition-colors ${isFocused ? 'bg-slate-800' : 'bg-slate-900'}`}
      style={{ width, height }}
    >
      <textarea
        className="w-full h-full bg-transparent p-2 resize-none outline-none text-sm text-slate-200 placeholder-slate-600 font-mono leading-tight"
        value={cell.content}
        onChange={handleTextChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onPaste={handlePaste}
        placeholder="Enter text or paste image..."
      />

      {/* Floating Actions for Text Cell */}
      <div className={`absolute bottom-2 right-2 flex gap-1 transition-opacity ${isFocused || cell.content ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>

        {/* Upload Image Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded shadow-sm border border-slate-600"
          title="Upload Image"
        >
          <Upload size={14} />
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleImageUpload}
          />
        </button>
      </div>
    </div>
  );
};