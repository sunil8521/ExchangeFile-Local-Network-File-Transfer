import { create } from "zustand";
import type { Socket } from "socket.io-client";

export interface Peer {
    id: string;
    name: string;
    os: string;
    browser: string;
    deviceType: string;
}

export interface IncomingRequest {
    from: string;
    fromName: string;
    fileName: string;
    fileSize: number;
    fileType: string;
}


interface StateType {
    isSidebarOpen: boolean;
    SetIsSidebarOpen: () => void;

    deviceName: string;
    SetupDeviceName: (val: string) => void;
    hostDetails: {
        name: string;
        os: string;
        browser: string;
        deviceType: string;
    } | null;
    connectionState: "connected" | "disconnected" | "connecting";

    peers: Peer[];

    /* Logs */
    logs: string[];
    addLog: (msg: string) => void;

    /* File transfer — sender side */
    targetPeerId: string | null;
    selectedFile: File | null;
    transferStatus: "idle" | "requesting" | "rejected" | "connecting" | "transferring" | "done";
    progress: number;
    speed: string;

    /* File transfer — receiver side */
    incomingRequest: IncomingRequest | null;

    /* Actions */
    SetupListeners: (socket: Socket) => void;
    sendFileToPeer: (peerId: string, file: File) => void;
    acceptFile: () => void;
    rejectFile: () => void;
    resetTransfer: () => void;
    cancelTransfer: () => void;
}

const METERED_API_KEY = import.meta.env.VITE_METERED_API_KEY || "3bba07ed460b32429b7f9a14c5eec50ff904";
const METERED_API_URL = `https://sunilnb852.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`;

// Default STUN-only config (used before/if TURN credentials fail)
const DEFAULT_ICE_CONFIG: RTCConfiguration = {
    iceServers: [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
            ],
        },
    ],
};

// Cached ICE configuration with TURN servers
let cachedIceConfig: RTCConfiguration | null = null;
let fetchPromise: Promise<RTCConfiguration> | null = null;

async function fetchTurnCredentials(): Promise<RTCConfiguration> {
    try {
        const response = await fetch(METERED_API_URL);
        if (!response.ok) throw new Error(`Metered API error: ${response.status}`);
        const iceServers = await response.json();
        cachedIceConfig = {
            iceServers: [
                ...DEFAULT_ICE_CONFIG.iceServers!,
                ...iceServers,
            ],
        };
        console.log("✅ TURN credentials fetched from Metered");
        return cachedIceConfig;
    } catch (err) {
        console.warn("⚠️ Failed to fetch TURN credentials, using STUN only:", err);
        return DEFAULT_ICE_CONFIG;
    }
}

async function getIceConfig(): Promise<RTCConfiguration> {
    if (cachedIceConfig) return cachedIceConfig;
    if (!fetchPromise) fetchPromise = fetchTurnCredentials();
    return fetchPromise;
}

// Pre-fetch TURN credentials on module load
fetchPromise = fetchTurnCredentials();

/* Module-level refs (not serializable) */
let peerConnection: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;
let socketRef: Socket | null = null;

/* File receive state */
let receiveChunks: ArrayBuffer[] = [];
let receivedSize = 0;
let receiveFileName = "";
let receiveFileSize = 0;
let receiveFileType = "";
let writableStream: FileSystemWritableFileStream | null = null;
let useStreamingWrite = false;
/* ── Helpers ── */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanupPeerConnection() {
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    receiveChunks = [];
    receivedSize = 0;
}

const useStore = create<StateType>((set, get) => ({
    isSidebarOpen: false,
    connectionState: "connecting",
    deviceName: "",
    hostDetails: null,
    peers: [],
    logs: ["[SYSTEM] PeeLink engine ready."],
    targetPeerId: null,
    selectedFile: null,
    transferStatus: "idle",
    progress: 0,
    speed: "0 MB/s",
    incomingRequest: null,

    SetIsSidebarOpen: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
    SetupDeviceName: (val: string) => set({ deviceName: val }),
    addLog: (msg: string) => set((s) => ({ logs: [...s.logs, msg] })),

    resetTransfer: () => {
        cleanupPeerConnection();

        set({
            targetPeerId: null,
            selectedFile: null,
            transferStatus: "idle",
            progress: 0,
            speed: "0 MB/s",
            incomingRequest: null,
        });
    },
    cancelTransfer: () => {
        if (!socketRef) return;

        socketRef.emit("cancel-file-from-peer", {
            to: get().targetPeerId,
        })
        get().addLog("[TRANSFER] You cancel the file trasnfer.");
        get().resetTransfer();





    },

    SetupListeners: (socket: Socket) => {
        socketRef = socket;

        socket.on("connect", () => {
            const { deviceName } = get();
            socket.emit("join", { name: deviceName, userAgent: navigator.userAgent });
        });

        socket.on("my-info", (data) => {
            set({ hostDetails: data, connectionState: "connected" });
            get().addLog(`[SYSTEM] Connected as "${data.name}" (${data.os} / ${data.browser})`);
        });

        socket.on("peers", (peers: Peer[]) => {
            set({ peers });
            if (peers.length > 0) {
                get().addLog(`[NETWORK] Found ${peers.length} device(s) on the network.`);
            }
        });

        socket.on("peer-joined", (peer: Peer) => {
            set((s) => ({ peers: [...s.peers.filter((p) => p.id !== peer.id), peer] }));
            get().addLog(`[NETWORK] ${peer.name} joined (${peer.os})`);
        });

        socket.on("peer-left", (peerId: string) => {
            const leaving = get().peers.find((p) => p.id === peerId);
            set((s) => ({ peers: s.peers.filter((p) => p.id !== peerId) }));
            if (leaving) get().addLog(`[NETWORK] ${leaving.name} left.`);
            if (get().targetPeerId === peerId) {
                get().addLog(`[SYSTEM] Transfer cancelled — peer disconnected.`);
                get().resetTransfer();
            }
        });

        socket.on("disconnect", () => {
            set({ connectionState: "disconnected", peers: [] });
            get().addLog("[SYSTEM] Disconnected from server.");
        });

        /* ── File request flow ── */
        // Receiver gets a file request
        socket.on("file-request", (data: IncomingRequest) => {
            set({ incomingRequest: data });
            get().addLog(`[TRANSFER] ${data.fromName} wants to send "${data.fileName}" (${formatFileSize(data.fileSize)})`);
        });

        // Sender gets the response
        socket.on("file-response", ({ from, accepted }: { from: string; accepted: boolean }) => {
            if (accepted) {
                get().addLog("[TRANSFER] Peer accepted! Establishing WebRTC connection...");
                set({ transferStatus: "connecting" });
                // Sender creates the offer
                createOfferAndSend(from);
            } else {
                get().addLog("[TRANSFER] Peer rejected the file request.");
                set({ transferStatus: "rejected" });
                setTimeout(() => get().resetTransfer(), 1500);
            }
        });


        socket.on("cancel-file-from-peer", () => {
            get().addLog("[TRANSFER] Sender cancel the file trasnfer.");
            get().resetTransfer()

        })

        /* ── WebRTC signaling ── */
        socket.on("offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
            get().addLog("[CONNECT] Received WebRTC offer, creating answer...");
            // Receiver creates pc, sets remote, creates answer
            cleanupPeerConnection();
            const iceConfig = await getIceConfig();
            const pc = new RTCPeerConnection(iceConfig);
            peerConnection = pc;

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit("ice-candidate", { to: from, candidate: event.candidate });
                }
            };

            // Receiver waits for incoming data channel
            pc.ondatachannel = (event) => {
                const channel = event.channel;
                channel.binaryType = "arraybuffer";
                dataChannel = channel;

                channel.onmessage = (e) => handleIncomingData(e);
                channel.onclose = () => {
                    get().addLog("[CONNECT] Data channel closed.");
                };
            };

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("answer", { to: from, answer });
        });

        socket.on("answer", async ({ answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
            get().addLog("[CONNECT] Received WebRTC answer, connection establishing...");
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        socket.on("ice-candidate", async ({ candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });
    },

    /* ── Send file action ── */
    sendFileToPeer: (peerId: string, file: File) => {
        if (!socketRef) return;
        set({ targetPeerId: peerId, selectedFile: file, transferStatus: "requesting", progress: 0 });
        get().addLog(`[TRANSFER] Requesting to send "${file.name}" (${formatFileSize(file.size)})...`);
        socketRef.emit("file-request", {
            to: peerId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
        });
    },

    /* ── Accept/Reject actions (receiver side) ── */
    acceptFile: async () => {
        const { incomingRequest } = get();
        if (!incomingRequest || !socketRef) return;

        // Reset receive state
        receiveFileName = incomingRequest.fileName;
        receiveFileSize = incomingRequest.fileSize;
        receiveFileType = incomingRequest.fileType;
        receiveChunks = [];
        receivedSize = 0;
        writableStream = null;
        useStreamingWrite = false;

        // Try the File System Access API (Chromium only) to stream directly to disk
        if (typeof window.showSaveFilePicker === "function") {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: incomingRequest.fileName,
                });
                writableStream = await handle.createWritable();
                useStreamingWrite = true;
                get().addLog("[TRANSFER] Streaming mode — file will save directly to disk.");
            } catch (err) {
                // User cancelled the save dialog
                if (err instanceof DOMException && err.name === "AbortError") {
                    get().addLog("[TRANSFER] Save dialog cancelled. Rejecting transfer.");
                    socketRef.emit("file-response", { to: incomingRequest.from, accepted: false });
                    set({ incomingRequest: null });
                    return;
                }
                // Other error — fall back to in-memory download
                get().addLog("[TRANSFER] Streaming unavailable, using in-memory fallback.");
                useStreamingWrite = false;
            }
        } else {
            get().addLog("[TRANSFER] Browser doesn't support streaming. Using in-memory download.");
        }

        socketRef.emit("file-response", { to: incomingRequest.from, accepted: true });
        set({ incomingRequest: null, transferStatus: "connecting", targetPeerId: incomingRequest.from, progress: 0 });
        get().addLog("[TRANSFER] File accepted, waiting for connection...");
    },

    rejectFile: () => {
        const { incomingRequest } = get();
        if (!incomingRequest || !socketRef) return;

        socketRef.emit("file-response", { to: incomingRequest.from, accepted: false });
        set({ incomingRequest: null });
        get().addLog("[TRANSFER] File rejected.");
    },
}));

/* ── WebRTC: Sender creates offer + data channel ── */
async function createOfferAndSend(targetPeerId: string) {
    if (!socketRef) return;
    cleanupPeerConnection();

    const iceConfig = await getIceConfig();
    const pc = new RTCPeerConnection(iceConfig);
    peerConnection = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socketRef!.emit("ice-candidate", { to: targetPeerId, candidate: event.candidate });
        }
    };

    // Create data channel (sender-side)
    const channel = pc.createDataChannel("file-transfer", { ordered: true });
    channel.binaryType = "arraybuffer";
    dataChannel = channel;

    channel.onopen = () => {
        useStore.getState().addLog("[CONNECT] Data channel open — starting file transfer.");
        useStore.setState({ transferStatus: "transferring" });
        // Start sending the file
        const file = useStore.getState().selectedFile;
        if (file) sendFileViaChannel(channel, file);
    };

    channel.onclose = () => {
        useStore.getState().addLog("[CONNECT] Data channel closed.");
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.emit("offer", { to: targetPeerId, offer });
}

/* ── Send file in chunks through DataChannel ── */
// async function sendFileViaChannel(channel: RTCDataChannel, file: File) {
//     const buffer = await file.arrayBuffer();
//     const totalSize = buffer.byteLength;
//     let offset = 0;
//     const startTime = Date.now();

//     const sendNextChunk = () => {
//         while (offset < totalSize) {    
//             if (channel.bufferedAmount > 1_000_000) {
//                 setTimeout(sendNextChunk, 50);
//                 return;
//             }

//             const end = Math.min(offset + CHUNK_SIZE, totalSize);
//             const chunk = buffer.slice(offset, end);
//             channel.send(chunk);
//             offset = end;

//             const progress = Math.floor((offset / totalSize) * 100);
//             const elapsed = (Date.now() - startTime) / 1000;
//             const speedMBs = elapsed > 0 ? (offset / (1024 * 1024)) / elapsed : 0;

//             useStore.setState({ progress, speed: `${speedMBs.toFixed(1)} MB/s` });
//         }

//         // Done sending
//         // Send a "done" signal as a string message
//         channel.send(JSON.stringify({ type: "transfer-complete" }));
//         useStore.setState({ transferStatus: "done", progress: 100 });
//         useStore.getState().addLog(`[TRANSFER] File sent successfully! (${formatFileSize(totalSize)})`);
//     };

//     sendNextChunk();
// }
// this can not handle large file because memory get full 


async function sendFileViaChannel(channel: RTCDataChannel, file: File) {
    const totalSize = file.size;
    let offset = 0;
    const startTime = Date.now();
    const CHUNK_SIZE = 64 * 1024; // 64KB is usually the sweet spot for RTC 
    const sendNextChunk = async () => {
        while (offset < totalSize) {
            // 1. Backpressure check
            if (channel.bufferedAmount > 1_000_000) {
                setTimeout(sendNextChunk, 50);
                return;
            }

            // 2. ONLY read the small slice we need right now
            const end = Math.min(offset + CHUNK_SIZE, totalSize);
            const blob = file.slice(offset, end);
            const chunk = await blob.arrayBuffer();

            channel.send(chunk);
            offset = end;

            // Update UI
            const progress = Math.floor((offset / totalSize) * 100);
            const elapsed = (Date.now() - startTime) / 1000;
            const speedMBs = elapsed > 0 ? (offset / (1024 * 1024)) / elapsed : 0;
            useStore.setState({ progress, speed: `${speedMBs.toFixed(1)} MB/s` });
        }
        //end
        channel.send(JSON.stringify({ type: "transfer-complete" }));
        useStore.setState({ transferStatus: "done", progress: 100 });
    };

    sendNextChunk();
}



/* ── Handle incoming data on receiver side ── */
// function handleIncomingData(event: MessageEvent) {

//     if (typeof event.data === "string") {
//         const parsed = JSON.parse(event.data);
//         if (parsed.type === "transfer-complete") {
//             // Reassemble file and trigger download
//             const blob = new Blob(receiveChunks, { type: receiveFileType });
//             const url = URL.createObjectURL(blob);

//             // Auto-download
//             const a = document.createElement("a");
//             a.href = url;
//             a.download = receiveFileName;
//             document.body.appendChild(a);
//             a.click();
//             document.body.removeChild(a);

//             useStore.setState({ transferStatus: "done", progress: 100 });
//             useStore.getState().addLog(`[TRANSFER] File received: "${receiveFileName}" (${formatFileSize(receiveFileSize)})`);

//             receiveChunks = [];
//             receivedSize = 0;
//         }
//         return;
//     }

//     // Binary chunk
//     if (event.data instanceof ArrayBuffer) {
//         receiveChunks.push(event.data);
//         receivedSize += event.data.byteLength;

//         if (receiveFileSize > 0) {
//             const progress = Math.floor((receivedSize / receiveFileSize) * 100);
//             useStore.setState({ transferStatus: "transferring", progress });
//         }
//     }
// }
// this recive method is not good for large file  because  it willl push all chuck in array then create blob ,when file is large it will lag so we will ask user 1st where to store then recive all  chuck

async function handleIncomingData(event: MessageEvent) {
    // 1. Handle Control Messages (Strings)
    if (typeof event.data === "string") {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "transfer-complete") {
            if (useStreamingWrite && writableStream) {
                // Streaming path — close the file on disk
                await writableStream.close();
                writableStream = null;
                useStore.setState({ transferStatus: "done", progress: 100 });
                useStore.getState().addLog(`[TRANSFER] Success! File saved to disk.`);
            } else {
                // Fallback path — assemble blob and trigger download
                const blob = new Blob(receiveChunks, { type: receiveFileType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = receiveFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                useStore.setState({ transferStatus: "done", progress: 100 });
                useStore.getState().addLog(`[TRANSFER] File received: "${receiveFileName}" (${formatFileSize(receiveFileSize)})`);
                receiveChunks = []; // free memory
            }
            receivedSize = 0;
        }
        return;
    }

    // 2. Handle Binary Chunks (ArrayBuffer)
    if (event.data instanceof ArrayBuffer) {
        if (useStreamingWrite && writableStream) {
            // Stream directly to disk — 0 RAM buildup!
            await writableStream.write(event.data);
        } else {
            // Fallback — accumulate in memory
            receiveChunks.push(event.data);
        }

        receivedSize += event.data.byteLength;
        const progress = Math.floor((receivedSize / receiveFileSize) * 100);
        useStore.setState({ transferStatus: "transferring", progress });
    }
}

export default useStore;