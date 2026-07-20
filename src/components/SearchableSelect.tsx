import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  focusBorderColorClass?: string; // Tailwind class e.g. "focus-within:border-blue-500" or similar
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '-- Pilih --',
  emptyMessage = 'Tidak ada pilihan ditemukan',
  focusBorderColorClass = 'focus-within:border-blue-500'
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return options.find(opt => opt.value === value);
  }, [options, value]);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase();
    return options.filter(opt => 
      opt.value.toLowerCase().includes(q) || 
      (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
  }, [options, searchQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSelectOption = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      {/* Trigger / Display Field */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full p-2 border border-slate-300 rounded text-xs bg-white cursor-pointer hover:bg-slate-50 transition-colors ${
          isOpen ? focusBorderColorClass : ''
        }`}
      >
        <span className="truncate pr-2 select-none text-slate-800 font-medium">
          {selectedOption ? (
            <span className="flex items-center gap-1.5">
              <strong className="font-bold font-mono text-slate-900 bg-slate-100 px-1 py-0.5 rounded text-[10px]">
                {selectedOption.value}
              </strong>
              {selectedOption.sublabel && (
                <span className="text-slate-500 font-normal truncate">
                  - {selectedOption.sublabel}
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          )}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden flex flex-col max-h-64">
          {/* Search Input Box */}
          <div className="p-2 border-b border-slate-100 flex items-center bg-slate-50 gap-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Ketik untuk mencari..."
              className="w-full bg-transparent border-none outline-none text-xs text-slate-800 placeholder-slate-400 p-0.5"
            />
          </div>

          {/* Options List */}
          <div className="overflow-y-auto flex-1 py-1 max-h-48 scrollbar-thin">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={`${opt.value}-${idx}`}
                    onClick={() => handleSelectOption(opt.value)}
                    className={`px-3 py-2 text-xs cursor-pointer flex flex-col gap-0.5 transition-colors border-l-2 ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600 font-semibold'
                        : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold font-mono text-slate-900">{opt.value}</span>
                      {isSelected && (
                        <span className="text-[10px] text-blue-600 font-bold bg-blue-100/50 px-1 py-0.2 rounded">Terpilih</span>
                      )}
                    </div>
                    {opt.sublabel && (
                      <span className="text-slate-500 text-[11px] truncate font-normal">
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-3 text-center text-xs text-slate-400 italic">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
