import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DropdownFooterAction {
  label: string;
  onAction: () => void;
  showWhenNoResultsOnly?: boolean;
}

interface DropdownMenuProps<T> {
  placeholder?: string;
  items: T[];
  onSelect: (item: T) => void;
  style?: React.CSSProperties;
  selectedValue?: T | null;
  searchable?: boolean;
  searchPlaceholder?: string;
  footerActionLabel?: string;
  onFooterAction?: () => void;
  footerActionWhenNoResultsOnly?: boolean;
  footerActions?: DropdownFooterAction[];
}

export const DropdownMenu = <T,>({
  placeholder,
  items,
  onSelect,
  style,
  selectedValue = null,
  searchable = false,
  searchPlaceholder = 'Search...',
  footerActionLabel,
  onFooterAction,
  footerActionWhenNoResultsOnly = false,
  footerActions,
}: DropdownMenuProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(selectedValue);
  const [query, setQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0, openUp: false, maxHeight: 220 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedItem(selectedValue);
  }, [selectedValue]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(300, openUp ? spaceAbove - 8 : spaceBelow - 8));

      setMenuPosition({
        top: openUp ? rect.top - 6 : rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        openUp,
        maxHeight,
      });
    };

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!searchable) return items;
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter(item => String(item).toLowerCase().includes(term));
  }, [items, query, searchable]);

  const handleSelect = (item: T) => {
    setSelectedItem(item);
    onSelect(item);
    setIsOpen(false);
  };

  const resolvedFooterActions = useMemo(() => {
    const actions: DropdownFooterAction[] = [];

    if (footerActionLabel && onFooterAction) {
      actions.push({
        label: footerActionLabel,
        onAction: onFooterAction,
        showWhenNoResultsOnly: footerActionWhenNoResultsOnly,
      });
    }

    if (Array.isArray(footerActions)) {
      actions.push(...footerActions);
    }

    return actions.filter(action => !action.showWhenNoResultsOnly || filteredItems.length === 0);
  }, [filteredItems.length, footerActionLabel, footerActionWhenNoResultsOnly, footerActions, onFooterAction]);

  return (
    <>
      <div className='dropdown' style={style} ref={rootRef}>
        <button className='dropdown-button' ref={buttonRef} type='button' onClick={() => setIsOpen(!isOpen)}>
          <span className='dropdown-selected-item'>{selectedItem ? String(selectedItem) : placeholder || 'Select...'}</span>
          <span className='dropdown-chevron'>{isOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className='dropdown-menu dropdown-menu-portal'
            style={{
              position: 'fixed',
              left: menuPosition.left,
              width: menuPosition.width,
              zIndex: 5000,
              maxHeight: menuPosition.maxHeight,
              top: menuPosition.top,
              transform: menuPosition.openUp ? 'translateY(-100%)' : undefined,
            }}
          >
            {searchable && (
              <div className='dropdown-search-wrap'>
                <input
                  className='dropdown-search-input'
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  autoFocus
                />
              </div>
            )}

            <ul className='dropdown-list'>
              {filteredItems.map((item, index) => (
                <li
                  key={index}
                  className='dropdown-item'
                  onMouseDown={event => {
                    event.preventDefault();
                  }}
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSelect(item);
                  }}
                >
                  {String(item)}
                </li>
              ))}
              {filteredItems.length === 0 && <li className='dropdown-empty'>No results</li>}
              {resolvedFooterActions.length > 0 && (
                <li className='dropdown-footer-wrap'>
                  {resolvedFooterActions.map((action, index) => (
                    <button
                      key={`${action.label}-${index}`}
                      type='button'
                      className='dropdown-footer-action'
                      onMouseDown={event => event.preventDefault()}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        action.onAction();
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </li>
              )}
            </ul>
          </div>,
          document.body
        )}

      <style>{dropdownMenuCss}</style>
    </>
  );
};

const dropdownMenuCss = `
.dropdown {
  position: relative;
  width: 100%;
}

.dropdown-button {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  width: 100%;
  height: 32px;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  text-align: left;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}

.dropdown-button:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.28);
}

.dropdown-button:focus-visible {
  outline: none;
  border: none;
  box-shadow: 0 0 0 2px rgba(89, 183, 255, 0.18);
}

.dropdown-menu {
  margin: 0;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(14, 18, 24, 0.98);
  box-sizing: border-box;
}

.dropdown-menu-portal {
  display: flex;
  flex-direction: column;
}

.dropdown-list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.dropdown-search-wrap {
  position: sticky;
  top: 0;
  z-index: 1;
  padding-bottom: 6px;
  background: rgba(14, 18, 24, 0.98);
}

.dropdown-search-input {
  width: 100%;
  box-sizing: border-box;
  height: 30px;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 6px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.92);
  padding: 0 8px;
  font-size: 12px;
}

.dropdown-search-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(89, 183, 255, 0.24);
}

.dropdown-empty {
  padding: 7px 8px;
  border-radius: 6px;
  color: rgba(255,255,255,0.58);
  font-size: 12px;
}

.dropdown-footer-wrap {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.12);
}

.dropdown-footer-action {
  width: 100%;
  height: 30px;
  border: 1px solid rgba(89,183,255,0.4);
  border-radius: 6px;
  background: rgba(89,183,255,0.18);
  color: rgba(227,243,255,0.98);
  cursor: pointer;
  font-size: 12px;
  margin-top: 6px;
}

.dropdown-footer-action:hover {
  background: rgba(89,183,255,0.28);
}

.dropdown-item {
  padding: 7px 8px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: background-color 120ms ease;
}

.dropdown-item:hover {
  background: rgba(255, 255, 255, 0.12);
}

.dropdown-item:active {
  background: rgba(255, 255, 255, 0.18);
}

.dropdown-chevron {
  display: inline-block;
  opacity: 0.78;
  font-size: 11px;
  width: 12px;
  text-align: center;
  margin-left: 4px;
  flex: 0;
  background: transparent;
  border: 0;
}

.dropdown-selected-item {
  flex: 3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
