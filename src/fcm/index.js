const crypto = require('crypto');
const request = require('request-promise');
const { escape } = require('../utils/base64');

const FIREBASE_INSTALLATION =
  'https://firebaseinstallations.googleapis.com/v1/';
const FCM_REGISTRATION = 'https://fcmregistrations.googleapis.com/v1/';
const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';

module.exports = { installFCM, registerFCM };

function generateFirebaseFID() {
  // A valid FID has exactly 22 base64 characters, which is 132 bits, or 16.5
  // bytes. our implementation generates a 17 byte array instead.
  const fid = crypto.randomBytes(17);

  // Replace the first 4 random bits with the constant FID header of 0b0111.
  fid[0] = 0b01110000 + fid[0] % 0b00010000;

  return fid.toString('base64');
}

async function installFCM(config) {
  const response = await request({
    url : `${FIREBASE_INSTALLATION}projects/${
      config.firebase.projectID
    }/installations`,
    method  : 'POST',
    headers : {
      'x-firebase-client' : btoa(
        JSON.stringify({ heartbeats : [], version : 2 })
      ).toString('base64'),
      'x-goog-api-key' : config.firebase.apiKey,
    },
    body : {
      appId       : config.firebase.appID,
      authVersion : 'FIS_v2',
      fid         : generateFirebaseFID(),
      sdkVersion  : 'w:0.6.4',
    },
    json : true,
  });
  return response;
}

async function registerFCM(config) {
  const keys = await createKeys();
  const response = await request({
    url : `${FCM_REGISTRATION}projects/${
      config.firebase.projectID
    }/registrations`,
    method  : 'POST',
    headers : {
      'x-goog-api-key'                     : config.firebase.apiKey,
      'x-goog-firebase-installations-auth' : config.authToken,
    },
    body : {
      web : {
        applicationPubKey : config.vapidKey,
        auth              : keys.authSecret
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_'),
        endpoint : `${FCM_ENDPOINT}/${config.token}`,
        p256dh   : keys.publicKey
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_'),
      },
    },
    json : true,
  });
  return {
    keys,
    fcm : response,
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
        privateKey : escape(dh.getPrivateKey('base64')),
        publicKey  : escape(dh.getPublicKey('base64')),
        authSecret : escape(buf.toString('base64')),
      });
    });
  });
}
