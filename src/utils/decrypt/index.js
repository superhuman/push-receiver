const crypto = require('crypto');
const ece = require('http_ece');

module.exports = decrypt;

// Web Push header values can carry several entries separated by ',' with
// parameters separated by ';' (e.g. `dh=<key>;p256ecdsa=<key>`).
function namedParam(value, name) {
  const match = value
    .split(/[;,]/)
    .map(param => param.trim())
    .find(param => param.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// Parameter names only — values may be key material and must never appear
// in error messages.
function paramNames(value) {
  return value
    .split(/[;,]/)
    .map(param => (param.includes('=') ? param.split('=')[0].trim() : '?'))
    .join(';');
}

function appDataValue(object, key) {
  const entry = object.appData.find(item => item.key === key);
  return entry ? entry.value : null;
}

// https://tools.ietf.org/html/draft-ietf-webpush-encryption-03 (aesgcm)
// https://tools.ietf.org/html/rfc8291 (aes128gcm)
function decrypt(object, keys) {
  const receiver = crypto.createECDH('prime256v1');
  receiver.setPrivateKey(keys.privateKey, 'base64');

  // In aes128gcm the salt and sender public key travel in the payload's
  // binary header rather than in appData values.
  if (appDataValue(object, 'content-encoding') === 'aes128gcm') {
    const decrypted = ece.decrypt(object.rawData, {
      version    : 'aes128gcm',
      authSecret : keys.authSecret,
      privateKey : receiver,
    });
    return JSON.parse(decrypted);
  }

  const cryptoKey = appDataValue(object, 'crypto-key');
  if (!cryptoKey) throw new Error('crypto-key is missing');
  const salt = appDataValue(object, 'encryption');
  if (!salt) throw new Error('salt is missing');

  const dh = namedParam(cryptoKey, 'dh');
  // Distinct from the bare 'crypto-key is missing'/'salt is missing' above:
  // those mark plaintext control stanzas, while these mark encrypted messages
  // whose parameters we could not parse. Client treats both as reportable.
  if (!dh) {
    throw new Error(
      `crypto-key has no dh parameter (params: ${paramNames(cryptoKey)})`
    );
  }
  const saltValue = namedParam(salt, 'salt');
  if (!saltValue) {
    throw new Error(
      `encryption has no salt parameter (params: ${paramNames(salt)})`
    );
  }

  const decrypted = ece.decrypt(object.rawData, {
    version    : 'aesgcm',
    authSecret : keys.authSecret,
    dh         : dh,
    privateKey : receiver,
    salt       : saltValue,
  });
  return JSON.parse(decrypted);
}
