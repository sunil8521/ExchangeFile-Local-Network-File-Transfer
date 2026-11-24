import { io, Socket } from "socket.io-client";
import useStore from "../store/useStore";
const SOCKET_URL = `http://${window.location.hostname}:4000`;

// const SOCKET_URL = `https://exchangefile.onrender.com`;
let socket: Socket | null = null;

export const getSocket = (): Socket => {
    if (!socket) {
        socket = io(SOCKET_URL, {
            autoConnect: false,
            transports: ["websocket"],
        }
        )


        useStore.getState().SetupListeners(socket)

    }
    return socket
}

export const lostSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}