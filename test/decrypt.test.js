const crypto = require('crypto');
const ece = require('http_ece');
const decrypt = require('../src/utils/decrypt');

const PAYLOAD = { title : 'Hello', body : 'World' };

function base64(buffer) {
  return buffer.toString('base64');
}

function base64Url(buffer) {
  return base64(buffer)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeReceiver() {
  const receiver = crypto.createECDH('prime256v1');
  receiver.generateKeys();
  return {
    receiver,
    keys : {
      privateKey : base64(receiver.getPrivateKey()),
      authSecret : base64(crypto.randomBytes(16)),
    },
  };
}

function encryptAesGcm(receiver, authSecret) {
  const sender = crypto.createECDH('prime256v1');
  sender.generateKeys();
  const salt = crypto.randomBytes(16);
  const rawData = ece.encrypt(Buffer.from(JSON.stringify(PAYLOAD)), {
    version    : 'aesgcm',
    dh         : base64Url(receiver.getPublicKey()),
    privateKey : sender,
    salt       : base64Url(salt),
    authSecret : authSecret,
  });
  return { rawData, senderPublicKey : sender.getPublicKey(), salt };
}

function envelope(rawData, appData) {
  return { persistentId : 'persistent-id', rawData, appData };
}

describe('decrypt', () => {
  it('decrypts a single-parameter aesgcm envelope', () => {
    const { receiver, keys } = makeReceiver();
    const message = encryptAesGcm(receiver, keys.authSecret);

    const decrypted = decrypt(
      envelope(message.rawData, [
        { key : 'crypto-key', value : `dh=${base64(message.senderPublicKey)}` },
        { key : 'encryption', value : `salt=${base64(message.salt)}` },
      ]),
      keys
    );

    expect(decrypted).toEqual(PAYLOAD);
  });

  it('decrypts when crypto-key carries extra semicolon-separated parameters', () => {
    const { receiver, keys } = makeReceiver();
    const message = encryptAesGcm(receiver, keys.authSecret);
    const vapidKey = base64Url(crypto.randomBytes(65));

    const decrypted = decrypt(
      envelope(message.rawData, [
        {
          key   : 'crypto-key',
          value : `dh=${base64(message.senderPublicKey)};p256ecdsa=${vapidKey}`,
        },
        { key : 'encryption', value : `salt=${base64(message.salt)}` },
        { key : 'content-encoding', value : 'aesgcm' },
      ]),
      keys
    );

    expect(decrypted).toEqual(PAYLOAD);
  });

  it('decrypts when entries are comma-separated and reordered', () => {
    const { receiver, keys } = makeReceiver();
    const message = encryptAesGcm(receiver, keys.authSecret);
    const vapidKey = base64Url(crypto.randomBytes(65));

    const decrypted = decrypt(
      envelope(message.rawData, [
        {
          key   : 'crypto-key',
          value : `p256ecdsa=${vapidKey},dh=${base64(message.senderPublicKey)}`,
        },
        {
          key   : 'encryption',
          value : `keyid=p256dh;salt=${base64(message.salt)}`,
        },
      ]),
      keys
    );

    expect(decrypted).toEqual(PAYLOAD);
  });

  it('decrypts an aes128gcm envelope with keys in the binary header', () => {
    const { receiver, keys } = makeReceiver();
    const sender = crypto.createECDH('prime256v1');
    sender.generateKeys();
    const rawData = ece.encrypt(Buffer.from(JSON.stringify(PAYLOAD)), {
      version    : 'aes128gcm',
      dh         : base64Url(receiver.getPublicKey()),
      privateKey : sender,
      salt       : base64Url(crypto.randomBytes(16)),
      authSecret : keys.authSecret,
    });

    const decrypted = decrypt(
      envelope(rawData, [{ key : 'content-encoding', value : 'aes128gcm' }]),
      keys
    );

    expect(decrypted).toEqual(PAYLOAD);
  });

  it('reports parameter names but never values when dh is absent', () => {
    const { keys } = makeReceiver();
    const vapidKey = base64Url(crypto.randomBytes(65));

    let error;
    try {
      decrypt(
        envelope(Buffer.from('00', 'hex'), [
          { key : 'crypto-key', value : `p256ecdsa=${vapidKey}` },
          { key : 'encryption', value : 'salt=c2FsdHNhbHRzYWx0c2FsdA==' },
        ]),
        keys
      );
    } catch (e) {
      error = e;
    }

    expect(error.message).toBe(
      'crypto-key has no dh parameter (params: p256ecdsa)'
    );
    expect(error.message).not.toContain(vapidKey);
    // Matches Client's isReportableDecryptionError list, so the message is
    // acked instead of redelivered. Must NOT contain 'crypto-key is missing',
    // which consumers treat as an expected plaintext control stanza.
    expect(error.message).toContain('has no dh parameter');
    expect(error.message).not.toContain('crypto-key is missing');
  });

  it('reports a missing salt parameter without echoing values', () => {
    const { receiver, keys } = makeReceiver();
    const message = encryptAesGcm(receiver, keys.authSecret);

    let error;
    try {
      decrypt(
        envelope(message.rawData, [
          { key : 'crypto-key', value : `dh=${base64(message.senderPublicKey)}` },
          { key : 'encryption', value : base64Url(message.salt) },
        ]),
        keys
      );
    } catch (e) {
      error = e;
    }

    expect(error.message).toBe('encryption has no salt parameter (params: ?)');
    expect(error.message).toContain('has no salt parameter');
    expect(error.message).not.toContain('salt is missing');
  });
});
