# 🛰️ ExchangeFile — Local Network File Transfer

Send files between devices on the same WiFi/LAN. No cloud, no login, no bullshit. Just open it on two devices and send.

## How it works

1. You open the app on Device A and Device B (both on same network)
2. Server groups them by IP — they auto-discover each other
3. Click "Send" on a device → pick a file → the other device gets an Accept/Reject popup
4. If accepted, WebRTC DataChannel kicks in and the file goes **directly between the two browsers**. Server never touches the file data.

## The WebRTC approach

This isn't just a naive `channel.send(file)` thing. Here's what actually happens:

**Sender side:**
- Read the file into an ArrayBuffer
- Split it into 16KB chunks
- Send chunks one by one through the DataChannel
- **Backpressure handling** — if the DataChannel's buffer fills up (`bufferedAmount > 64KB`), we pause and retry after 50ms. Without this, large files will crash the connection
- Track speed & progress in real-time

**Receiver side:**
- Collect incoming ArrayBuffer chunks into an array
- Once the sender sends a `"transfer-complete"` JSON message, we know all chunks arrived
- Reassemble into a Blob and trigger a browser download

The key thing is the **chunking + backpressure**. WebRTC DataChannels have a limited send buffer. If you try to dump a 500MB file into it all at once, it'll overflow and the connection drops. The 16KB chunk size + buffer check is what makes large files work reliably.

## Stack

- **Client**: React + Vite + TypeScript, Zustand for state, Tailwind CSS v4
- **Server**: Express + Socket.IO (only used for signaling, never touches file data)
- **WebRTC**: RTCPeerConnection + RTCDataChannel for the actual P2P transfer

## Setup

```bash
# server
cd server
pnpm install
pnpm run dev

# client (separate terminal)
cd client
pnpm install
pnpm run dev
```

Both devices need to open the client URL (usually `http://<your-local-ip>:5173`). Make sure they're on the same WiFi.

## Project structure

```
├── client/
│   ├── src/
│   │   ├── App.tsx              # main UI — setup screen, peer list, modals
│   │   ├── store/useStore.ts    # zustand store — peers, WebRTC, file transfer logic
│   │   ├── helper/socket.ts     # socket.io client singleton
│   │   └── component/
│   │       ├── Header.tsx       # top bar with connection status
│   │       └── Sidebar.tsx      # terminal-style activity logs
│   └── ...
└── server/
    └── src/index.ts             # socket.io signaling server
```

## What can be improved

The UI is functional but pretty basic right now. Some things that could make it better:

- **Better file type icons** — right now everything shows the same archive icon. Could detect images/videos/docs and show relevant icons
- **Multiple file transfer** — currently one file at a time per peer connection
- **Transfer history** — keep a log of sent/received files with timestamps
- **QR code pairing** — for when the auto-discovery isn't enough
- **Drag & drop** — drop a file onto a device card to send it
- **Mobile layout** — the current layout works on mobile but isn't optimized for it
- **Encrypted transfers** — actual E2E encryption on top of the DataChannel (DTLS already provides transport-level encryption, but could add application-level too)

## How discovery works

When you connect, the server reads your IP address and extracts the subnet (first 3 octets like `192.168.1`). All users with the same subnet get put in the same Socket.IO room. That's how devices "find" each other — same subnet = same room = you see each other.

The limitation: this only works on a simple flat network. If you have VLANs or complex routing, devices might not see each other even if they're physically close.

## License

Do whatever you want with it.
