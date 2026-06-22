import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
export async function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scryptAsync(password, salt, KEY_LENGTH));
    return `${salt}:${derived.toString('hex')}`;
}
export async function verifyPassword(password, storedHash) {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) {
        return false;
    }
    const derived = (await scryptAsync(password, salt, KEY_LENGTH));
    const keyBuffer = Buffer.from(key, 'hex');
    if (keyBuffer.length !== derived.length) {
        return false;
    }
    return timingSafeEqual(derived, keyBuffer);
}
