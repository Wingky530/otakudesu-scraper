import crypto from 'crypto';

export const ALLANIME_API = 'https://api.allanime.day/api';
export const ALLANIME_BASE = 'https://allanime.day';
export const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
export const REFERER = 'https://youtu-chan.com';
export const DECRYPTION_KEY_STRING = 'Xot36i3lK3:v1';

const HEX_MAP: Record<string, string> = {
  '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O',
  '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
  '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o',
  '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
  '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9',
  '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%'
};

export function decryptSourceUrl(url: string): string {
  if (!url.startsWith('--')) return url;
  const hexString = url.slice(2);
  let decoded = '';
  for (let i = 0; i < hexString.length; i += 2) {
    const part = hexString.substring(i, i + 2);
    decoded += HEX_MAP[part] || '';
  }
  return decoded.replace('/clock', '/clock.json');
}

export function decryptPayload(encryptedBase64: string): string {
  const buf = Buffer.from(encryptedBase64, 'base64');
  const iv = buf.subarray(1, 13);
  const ivHex = iv.toString('hex');
  const ctrHex = ivHex + '00000002';
  const ciphertext = buf.subarray(13, buf.length - 16);
  const key = crypto.createHash('sha256').update(DECRYPTION_KEY_STRING).digest();
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, Buffer.from(ctrHex, 'hex'));
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}
