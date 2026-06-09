"use client";

import { useEffect, useState } from "react";

type DictEntry = {
  id: string;
  name: string;
  aliases: string[];
  createdAt: string;
};

type HierarchyItem = {
  workshop: DictEntry;
  subWorkshops: Array<{
    subWorkshop: DictEntry;
    stacks: DictEntry[];
  }>;
};

// ---- Универсальный компонент для добавления ----
function AddRow({ onAdd, placeholder }: { onAdd: (name: string) => void; placeholder: string }) {
  const [name, setName] = useState("");
  return (
    <div className="flex gap-2 mb-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm"
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onAdd(name.trim()); setName(""); } }}
      />
      <button
        onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(""); } }}
        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
      >
        +
      </button>
    </div>
  );
}

// ---- Строка словаря ----
function DictRow({
  entry,
  onRename,
  onDelete,
}: {
  entry: DictEntry;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(entry.name);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg group">
      {editing ? (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-2 py-1 border border-border rounded text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") { onRename(name); setEditing(false); } }}
            autoFocus
          />
          <button onClick={() => { onRename(name); setEditing(false); }} className="text-green-600 text-xs">OK</button>
          <button onClick={() => { setEditing(false); setName(entry.name); }} className="text-gray-400 text-xs">Отмена</button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm">{entry.name}</span>
          {entry.aliases.length > 0 && (
            <span className="text-xs text-gray-400 hidden sm:inline">{entry.aliases.join(", ")}</span>
          )}
          <button onClick={() => setEditing(true)} className="text-blue-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
            переименовать
          </button>
          <button onClick={onDelete} className="text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
            удалить
          </button>
        </>
      )}
    </div>
  );
}

export default function DictionariesPage() {
  const [hierarchy, setHierarchy] = useState<HierarchyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWorkshops, setExpandedWorkshops] = useState<Set<string>>(new Set());
  const [editingWorkshopId, setEditingWorkshopId] = useState<string | null>(null);
  const [editingWorkshopName, setEditingWorkshopName] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/dictionaries?mode=hierarchy");
      const data = await res.json();
      setHierarchy(data.hierarchy || []);
    } catch {
      console.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      try {
        const res = await fetch("/api/dictionaries?mode=hierarchy");
        const data = await res.json();
        if (!cancelled) setHierarchy(data.hierarchy || []);
      } catch {
        console.error("Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: string) => {
    setExpandedWorkshops((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- CRUD ----
  async function add(type: string, name: string, parentId?: string) {
    await fetch("/api/dictionaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name, parentId }),
    });
    load();
  }

  async function rename(type: string, id: string, name: string) {
    await fetch("/api/dictionaries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, name }),
    });
    load();
  }

  async function remove(type: string, id: string) {
    await fetch(`/api/dictionaries?type=${type}&id=${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="text-gray-500">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Структура организации</h1>
        <p className="text-gray-500 mt-1">Цеха → Подцеха → Стеки</p>
      </div>

      {/* Добавить цех */}
      <div className="bg-white rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Новый цех</h2>
        <AddRow onAdd={(name) => add("workshop", name)} placeholder="Название цеха" />
      </div>

      {/* Иерархия */}
      <div className="space-y-3">
        {hierarchy.map((item) => {
          const isExpanded = expandedWorkshops.has(item.workshop.id);
          return (
            <div key={item.workshop.id} className="bg-white rounded-xl border border-border overflow-hidden">
              {/* Цех */}
              <div
                className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer select-none"
                onClick={() => toggle(item.workshop.id)}
              >
                <span className="text-gray-400 text-sm">{isExpanded ? "▾" : "▸"}</span>
                {editingWorkshopId === item.workshop.id ? (
                  <input
                    value={editingWorkshopName}
                    onChange={(e) => setEditingWorkshopName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        rename("workshop", item.workshop.id, editingWorkshopName);
                        setEditingWorkshopId(null);
                      }
                      if (e.key === "Escape") setEditingWorkshopId(null);
                    }}
                    autoFocus
                    className="flex-1 px-2 py-1 border border-border rounded text-sm font-semibold"
                  />
                ) : (
                  <span className="font-semibold text-gray-900 flex-1">{item.workshop.name}</span>
                )}
                <span className="text-xs text-gray-400">{item.subWorkshops.length} подцехов</span>
                {editingWorkshopId === item.workshop.id ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        rename("workshop", item.workshop.id, editingWorkshopName);
                        setEditingWorkshopId(null);
                      }}
                      className="text-green-600 text-xs"
                    >
                      OK
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingWorkshopId(null); }}
                      className="text-gray-400 text-xs"
                    >
                      Отмена
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingWorkshopId(item.workshop.id);
                      setEditingWorkshopName(item.workshop.name);
                    }}
                    className="text-blue-500 text-xs hover:text-blue-700"
                  >
                    переименовать
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); remove("workshop", item.workshop.id); }}
                  className="text-red-400 text-xs hover:text-red-600"
                >
                  удалить
                </button>
              </div>

              {/* Подцеха */}
              {isExpanded && (
                <div className="px-4 py-3 space-y-3 border-t border-border">
                  <AddRow
                    onAdd={(name) => add("subWorkshop", name, item.workshop.id)}
                    placeholder="Новый подцех"
                  />
                  {item.subWorkshops.map((sub) => (
                    <div key={sub.subWorkshop.id} className="ml-4 border-l-2 border-gray-200 pl-3 space-y-2">
                      <DictRow
                        entry={sub.subWorkshop}
                        onRename={(name) => rename("subWorkshop", sub.subWorkshop.id, name)}
                        onDelete={() => remove("subWorkshop", sub.subWorkshop.id)}
                      />
                      {/* Стеки */}
                      <div className="ml-4 space-y-1">
                        <AddRow
                          onAdd={(name) => add("techStack", name, sub.subWorkshop.id)}
                          placeholder="Новый стек"
                        />
                        {sub.stacks.map((stack) => (
                          <DictRow
                            key={stack.id}
                            entry={stack}
                            onRename={(name) => rename("techStack", stack.id, name)}
                            onDelete={() => remove("techStack", stack.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
