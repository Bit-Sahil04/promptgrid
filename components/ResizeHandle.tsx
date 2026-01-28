import React, { useState, useCallback, useEffect } from 'react';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  orientation: 'horizontal' | 'vertical'; // horizontal = resizing width (col), vertical = resizing height (row)
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ onResize, orientation }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setStartPos(orientation === 'horizontal' ? e.clientX : e.clientY);
    document.body.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const currentPos = orientation === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - startPos;
    onResize(delta);
    setStartPos(currentPos); // Incremental updates
  }, [isDragging, orientation, onResize, startPos]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    document.body.style.cursor = 'default';
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`absolute z-20 hover:bg-blue-500 transition-colors ${
        orientation === 'horizontal'
          ? 'right-0 top-0 bottom-0 w-1 cursor-col-resize h-full'
          : 'bottom-0 left-0 right-0 h-1 cursor-row-resize w-full'
      } ${isDragging ? 'bg-blue-500' : 'bg-transparent'}`}
    />
  );
};
