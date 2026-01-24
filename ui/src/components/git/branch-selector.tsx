import { Check, GitBranch, Plus, Search, Trash2, X } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import type { Locale } from "@/stores";

interface BranchSelectorProps {
  isOpen: boolean;
  branches: string[];
  currentBranch: string;
  locale: Locale;
  onClose: () => void;
  onSwitch: (branch: string) => void;
  onCreate: (branch: string) => void;
  onDelete: (branch: string) => void;
}

const i18n = {
  en: {
    title: "Branches",
    search: "Search branches...",
    current: "Current",
    switch: "Switch",
    create: "Create Branch",
    delete: "Delete",
    newBranch: "New branch name...",
    cancel: "Cancel",
    confirm: "Create",
  },
  zh: {
    title: "分支",
    search: "搜索分支...",
    current: "当前",
    switch: "切换",
    create: "创建分支",
    delete: "删除",
    newBranch: "新分支名称...",
    cancel: "取消",
    confirm: "创建",
  },
};

const BranchSelector: React.FC<BranchSelectorProps> = ({
  isOpen,
  branches,
  currentBranch,
  locale,
  onClose,
  onSwitch,
  onCreate,
  onDelete,
}) => {
  const t = i18n[locale] || i18n.en;
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const filteredBranches = useMemo(() => {
    if (!search.trim()) return branches;
    const lower = search.toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(lower));
  }, [branches, search]);

  const handleSwitch = useCallback(
    (branch: string) => {
      if (branch !== currentBranch) {
        onSwitch(branch);
      }
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
      if (branch !== currentBranch) {
        onDelete(branch);
      }
    },
    [currentBranch, onDelete]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-ide-bg border border-ide-border rounded-lg shadow-xl w-80 max-h-96 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ide-border">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-ide-accent" />
            <span className="text-sm font-medium text-ide-text">{t.title}</span>
          </div>
          <button onClick={onClose} className="text-ide-mute hover:text-ide-text">
            <X size={16} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-ide-border">
          <div className="flex items-center gap-2 bg-ide-panel rounded px-2 py-1.5">
            <Search size={14} className="text-ide-mute" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.search}
              className="flex-1 bg-transparent text-sm text-ide-text outline-none placeholder-ide-mute"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredBranches.map((branch) => (
            <div
              key={branch}
              className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors ${
                branch === currentBranch ? "bg-ide-accent/10" : "hover:bg-ide-panel"
              }`}
              onClick={() => handleSwitch(branch)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch size={14} className={branch === currentBranch ? "text-ide-accent" : "text-ide-mute"} />
                <span className={`text-sm truncate ${branch === currentBranch ? "text-ide-accent font-medium" : "text-ide-text"}`}>
                  {branch}
                </span>
                {branch === currentBranch && (
                  <span className="text-[10px] bg-ide-accent/20 text-ide-accent px-1.5 py-0.5 rounded">
                    {t.current}
                  </span>
                )}
              </div>
              {branch !== currentBranch && (
                <button
                  onClick={(e) => handleDelete(e, branch)}
                  className="text-ide-mute hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-ide-border p-3">
          {isCreating ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder={t.newBranch}
                className="w-full bg-ide-panel border border-ide-border rounded px-3 py-1.5 text-sm text-ide-text outline-none focus:border-ide-accent"
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
                  className="flex-1 px-3 py-1.5 text-sm text-ide-mute hover:text-ide-text"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newBranchName.trim()}
                  className="flex-1 px-3 py-1.5 text-sm bg-ide-accent text-ide-bg rounded disabled:opacity-50"
                >
                  {t.confirm}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm text-ide-accent hover:bg-ide-accent/10 rounded"
            >
              <Plus size={14} />
              {t.create}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BranchSelector;
