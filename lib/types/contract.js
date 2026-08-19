/**
 * Host/client RPC contract for the resident assistant seat (T1.2).
 *
 * The assistant session is owned by the host plugin (one session, id persisted
 * since T1.1), so requests carry no sessionId — the host resolves its own
 * assistant. Transport is the Connection generic RPC: the client POSTs
 * `{type:'client-request', rpcId, method, payload}` to `/{channel}/{endpoint}`
 * and the host replies with `{type:'server-response', rpcId, result}`.
 */
export const ASSISTANT_RPC_CHANNEL = '/llm-assistant';
export const ASSISTANT_SNAPSHOT_ENDPOINT = 'assistant/snapshot';
export const ASSISTANT_SEND_ENDPOINT = 'assistant/send';
export const ASSISTANT_SET_MODEL_ENDPOINT = 'assistant/set-model';
export const ASSISTANT_IMAGE_ENDPOINT = 'assistant/image';
export const ASSISTANT_ROLLOVER_ENDPOINT = 'assistant/rollover';
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function decodeSendRequest(payload) {
    if (!isRecord(payload))
        return undefined;
    if (typeof payload.text !== 'string')
        return undefined;
    const text = payload.text;
    const images = decodeSendImages(payload.images);
    if (text.trim() === '' && images.length === 0)
        return undefined;
    const currentTask = decodeTaskAnchor(payload.currentTask);
    if (payload.currentTask !== undefined && currentTask === undefined)
        return undefined;
    return {
        text,
        ...(images.length === 0 ? {} : { images }),
        ...(currentTask === undefined ? {} : { currentTask }),
    };
}
function decodeTaskAnchor(value) {
    if (!isRecord(value) || typeof value.sessionId !== 'string' || value.sessionId.trim() === '')
        return undefined;
    if (value.label !== undefined && typeof value.label !== 'string')
        return undefined;
    return { sessionId: value.sessionId, ...(typeof value.label === 'string' && value.label.trim() !== '' ? { label: value.label } : {}) };
}
export function decodeImageRequest(payload) {
    if (!isRecord(payload))
        return undefined;
    if (typeof payload.attachmentId !== 'string' || payload.attachmentId.trim() === '')
        return undefined;
    return { attachmentId: payload.attachmentId };
}
export function decodeSetModelRequest(payload) {
    if (!isRecord(payload))
        return undefined;
    if (typeof payload.model !== 'string' || payload.model.trim() === '')
        return undefined;
    return {
        model: payload.model,
        ...(typeof payload.provider === 'string' && payload.provider.trim() !== '' ? { provider: payload.provider } : {}),
        ...(typeof payload.effort === 'string' && payload.effort.trim() !== '' ? { effort: payload.effort } : {}),
    };
}
function decodeSendImages(value) {
    if (!Array.isArray(value))
        return [];
    const images = [];
    for (const entry of value) {
        if (!isRecord(entry))
            continue;
        if (typeof entry.name !== 'string' || entry.name.trim() === '')
            continue;
        if (typeof entry.mediaType !== 'string' || !entry.mediaType.startsWith('image/'))
            continue;
        if (typeof entry.dataBase64 !== 'string' || entry.dataBase64.length === 0)
            continue;
        images.push({ name: entry.name, mediaType: entry.mediaType, dataBase64: entry.dataBase64 });
    }
    return images;
}
//# sourceMappingURL=contract.js.map