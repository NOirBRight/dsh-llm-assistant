/** Decode assistant seat RPC and run it against the host's assistant port. */
import { ASSISTANT_IMAGE_ENDPOINT, ASSISTANT_SEND_ENDPOINT, ASSISTANT_ROLLOVER_ENDPOINT, ASSISTANT_SET_MODEL_ENDPOINT, ASSISTANT_SNAPSHOT_ENDPOINT, decodeImageRequest, decodeSendRequest, decodeSetModelRequest, isRecord, } from "./contract.js";
export async function handleAssistantRpc(port, endpoint, payload, extras = {}) {
    if (endpoint === ASSISTANT_SNAPSHOT_ENDPOINT) {
        return { ok: true, value: port.snapshot() };
    }
    if (endpoint === ASSISTANT_SEND_ENDPOINT) {
        const request = decodeSendRequest(payload);
        if (request === undefined)
            return fail('bad-request', 'invalid assistant/send request: expected a non-empty text field');
        if ((request.images?.length ?? 0) > 0 && extras.imageCapable?.() === false) {
            return fail('MODEL_DOES_NOT_SUPPORT_IMAGES', 'Model does not support image input.');
        }
        extras.noteCurrentTask?.(request.currentTask);
        const reply = await port.send(request.text, request.images);
        if (!reply.sent)
            return fail('send-failed', reply.error);
        return { ok: true, value: reply };
    }
    if (endpoint === ASSISTANT_IMAGE_ENDPOINT) {
        const request = decodeImageRequest(payload);
        if (request === undefined)
            return fail('bad-request', 'invalid assistant/image request');
        const image = await port.readImage(request.attachmentId);
        if (image === undefined)
            return fail('not-found', 'image not found');
        return { ok: true, value: image };
    }
    if (endpoint === ASSISTANT_ROLLOVER_ENDPOINT) {
        if (!isRecord(payload) || Object.keys(payload).length !== 0)
            return fail('bad-request', 'invalid assistant/rollover request');
        if (extras.rollover === undefined)
            return fail('unavailable', 'new assistant conversation is not available');
        return extras.rollover();
    }
    if (endpoint === ASSISTANT_SET_MODEL_ENDPOINT) {
        const request = decodeSetModelRequest(payload);
        if (request === undefined)
            return fail('bad-request', 'invalid assistant/set-model request: expected a model id');
        if (extras.setModel === undefined)
            return fail('unavailable', 'model selection is not available');
        return extras.setModel(request.model, request.effort, request.provider);
    }
    return fail('bad-request', 'unknown assistant endpoint: ' + endpoint);
}
function fail(code, message) {
    return { ok: false, error: { code, message } };
}
//# sourceMappingURL=host-rpc.js.map