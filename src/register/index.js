const uuidv4 = require('uuid/v4');
const { register: registerGCM } = require('../gcm');
const { installFCM, registerFCM } = require('../fcm');

module.exports = register;

async function register(config) {
  // Should be unique by app - One GCM registration/token by app/appId
  const appId = `wp:receiver.push.com#${uuidv4()}`;
  const subscription = await registerGCM(appId);
  const installation = await installFCM(config);
  const result = await registerFCM({
    ...config,
    authToken : installation.authToken.token,
    token     : subscription.token,
  });
  // Need to be saved by the client
  return Object.assign({}, result, { gcm : subscription });
}
