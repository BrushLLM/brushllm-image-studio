import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LOCAL_TOOLS, SETTINGS_TOOL, type Page } from "../lib/tools";

const COMMANDS = [...LOCAL_TOOLS, SETTINGS_TOOL];
const SUGGESTIONS = LOCAL_TOOLS.slice(0, 5);
const LIST_ID = "tool-search-results";

function sectionKey(page: Page) {
  return page === "settings" ? "cmdk.otherSection" : "cmdk.localSection";
}

interface Props {
  onNavigate: (page: Page) => void;
  onClose: () => void;
}

export default function CommandPalette({ onNavigate, onClose }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const search = query.trim().toLowerCase();
  const tokens = search.match(/[a-z0-9]+/g) ?? [search];
  const matches = search
    ? COMMANDS.filter((item) => {
        const keys = [
          t(item.labelKey).toLowerCase(),
          t(item.searchDescriptionKey).toLowerCase(),
          ...item.keywords,
        ];
        return keys.some((key) => key.includes(search)) ||
          tokens.every((token) => keys.some((key) => key.includes(token)));
      })
    : COMMANDS;
  const showingSuggestions = matches.length === 0;
  const results = showingSuggestions ? SUGGESTIONS : matches;
  const selected = activeIndex ?? (showingSuggestions ? -1 : 0);
  const selectedItem = results[selected];

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    inputRef.current?.focus();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [selectedItem]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setActiveIndex(null);
  };

  const run = (page: Page) => {
    onNavigate(page);
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(Math.min(results.length - 1, selected + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(0, selected - 1));
    } else if (event.key === "Enter" && selectedItem) {
      event.preventDefault();
      run(selectedItem.id);
    }
  };

  return (
    <dialog
      className="cmdk"
      ref={dialogRef}
      aria-label={t("navigation.search")}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="cmdk-search">
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={t("navigation.search")}
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={LIST_ID}
          aria-activedescendant={selectedItem ? `${LIST_ID}-${selectedItem.id}` : undefined}
          value={query}
          placeholder={t("cmdk.placeholder")}
          onChange={(event) => changeQuery(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        {query && (
          <button type="button" className="cmdk-clear" aria-label={t("cmdk.clear")} onClick={() => {
            changeQuery("");
            inputRef.current?.focus();
          }}>
            <X aria-hidden="true" />
          </button>
        )}
        <kbd className="kbd cmdk-kbd" aria-hidden="true">Esc</kbd>
      </div>
      {showingSuggestions && (
        <p className="cmdk-empty" role="status">{t("cmdk.empty", { query: query.trim() })}</p>
      )}
      <div id={LIST_ID} className="cmdk-list" role="listbox"
        aria-label={t(showingSuggestions ? "cmdk.suggestSection" : "navigation.search")} ref={listRef}>
        {results.map((item, index) => {
          const section = showingSuggestions ? "cmdk.suggestSection" : sectionKey(item.id);
          const previous = results[index - 1];
          const showSection = !previous || (!showingSuggestions && sectionKey(previous.id) !== section);
          return (
            <div key={item.id} role="presentation">
              {showSection && <div className="cmdk-section" aria-hidden="true">{t(section)}</div>}
              <button
                id={`${LIST_ID}-${item.id}`}
                type="button"
                className={`cmdk-item${index === selected ? " selected" : ""}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === selected}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => run(item.id)}
              >
                <item.icon aria-hidden="true" />
                <span className="cmdk-item-text">
                  {t(item.labelKey)}
                  <span className="cmdk-item-desc">{t(item.searchDescriptionKey)}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </dialog>
  );
}
