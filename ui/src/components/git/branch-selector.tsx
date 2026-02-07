import { ArrowDown, ArrowUp, Check, GitBranch, Globe, Plus, Search, Trash2, X } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { getTranslation, type Locale } from "@/lib/i18n";

interface BranchSelectorProps {
  isOpen: boolean;
  branches: string[];
  remoteBranches: string[];
  currentBranch: string;
  aheadCount: number;
  behindCount: number;
  locale: Locale;
  onClose: () => void;
  onSwitch: (branch: string) => void;
  onCreate: (branch: string) => void;
  onDelete: (branch: string) => void;
}

const BranchSelector: React.FC<BranchSelectorProps> = ({
  isOpen,
  branches,
  remoteBranches,
  currentBranch,
  aheadCount,
  behindCount,
  locale,
  onClose,
  onSwitch,
  onCreate,
  onDelete,
}) => {
  const t = (key: string) => getTranslation(locale, key);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const localBranches = useMemo(() => {
    const lower = search.toLowerCase();
    return branches.filter((b) => b !== currentBranch && (!lower || b.toLowerCase().includes(lower)));
  }, [branches, currentBranch, search]);

  const filteredRemote = useMemo(() => {
    const lower = search.toLowerCase();
    return (remoteBranches ?? []).filter((b) => !lower || b.toLowerCase().includes(lower));
  }, [remoteBranches, search]);

  const handleSwitch = useCallback(
    (branch: string) => {
      if (branch !== currentBranch) onSwitch(branch);
      onClose();
    },
    [currentBranch, onSwitch, onClose]
  );

  const handleCreate = useCallback(() => {
    if (newBranchName.trim()) {
      onCreate(newBranchName.trim());
      setNewBranchName("");
      setIsCreating(false);
    }
  }, [newBranchName, onCreate]);

  const handleDelete = useCallback(
    (e: React.MouseEvent, branch: string) => {
      e.stopPropagation();
      if (branch !== currentBranch) onDelete(branch);
    },
    [currentBranch, onDelete]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-ide-bg border-t border-ide-border rounded-t-2xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ide-border">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-ide-accent" />
            <span className="text-sm font-medium text-ide-text">{t("git.branches")}</span>
          </div>
          <button onClick={onClose} className="text-ide-mute hover:text-ide-text p-1">
            <X size={16} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-ide-border">
          <div className="flex items-center gap-2 bg-ide-panel rounded-lg px-3 py-2">
            <Search size={14} className="text-ide-mute" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("git.searchBranches")}
              className="flex-1 bg-transparent text-sm text-ide-text outline-none placeholder-ide-mute"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] font-bold text-ide-mute uppercase">{t("git.current")}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-ide-accent/10">
            <div className="flex items-center gap-2 min-w-0">
              <GitBranch size={14} className="text-ide-accent shrink-0" />
              <span className="text-sm text-ide-accent font-medium truncate">{currentBranch}</span>
              <Check size={14} className="text-ide-accent shrink-0" />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {aheadCount > 0 && (
                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <ArrowUp size={9} /> {aheadCount}
                </span>
              )}
              {behindCount > 0 && (
                <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <ArrowDown size={9} /> {behindCount}
                </span>
              )}
            </div>
          </div>

          {localBranches.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-bold text-ide-mute uppercase">{t("git.local")}</span>
              </div>
              {localBranches.map((branch) => (
                <div
                  key={branch}
                  className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-ide-panel active:bg-ide-panel/80 transition-colors"
                  onClick={() => handleSwitch(branch)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch size={14} className="text-ide-mute shrink-0" />
                    <span className="text-sm text-ide-text truncate">{branch}</span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, branch)}
                    className="text-ide-mute hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </>
          )}

          {filteredRemote.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-bold text-ide-mute uppercase flex items-center gap-1">
                  <Globe size={10} /> {t("git.remote")}
                </span>
              </div>
              {filteredRemote.map((branch) => (
                <div
                  key={branch}
                  className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-ide-panel transition-colors"
                  onClick={() => {
                    const localName = branch.includes("/") ? branch.split("/").slice(1).join("/") : branch;
                    handleSwitch(localName);
                  }}
                >
                  <Globe size={14} className="text-ide-mute shrink-0" />
                  <span className="text-sm text-ide-mute truncate">{branch}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="border-t border-ide-border p-3">
          {isCreating ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder={t("git.newBranch")}
                className="w-full bg-ide-panel border border-ide-border rounded-lg px-3 py-2 text-sm text-ide-text outline-none focus:border-ide-accent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setIsCreating(false);
                    setNewBranchName("");
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setNewBranchName("");
                  }}
                  className="flex-1 px-3 py-2 text-sm text-ide-mute hover:text-ide-text rounded-lg"
                >
                  {t("git.cancel")}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newBranchName.trim()}
                  className="flex-1 px-3 py-2 text-sm bg-ide-accent text-ide-bg rounded-lg disabled:opacity-50"
                >
                  {t("git.create")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-ide-accent hover:bg-ide-accent/10 rounded-lg"
            >
              <Plus size={14} />
              {t("git.createBranch")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BranchSelector;
