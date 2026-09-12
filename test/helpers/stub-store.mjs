import crypto from 'node:crypto';
export const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
