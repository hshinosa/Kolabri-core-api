export interface SocketEmitter {
    emit(room: string, event: string, payload: unknown): void;
}

let _emitter: SocketEmitter | null = null;

export function setSocketEmitter(emitter: SocketEmitter): void {
    _emitter = emitter;
}

export function getSocketEmitter(): SocketEmitter | null {
    return _emitter;
}

export function _resetSocketEmitter(): void {
    _emitter = null;
}
