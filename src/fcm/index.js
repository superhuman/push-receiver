const crypto = require('crypto');
const request = require('request-promise');
const log = require('electron-log');
const { escape } = require('../utils/base64');

log.transports.console.level = 'info';
log.transports.file.level = 'info';

const FCM_SUBSCRIBE = 'https://fcm.googleapis.com/fcm/connect/subscribe';
const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';

module.exports = registerFCM;

async function registerFCM({ senderId, token }) {
  const keys = await createKeys();
  log.info('CREATED KEYS', keys)
  const response = await request({
    url     : FCM_SUBSCRIBE,
    method  : 'POST',
    headers : {
      'Content-Type' : 'application/x-www-form-urlencoded',
    },
    form : {
      authorized_entity : senderId,
      endpoint          : `${FCM_ENDPOINT}/${token}`,
      encryption_key    : keys.publicKey,
      encryption_auth : keys.authSecret
    },
  });
  return {
    keys,
    fcm : JSON.parse(response),
  };
}

function createKeys() {
  return new Promise((resolve, reject) => {
    const dh = crypto.createECDH('prime256v1');
    dh.generateKeys();
    crypto.randomBytes(16, (err, buf) => {
      if (err) {
        return reject(err);
      }
      return resolve({
        privateKey : dh.getPrivateKey('base64'),
        publicKey  : dh.getPublicKey('base64'),
        authSecret : buf.toString('base64'),
      });
    });
  });
}
