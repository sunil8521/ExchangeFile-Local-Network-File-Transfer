import { useState, useRef, useEffect } from 'react';
import {
  Radio,
  TerminalSquare,
  Laptop,
  Smartphone,
  FileArchive,
  X,
  Monitor,
  Send,
  Check,
  Download,
  Loader2,
} from 'lucide-react';
import Header from "./component/Header";
import Sidebar from "./component/Sidebar";
import { getSocket } from './helper/socket';
import useStore from './store/useStore';
import type { Peer } from './store/useStore';

/* ── Helper: pick icon based on device type ── */
function DeviceIcon({ type, size = 36 }: { type: string; size?: number }) {
  switch (type) {
    case "mobile": return <Smartphone size={size} strokeWidth={1.5} />;
    case "tablet": return <Laptop size={size} strokeWidth={1.5} />;
    default: return <Monitor size={size} strokeWidth={1.5} />;
  }
}

/* ── Helper: format file size ── */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const {
    SetupDeviceName, deviceName, connectionState, hostDetails,
    peers, sendFileToPeer, acceptFile, rejectFile, resetTransfer,
    cancelTransfer,
    transferStatus, progress, speed, selectedFile, incomingRequest,
  } = useStore();

  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [sendToPeer, setSendToPeer] = useState<Peer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const username = sessionStorage.getItem('username');
    if (username) {
      SetupDeviceName(username);
      setIsSetupComplete(true);
    }
  }, []);

  useEffect(() => {
    if (isSetupComplete) {
      const socket = getSocket();
      if (!socket.connected) socket.connect();
    }
  }, [isSetupComplete]);

  const setUser = () => {
    sessionStorage.setItem('username', deviceName.trim());
    setIsSetupComplete(true);
    SetupDeviceName(deviceName.trim());
  };

  /* ── Send button clicked on a peer → open file picker ── */
  const handleSendClick = (peer: Peer) => {
    setSendToPeer(peer);
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && sendToPeer) {
      sendFileToPeer(sendToPeer.id, file);
    }
    // Reset so the same file can be picked again
    e.target.value = '';
  };

  const isSenderModalOpen = transferStatus !== "idle" && selectedFile !== null;
  const isReceiverModalOpen = incomingRequest !== null;

  /* ── Setup screen ── */
  if (!isSetupComplete) {
    return (
      <div className="flex flex-col h-[100dvh] items-center justify-center bg-zinc-950 text-zinc-50 font-sans selection:bg-zinc-800">
        <div className="bg-zinc-900/80 p-8 rounded-2xl border border-zinc-800 shadow-2xl max-w-sm w-[90%] flex flex-col items-center relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-zinc-800 rounded-full blur-3xl opacity-50"></div>
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-white rounded-full blur-3xl opacity-[0.03]"></div>

          <p className="text-zinc-400 text-sm text-center mb-8 z-10">Enter a display name to join the network.</p>

          <input
            type="text"
            placeholder="E.g. Desktop PC"
            value={deviceName}
            onChange={(e) => SetupDeviceName(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-4 py-3 mb-6 text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all placeholder:text-zinc-600 shadow-inner"
            autoFocus
            maxLength={20}
            onKeyDown={(e) => e.key === 'Enter' && deviceName.trim() && setUser()}
          />
          <button
            type="submit"
            onClick={setUser}
            disabled={!deviceName.trim()}
            className="w-full bg-white text-zinc-950 font-semibold py-3 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.1)]"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-zinc-950 text-zinc-50 font-sans selection:bg-zinc-800 relative">

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />

      {/* Header */}
      <Header />

      {/* Main Area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* LEFT SIDE (40%): Device Info */}
        {connectionState === "connecting" ? (
          <div className="w-full md:w-[40%] h-full flex flex-col items-center justify-center p-8 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none"></div>
            <Loader2 size={48} className="text-zinc-500 animate-spin mb-6" />
            <p className="text-zinc-500 font-mono text-sm">Connecting to network...</p>
          </div>
        ) : connectionState === "connected" ? (
          <div className="w-full md:w-[40%] h-full flex flex-col items-center justify-center p-8 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none"></div>
            <div className="relative mb-10 text-zinc-300 drop-shadow-[0_0_40px_rgba(255,255,255,0.15)] animate-fade-up">
              <DeviceIcon type={hostDetails?.deviceType || "desktop"} size={140} />
            </div>
            <div className="text-center z-10 flex flex-col items-center gap-2 animate-fade-up" style={{ animationDelay: '100ms' }}>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-2">
                {hostDetails?.name}
              </h1>
              <div className="text-zinc-500 font-mono text-base md:text-lg flex items-center gap-3">
                <span>{hostDetails?.os}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700"></span>
                <span>{hostDetails?.browser}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full md:w-[40%] h-full flex flex-col items-center justify-center p-8 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none"></div>
            <p className="text-zinc-500 font-mono text-sm">Disconnected from server</p>
          </div>
        )}

        {/* RIGHT SIDE (60%): Peer list */}
        <div className="w-full md:w-[60%] h-full flex flex-col justify-center p-4 md:p-12 relative animate-fade-up" style={{ animationDelay: '200ms' }}>
          <div className="w-full max-w-2xl h-full max-h-[750px] flex flex-col relative mx-auto">

            <div className="py-6 flex items-center gap-4 shrink-0 pl-2">
              <Radio className="text-zinc-500 animate-pulse-slow" size={28} />
              <h2 className="text-xl md:text-2xl font-medium tracking-wide text-zinc-300 italic">
                {peers.length === 0
                  ? <>Scanning for devices<span className="animate-ellipsis"></span></>
                  : `${peers.length} device${peers.length !== 1 ? 's' : ''} found`
                }
              </h2>
            </div>

            {/* Scrollable list of real peers */}
<div className="flex-none md:flex-1 max-h-[50vh] md:max-h-none overflow-y-auto terminal-scroll py-2 space-y-2 pr-4">              {peers.length === 0 && connectionState === "connected" && (
                <div className="text-center py-16">
                  <Radio size={48} className="text-zinc-700 mx-auto mb-4 animate-pulse-slow" />
                  <p className="text-zinc-600 text-sm font-mono">No other devices on this network yet.</p>
                  <p className="text-zinc-700 text-xs font-mono mt-2">Open PeeLink on another device to start sharing.</p>
                </div>
              )}

              {peers.map((peer, idx) => (
                <div
                  key={peer.id}
                  className="group rounded-2xl p-4 md:p-5 flex items-center justify-between transition-all duration-300 animate-fade-up hover:bg-zinc-900/40 cursor-default"
                  style={{ animationDelay: `${300 + idx * 80}ms` }}
                >
                  <div className="flex items-center gap-6">
                    <div className="text-zinc-500 group-hover:text-zinc-300 transition-colors drop-shadow-md">
                      <DeviceIcon type={peer.deviceType} />
                    </div>
                    <div className="flex flex-col">
                      <div className="text-lg md:text-xl font-semibold text-zinc-300 group-hover:text-white transition-colors tracking-tight pb-0.5">{peer.name}</div>
                      <div className="text-sm text-zinc-500 font-mono flex items-center gap-2">
                        <span>{peer.os}</span>
                        <span className="text-zinc-700">•</span>
                        <span>{peer.browser}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSendClick(peer)}
                    className="cursor-pointer flex items-center gap-2 px-5 py-2.5 bg-zinc-900/50 text-zinc-200 hover:text-white rounded-xl text-sm font-medium hover:bg-zinc-800 transition-all opacity-100  translate-x-4 group-hover:translate-x-0 duration-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-700"
                  >
                    <span>Send File</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none"></div>
          </div>
        </div>
      </main>

      {/* Sidebar */}
      <Sidebar />

      {/* ── SENDER MODAL ── */}
      <div className={`fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex justify-center items-center z-[100] transition-all duration-300 ${isSenderModalOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}>
        <div className={`bg-zinc-950 border border-zinc-800 p-6 md:p-8 rounded-2xl w-[90%] max-w-[420px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] transition-transform duration-300 ${isSenderModalOpen ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              {transferStatus === "done" ? "Transfer Complete" : "Sending File"}
            </h3>
            {/* <button
              className="text-zinc-500 hover:text-white transition-colors bg-zinc-900 hover:bg-zinc-800 rounded-md p-1.5"
              onClick={resetTransfer}
            >
              <X size={20} />
            </button> */}
          </div>

          {/* File info */}
          <div className="bg-zinc-900/50 p-4 rounded-xl mb-6 flex items-center gap-4 border border-zinc-800">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${transferStatus === "done" ? 'bg-emerald-500/20' : 'bg-white'}`}>
              {transferStatus === "done"
                ? <Check size={24} className="text-emerald-400" />
                : <FileArchive size={24} strokeWidth={1.5} className="text-zinc-950" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white tracking-tight text-sm truncate">{selectedFile?.name}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{selectedFile ? formatFileSize(selectedFile.size) : ''}</div>
            </div>
            {transferStatus === "requesting" && (
              <div className="h-6 w-6 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin shrink-0"></div>
            )}
          </div>

          {/* Status */}
          <div className="mb-6">
            {transferStatus === "requesting" && (
              <p className="text-zinc-400 text-sm text-center font-mono">Waiting for acceptance...</p>
            )}
            {transferStatus === "rejected" && (
              <p className="text-red-400 text-sm text-center font-mono">File was rejected by the peer.</p>
            )}
            {transferStatus === "connecting" && (
              <div className="flex items-center justify-center gap-3">
                <div className="h-5 w-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin"></div>
                <p className="text-zinc-400 text-sm font-mono">Establishing connection...</p>
              </div>
            )}
            {(transferStatus === "transferring" || transferStatus === "done") && (
              <div className="space-y-3">
                {/* Progress bar */}
                <div className="w-full bg-zinc-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-200 ${transferStatus === "done" ? 'bg-emerald-500' : 'bg-white'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className={transferStatus === "done" ? "text-emerald-400" : "text-zinc-300"}>{progress}%</span>
                  <span className="text-zinc-500">{transferStatus === "done" ? "Complete" : speed}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              className="flex-1 py-2.5 px-4 bg-zinc-900 text-white border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 rounded-lg font-medium transition-all text-sm md:text-base shadow-sm"
              onClick={transferStatus === "done" ? resetTransfer : cancelTransfer}
            >
              {transferStatus === "done" ? "Done" : "Cancel"}
            </button>
          </div>
        </div>
      </div>

      {/* ── RECEIVER MODAL (Accept / Reject) ── */}
      <div className={`fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex justify-center items-center z-[100] transition-all duration-300 ${isReceiverModalOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}>
        <div className={`bg-zinc-950 border border-zinc-800 p-6 md:p-8 rounded-2xl w-[90%] max-w-[420px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] transition-transform duration-300 ${isReceiverModalOpen ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl md:text-2xl font-bold tracking-tight text-white">Incoming File</h3>
            {/* <button
              className="text-zinc-500 hover:text-white transition-colors bg-zinc-900 hover:bg-zinc-800 rounded-md p-1.5"
              onClick={rejectFile}
            >
              <X size={20} />
            </button> */}
          </div>

          {incomingRequest && (
            <>
              {/* From info */}
              <div className="bg-zinc-900/50 p-4 rounded-xl mb-4 border border-zinc-800">
                <p className="text-xs text-zinc-500 font-mono mb-1">From</p>
                <p className="text-white font-semibold">{incomingRequest.fromName}</p>
              </div>

              {/* File info */}
              <div className="bg-zinc-900/50 p-4 rounded-xl mb-6 flex items-center gap-4 border border-zinc-800">
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center text-zinc-950 shrink-0">
                  <FileArchive size={24} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white tracking-tight text-sm truncate">{incomingRequest.fileName}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{formatFileSize(incomingRequest.fileSize)}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 px-4 bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white rounded-lg font-medium transition-all text-sm md:text-base shadow-sm"
                  onClick={rejectFile}
                >
                  Reject
                </button>
                <button
                  className="flex-1 py-2.5 px-4 bg-white text-zinc-950 rounded-lg font-semibold transition-all text-sm md:text-base shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:bg-zinc-200 flex items-center justify-center gap-2"
                  onClick={acceptFile}
                >
                  <Download size={16} />
                  Accept
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── RECEIVER PROGRESS MODAL ── */}
      {transferStatus !== "idle" && !selectedFile && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex justify-center items-center z-[100]">
          <div className="bg-zinc-950 border border-zinc-800 p-6 md:p-8 rounded-2xl w-[90%] max-w-[420px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                {transferStatus === "done" ? "File Received!" : "Receiving File"}
              </h3>
              {transferStatus === "done" && (
                <button
                  className="text-zinc-500 hover:text-white transition-colors bg-zinc-900 hover:bg-zinc-800 rounded-md p-1.5"
                  onClick={resetTransfer}
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="space-y-3 mb-6">
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-200 ${transferStatus === "done" ? 'bg-emerald-500' : 'bg-white'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className={transferStatus === "done" ? "text-emerald-400" : "text-zinc-300"}>{progress}%</span>
                <span className="text-zinc-500">{transferStatus === "done" ? "Downloaded ✓" : "Receiving..."}</span>
              </div>
            </div>

            {transferStatus === "done" && (
              <button
                className="w-full py-2.5 px-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg font-medium transition-all text-sm"
                onClick={resetTransfer}
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
