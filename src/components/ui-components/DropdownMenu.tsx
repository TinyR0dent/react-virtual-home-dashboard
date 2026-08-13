import { useEffect, useState } from 'react';

interface DropdownMenuProps<T> {
  placeholder?: string;
  items: T[];
  onSelect: (item: T) => void;
  style?: React.CSSProperties;
  selectedValue?: T | null;
}

export const DropdownMenu = <T,>({ placeholder, items, onSelect, style, selectedValue = null }: DropdownMenuProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(selectedValue);

  useEffect(() => {
    setSelectedItem(selectedValue);
  }, [selectedValue]);

  const handleSelect = (item: T) => {
    setSelectedItem(item);
    onSelect(item);
    setIsOpen(false);
  };

  return (
    <>
      <div className='dropdown' style={style}>
        <button className='dropdown-button' type='button' onClick={() => setIsOpen(!isOpen)}>
          <span className='dropdown-selected-item'>{selectedItem ? String(selectedItem) : placeholder || 'Select...'}</span>
          <span className='dropdown-chevron'>{isOpen ? '▲' : '▼'}</span>
        </button>
        {isOpen && (
          <ul className='dropdown-menu'>
            {items.map((item, index) => (
              <li
                key={index}
                className='dropdown-item'
                onMouseDown={event => {
                  // Prevent label wrappers from stealing focus/click and re-toggling.
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
          </ul>
        )}
      </div>

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
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 6px;
  list-style: none;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(14, 18, 24, 0.98);
  max-height: 220px;
  overflow-y: auto;
  z-index: 1200;
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
