import {
  TerminalSquare,
  Radio,
  ChevronRight,
  X,
} from 'lucide-react';
import { useRef, useEffect } from 'react';
import useStore from '../store/useStore';

const Sidebar = () => {
  const { isSidebarOpen, SetIsSidebarOpen, logs } = useStore();
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSidebarOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isSidebarOpen]);

  return (
    <div className={`fixed top-[73px] bottom-0 right-0 w-full md:w-[400px] bg-zinc-950/95 backdrop-blur-xl border-l border-zinc-800/80 shadow-2xl z-50 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/50">
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
          <TerminalSquare size={14} /> System Activity
        </h3>
        <button
          onClick={SetIsSidebarOpen}
          className="text-zinc-500 hover:text-white transition-colors bg-zinc-800/50 hover:bg-zinc-700/50 rounded-md p-1.5"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 p-5 overflow-y-auto terminal-scroll font-mono text-[0.75rem] md:text-[0.8rem] leading-relaxed space-y-3">
        {logs.map((log, idx) => {
          const LogIcon = log.includes('[CONNECT]') ? ChevronRight :
            log.includes('[SYSTEM]') ? TerminalSquare :
            log.includes('[TRANSFER]') ? ChevronRight : Radio;
          return (
            <div key={idx} className="flex gap-3 items-start text-zinc-400 group border-b border-zinc-800/30 pb-3 last:border-0 last:pb-0">
              <span className="text-zinc-600 shrink-0 mt-[2px]">
                <LogIcon size={12} className={
                  log.includes('[CONNECT]') ? 'text-zinc-300' :
                  log.includes('[TRANSFER]') ? 'text-emerald-400' :
                  log.includes('[SYSTEM]') ? 'text-zinc-300' :
                  'text-zinc-600'
                } />
              </span>
              <span className={
                log.includes('[CONNECT]') ? 'text-zinc-200' :
                log.includes('[TRANSFER]') ? 'text-emerald-300' :
                log.includes('[SYSTEM]') ? 'text-white' :
                'text-zinc-500'
              }>
                {log}
              </span>
            </div>
          );
        })}
        <div ref={terminalEndRef} className="h-4" />
      </div>
    </div>
  );
};
export default Sidebar;