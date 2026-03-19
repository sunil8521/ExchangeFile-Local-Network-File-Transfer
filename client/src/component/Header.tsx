import {
    TerminalSquare
} from 'lucide-react';
import useStore from '../store/useStore';

const Header = () => {
    const { SetIsSidebarOpen, isSidebarOpen, connectionState } = useStore();
    return (
        <header className="flex justify-between items-center p-4 md:px-8 py-4 z-40 w-full shrink-0 border-b border-zinc-900 bg-zinc-950 backdrop-blur-md">

            <div className="flex items-center gap-3 text-xl font-bold tracking-tight text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                🛰️ ExchangeFile
            </div>


            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2.5 bg-zinc-900/80 py-1.5 px-4 rounded-full border border-zinc-800 shadow-sm  sm:flex">
                    {connectionState == "connecting" ? (
                        <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse-slow"></div>
                    ) : (
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse-slow"></div>
                    )}
                    <span className="text-zinc-300 text-xs md:text-sm font-medium tracking-wide">{connectionState}</span>
                </div>

                <button
                    onClick={SetIsSidebarOpen}
                    className={`flex items-center gap-2 py-1.5 px-4 rounded-lg border transition-all ${isSidebarOpen ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800/50 hover:border-zinc-700'}`}
                >
                    <TerminalSquare size={18} />
                    <span className="text-sm font-medium hidden sm:block">Logs</span>
                </button>
            </div>
        </header>
    )
}
export default Header