import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Clock,
  Cpu,
  HardDrive,
  RefreshCw,
  Search,
  Server,
  Timer,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProcessKill, useProcessList, useSystemStats } from "@/hooks/use-process";
import { useFrameStore } from "@/stores/frame-store";
import type { ProcessInfo } from "@/api/process";
import { type PluginViewProps, registerPlugin } from "../registry";

type SortField = "pid" | "name" | "cpuPercent" | "memPercent" | "status";
type SortDirection = "asc" | "desc";

const REFRESH_OPTIONS = [
  { value: "0", label: "Manual" },
  { value: "1000", label: "1s" },
  { value: "2000", label: "2s" },
  { value: "5000", label: "5s" },
  { value: "10000", label: "10s" },
];

const CPU_HISTORY_SIZE = 60;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const ProcessMonitorView: React.FC<PluginViewProps> = ({ isActive }) => {
  const setPageMenuItems = useFrameStore((s) => s.setPageMenuItems);
  const [refreshInterval, setRefreshInterval] = useState<number>(2000);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("cpuPercent");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [killDialogOpen, setKillDialogOpen] = useState(false);
  const [killSignal, setKillSignal] = useState("SIGTERM");
  const [cpuHistory, setCpuHistory] = useState<{ time: string; value: number }[]>([]);

  const { data: systemStats, refetch: refetchStats, isLoading: statsLoading } = useSystemStats(refreshInterval || undefined);
  const { data: processData, refetch: refetchProcesses, isLoading: processesLoading } = useProcessList(refreshInterval || undefined);
  const killMutation = useProcessKill();

  useEffect(() => {
    if (systemStats?.cpu) {
      setCpuHistory((prev) => {
        const newEntry = {
          time: new Date().toLocaleTimeString("en-US", { hour12: false, minute: "2-digit", second: "2-digit" }),
          value: Math.round(systemStats.cpu.usagePercent * 10) / 10,
        };
        const newHistory = [...prev, newEntry];
        if (newHistory.length > CPU_HISTORY_SIZE) {
          return newHistory.slice(-CPU_HISTORY_SIZE);
        }
        return newHistory;
      });
    }
  }, [systemStats?.cpu?.usagePercent]);

  const handleRefresh = useCallback(() => {
    refetchStats();
    refetchProcesses();
  }, [refetchStats, refetchProcesses]);

  useEffect(() => {
    if (!isActive) return;
    setPageMenuItems([
      {
        id: "refresh-processes",
        icon: <RefreshCw size={18} />,
        label: "Refresh",
        onClick: handleRefresh,
      },
    ]);
    return () => setPageMenuItems([]);
  }, [isActive, setPageMenuItems, handleRefresh]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleKillProcess = () => {
    if (selectedProcess) {
      killMutation.mutate(
        { pid: selectedProcess.pid, signal: killSignal },
        {
          onSuccess: () => {
            setKillDialogOpen(false);
            setSelectedProcess(null);
          },
        }
      );
    }
  };

  const filteredAndSortedProcesses = useMemo(() => {
    if (!processData?.processes) return [];
    let filtered = processData.processes;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(lower) || p.pid.toString().includes(lower) || p.username.toLowerCase().includes(lower)
      );
    }
    return [...filtered].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [processData?.processes, searchTerm, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown size={14} className="opacity-30" />;
    return sortDirection === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  const memoryChartData = systemStats
    ? [
        { name: "Used", value: systemStats.memory.used, color: "var(--color-primary)" },
        { name: "Available", value: systemStats.memory.available, color: "var(--color-muted)" },
      ]
    : [];

  const isLoading = statsLoading || processesLoading;

  return (
    <div className="h-full flex flex-col bg-ide-bg overflow-hidden">
      <div className="flex-shrink-0 px-3 sm:px-4 py-2 sm:py-3 border-b border-ide-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-ide-accent sm:w-5 sm:h-5" />
            <span className="font-medium text-ide-text text-sm sm:text-base">Process Monitor</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative flex-1 sm:flex-none">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-ide-mute sm:w-4 sm:h-4 sm:left-2.5" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-40 md:w-48 pl-7 sm:pl-8 h-7 sm:h-8 text-xs sm:text-sm bg-ide-panel border-ide-border"
              />
            </div>
            <Select value={refreshInterval.toString()} onValueChange={(v) => setRefreshInterval(Number(v))}>
              <SelectTrigger className="w-16 sm:w-20 h-7 sm:h-8 text-xs sm:text-sm bg-ide-panel border-ide-border">
                <Timer size={12} className="mr-0.5 sm:mr-1 sm:w-3.5 sm:h-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
              <RefreshCw size={14} className={`sm:w-4 sm:h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 p-2 sm:p-4 border-b border-ide-border overflow-x-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 min-w-0">
          <div className="bg-ide-panel rounded-lg p-2 sm:p-4 border border-ide-border min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <Cpu size={14} className="text-blue-500 sm:w-[18px] sm:h-[18px]" />
              <span className="text-xs sm:text-sm font-medium text-ide-text">CPU</span>
            </div>
            <div className="h-12 sm:h-20" style={{ minWidth: 60 }}>
              {cpuHistory.length > 1 ? (
                <AreaChart width={120} height={48} data={cpuHistory.slice(-20)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} className="w-full h-full sm:hidden">
                  <defs>
                    <linearGradient id="cpuGradientSm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} fill="url(#cpuGradientSm)" />
                </AreaChart>
              ) : null}
              {cpuHistory.length > 1 ? (
                <AreaChart width={180} height={80} data={cpuHistory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} className="hidden sm:block w-full h-full">
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--ide-panel)",
                      border: "1px solid var(--ide-border)",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "var(--ide-text)" }}
                    formatter={(value: number) => [`${value}%`, "CPU"]}
                  />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#cpuGradient)" />
                </AreaChart>
              ) : (
                <div className="h-full flex items-center justify-center text-ide-mute text-xs sm:text-sm">Loading...</div>
              )}
            </div>
            <div className="mt-1 sm:mt-2 flex justify-between text-[10px] sm:text-xs">
              <span className="text-ide-mute">{systemStats?.cpu.cores || "-"} cores</span>
              <span className="text-blue-500 font-medium">{systemStats?.cpu.usagePercent.toFixed(1) || "-"}%</span>
            </div>
          </div>

          <div className="bg-ide-panel rounded-lg p-2 sm:p-4 border border-ide-border min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <HardDrive size={14} className="text-green-500 sm:w-[18px] sm:h-[18px]" />
              <span className="text-xs sm:text-sm font-medium text-ide-text">Memory</span>
            </div>
            <div className="h-12 sm:h-20 flex items-center justify-center" style={{ minWidth: 60 }}>
              {systemStats ? (
                <PieChart width={60} height={48} className="sm:w-[100px] sm:h-[80px]">
                  <Pie
                    data={memoryChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={14}
                    outerRadius={20}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {memoryChartData.map((entry, index) => (
                      <Cell key={`cell-${entry.name}`} fill={index === 0 ? "#22c55e" : "var(--ide-border)"} />
                    ))}
                  </Pie>
                </PieChart>
              ) : (
                <div className="text-ide-mute text-xs sm:text-sm">Loading...</div>
              )}
            </div>
            <div className="mt-1 sm:mt-2 flex justify-between text-[10px] sm:text-xs">
              <span className="text-ide-mute truncate">{formatBytes(systemStats?.memory.used || 0)}</span>
              <span className="text-green-500 font-medium">{systemStats?.memory.usedPercent.toFixed(1) || "-"}%</span>
            </div>
          </div>

          <div className="bg-ide-panel rounded-lg p-2 sm:p-4 border border-ide-border min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <Server size={14} className="text-purple-500 sm:w-[18px] sm:h-[18px]" />
              <span className="text-xs sm:text-sm font-medium text-ide-text">System</span>
            </div>
            <div className="space-y-1 sm:space-y-2 text-[10px] sm:text-xs">
              <div className="flex justify-between gap-1">
                <span className="text-ide-mute">Host</span>
                <span className="text-ide-text font-medium truncate">{systemStats?.hostname || "-"}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span className="text-ide-mute">OS</span>
                <span className="text-ide-text truncate">{systemStats ? `${systemStats.os}/${systemStats.arch}` : "-"}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span className="text-ide-mute">Load</span>
                <span className="text-ide-text">
                  {systemStats ? `${systemStats.loadAvg.load1.toFixed(1)}` : "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-ide-panel rounded-lg p-2 sm:p-4 border border-ide-border min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <Clock size={14} className="text-orange-500 sm:w-[18px] sm:h-[18px]" />
              <span className="text-xs sm:text-sm font-medium text-ide-text">Stats</span>
            </div>
            <div className="space-y-1 sm:space-y-2 text-[10px] sm:text-xs">
              <div className="flex justify-between gap-1">
                <span className="text-ide-mute">Uptime</span>
                <span className="text-ide-text font-medium">{formatUptime(systemStats?.uptime || 0)}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span className="text-ide-mute">Procs</span>
                <span className="text-ide-text font-medium">{systemStats?.numProcess || "-"}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span className="text-ide-mute">Show</span>
                <span className="text-ide-text">{filteredAndSortedProcesses.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader className="sticky top-0 bg-ide-bg z-10">
              <TableRow className="hover:bg-transparent border-ide-border">
                <TableHead className="w-14 sm:w-20 cursor-pointer select-none text-xs sm:text-sm" onClick={() => handleSort("pid")}>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    PID <SortIcon field="pid" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none text-xs sm:text-sm" onClick={() => handleSort("name")}>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    Name <SortIcon field="name" />
                  </div>
                </TableHead>
                <TableHead className="hidden md:table-cell w-24 text-xs sm:text-sm">User</TableHead>
                <TableHead className="w-20 sm:w-24 cursor-pointer select-none text-xs sm:text-sm" onClick={() => handleSort("cpuPercent")}>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    CPU <SortIcon field="cpuPercent" />
                  </div>
                </TableHead>
                <TableHead className="hidden sm:table-cell w-24 cursor-pointer select-none text-xs sm:text-sm" onClick={() => handleSort("memPercent")}>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    Mem <SortIcon field="memPercent" />
                  </div>
                </TableHead>
                <TableHead className="hidden lg:table-cell w-24 text-xs sm:text-sm">Memory</TableHead>
                <TableHead className="hidden md:table-cell w-16 sm:w-20 cursor-pointer select-none text-xs sm:text-sm" onClick={() => handleSort("status")}>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    Status <SortIcon field="status" />
                  </div>
                </TableHead>
                <TableHead className="w-10 sm:w-16 text-xs sm:text-sm" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedProcesses.map((proc) => (
                <TableRow
                  key={proc.pid}
                  className="border-ide-border hover:bg-ide-panel/50 cursor-pointer"
                  onClick={() => setSelectedProcess(proc)}
                >
                  <TableCell className="font-mono text-ide-mute text-xs sm:text-sm py-1.5 sm:py-2">{proc.pid}</TableCell>
                  <TableCell className="font-medium text-ide-text truncate max-w-[100px] sm:max-w-xs text-xs sm:text-sm py-1.5 sm:py-2" title={proc.cmdline || proc.name}>
                    {proc.name}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-ide-mute truncate text-xs sm:text-sm py-1.5 sm:py-2">{proc.username}</TableCell>
                  <TableCell className="py-1.5 sm:py-2">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className="w-8 sm:w-12 h-1 sm:h-1.5 bg-ide-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(proc.cpuPercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] sm:text-xs w-8 sm:w-12">{proc.cpuPercent.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell py-1.5 sm:py-2">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className="w-8 sm:w-12 h-1 sm:h-1.5 bg-ide-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${Math.min(proc.memPercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] sm:text-xs w-8 sm:w-12">{proc.memPercent.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-ide-mute text-xs py-1.5 sm:py-2">{formatBytes(proc.memRss)}</TableCell>
                  <TableCell className="hidden md:table-cell py-1.5 sm:py-2">
                    <span
                      className={`px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-xs ${
                        proc.status === "R" || proc.status === "running"
                          ? "bg-green-500/20 text-green-500"
                          : proc.status === "S" || proc.status === "sleeping"
                            ? "bg-blue-500/20 text-blue-500"
                            : proc.status === "Z" || proc.status === "zombie"
                              ? "bg-red-500/20 text-red-500"
                              : "bg-gray-500/20 text-gray-500"
                      }`}
                    >
                      {proc.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 sm:py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 sm:h-7 sm:w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProcess(proc);
                        setKillDialogOpen(true);
                      }}
                    >
                      <X size={12} className="sm:w-3.5 sm:h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <AlertDialog open={killDialogOpen} onOpenChange={setKillDialogOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <AlertTriangle className="text-red-500" size={18} />
              Kill Process
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Are you sure you want to kill process <strong>{selectedProcess?.name}</strong> (PID: {selectedProcess?.pid})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 sm:py-4">
            <label className="text-xs sm:text-sm text-ide-mute block mb-2">Signal</label>
            <Select value={killSignal} onValueChange={setKillSignal}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SIGTERM">SIGTERM (15) - Graceful</SelectItem>
                <SelectItem value="SIGKILL">SIGKILL (9) - Force</SelectItem>
                <SelectItem value="SIGHUP">SIGHUP (1) - Hangup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleKillProcess} variant="destructive" disabled={killMutation.isPending} className="text-sm">
              {killMutation.isPending ? "Killing..." : "Kill Process"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

registerPlugin({
  id: "process-monitor",
  name: "Process Monitor",
  nameKey: "plugin.processMonitor.name",
  icon: Activity,
  order: 10,
  view: ProcessMonitorView,
  getMenuItems: () => [
    {
      id: "launch-monitor",
      icon: <Activity size={20} />,
      label: "Open Monitor",
    },
  ],
});

export default ProcessMonitorView;
