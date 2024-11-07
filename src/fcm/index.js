const crypto = require('crypto');
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
  const response = await fetch(`${FIREBASE_INSTALLATION}projects/${config.firebase.projectID}/installations`, {
    method  : 'POST',
    headers : {
      'Content-Type'      : 'application/json',
      'x-firebase-client' : btoa(JSON.stringify({ heartbeats : [], version : 2 })).toString('base64'),
      'x-goog-api-key'    : config.firebase.apiKey,
    },
    body : JSON.stringify({
      appId       : config.firebase.appID,
      authVersion : 'FIS_v2',
      fid         : generateFirebaseFID(),
      sdkVersion  : 'w:0.6.4',
    }),
  });
  return response;
}

async function registerFCM(config) {
  const keys = await createKeys();
  const response = await fetch(`${FCM_REGISTRATION}projects/${config.firebase.projectID}/registrations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.firebase.apiKey,
      'x-goog-firebase-installations-auth': config.authToken,
    },
    body: JSON.stringify({
      web: {
        applicationPubKey: config.vapidKey,
        auth: keys.authSecret
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_'),
        endpoint: `${FCM_ENDPOINT}/${config.token}`,
        p256dh: keys.publicKey
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_'),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const fcm = await response.json();

  return {
    keys,
    fcm,
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
